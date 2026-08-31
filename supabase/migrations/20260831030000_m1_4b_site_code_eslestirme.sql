-- =====================================================================
-- M1.4b — Kod eşleştirmesi site_code'a da baksın
--
-- M1.4a ile ürünlere site_code eklendi. Müşteri talep formuna SİTEDE GÖRDÜĞÜ kodu
-- yazıyor (ST-26SS300008); CRM iç kodu farklı olabiliyor (YS-8ULK8Z). Eşleştirme
-- yalnız `code`'a baktığı için 58 talep satırı boşta kalmıştı (M1.4a'da bağlandı).
-- Bundan sonrası için üç fonksiyon güncelleniyor:
--   • intake_process        — otomatik bağlama artık iki kolona da bakar
--   • suggest_catalog_products — öneri listesi site kodunu da tarar
--   • resolve_catalog_item  — elle çözümde müşteriye görünen kodu saklar
--
-- Davranış korunur: birebir eşleşme önce, tolerant deneme sonra; iç ayraç farkı
-- (ST-26 vs ST26) hâlâ YALNIZ öneri — asla otomatik bağlamaz.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.intake_process(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ref text := nullif(trim(p->>'client_reference'),'');
  v_name text := nullif(trim(p->>'full_name'),'');
  v_city text := nullif(trim(p->>'city'),'');
  v_phone text := public.intake_normalize_phone(p->>'phone');
  v_email text := nullif(trim(p->>'email'),'');
  v_mode text := lower(coalesce(p->>'mode',''));
  v_source text := nullif(trim(p->>'source'),'');
  v_note text := nullif(trim(p->>'note'),'');
  v_products jsonb := coalesce(p->'selected_products','[]'::jsonb);
  v_cust_id bigint; v_lead_id bigint; v_op_id bigint; v_op_code text;
  v_prov_id bigint; v_open_op bigint; v_prod_source text; v_dm record;
  v_unmatched text := ''; v_matched int := 0; v_prod jsonb; v_cpid bigint; v_draft bigint;
begin
  -- idempotency
  if v_ref is not null then
    select id, code into v_op_id, v_op_code from operations where client_reference = v_ref limit 1;
    if v_op_id is not null then
      return jsonb_build_object('ok',true,'code',v_op_code,'operation_id',v_op_id,'idempotent',true);
    end if;
  end if;

  -- 1) Eşleştir: önce customer sonra lead (find_duplicates ikisini de tarar)
  for v_dm in select * from find_duplicates(v_name, v_phone) loop
    if v_dm.entity_type = 'customer' then v_cust_id := v_dm.id; exit;
    elsif v_dm.entity_type = 'lead' and v_lead_id is null then v_lead_id := v_dm.id; end if;
  end loop;

  -- 2) Eşleşme yoksa yeni potansiyel (lead) → müşteriye çevir (kullanıcı kararı)
  if v_cust_id is null then
    if v_lead_id is null then
      if v_name is null and v_phone is null then
        return jsonb_build_object('ok',false,'error','contact_required');
      end if;
      insert into leads (status_id, company_name, full_name, city, source_id)
      values ((select id from lead_statuses where key='yeni'), v_name, v_name, v_city,
              (select id from lead_sources where key='web_sitesi'))
      returning id into v_lead_id;
      if v_phone is not null then insert into contact_points (entity_type, entity_id, type, value, is_primary) values ('lead', v_lead_id, 'phone', v_phone, true); end if;
      if v_email is not null then insert into contact_points (entity_type, entity_id, type, value, is_primary) values ('lead', v_lead_id, 'email', v_email, v_phone is null); end if;
    end if;
    v_cust_id := public.convert_lead_to_customer(v_lead_id, (select id from customer_types where key='yurtici'));
  end if;

  -- 3) İl (şehir adından, en iyi çaba)
  select id into v_prov_id from provinces where lower(name) = lower(v_city) limit 1;
  v_prod_source := case when v_mode = 'upload' then 'gorsel_yukleme' else 'katalogdan_secim' end;

  -- 4) Aynı müşterinin AÇIK talebi var mı? (E.4 birleştirme önerisi için)
  select o.id into v_open_op from operations o
    where o.customer_id = v_cust_id and o.deleted_at is null and o.merged_into is null
      and o.stage_id not in (select id from operation_stages where is_terminal)
    order by o.created_at limit 1;

  -- 5) Operasyon (TAS + SLA + havuz açık dosyası trigger'larda; sahipsiz)
  insert into operations (customer_id, source, channel_id, landing_source, product_source, description, province_id, client_reference, possible_merge_with, requested_at)
  values (v_cust_id, 'web_sitesi', (select id from request_channels where key='web_sitesi'),
          v_source, v_prod_source, v_note, v_prov_id, v_ref, v_open_op, now())
  returning id, code into v_op_id, v_op_code;

  -- 6) Katalog kalemleri (koda göre eşleştir; eşleşmeyen nota)
  --    M1.4a: müşteri sitede gördüğü kodu (site_code, ör. ST-26SS300008) yazıyor;
  --    CRM iç kodu farklı olabiliyor (code, ör. YS-8ULK8Z). Bu yüzden eşleştirme
  --    HER İKİ kolona bakar ve çakışmada site_code'u önceler. Kaydedilen kod da
  --    müşteriye görünen koddur — yazışmada aynı kodu konuşalım.
  for v_prod in select value from jsonb_array_elements(v_products) loop
    declare v_cp record;
    begin
      -- 6a) BİREBİR eşleşme — davranış AYNEN korunur (madde 1: additif).
      select id, code, name, site_code into v_cp from catalog_products
        where deleted_at is null and trim(v_prod->>'code') in (code, site_code)
        order by (site_code = trim(v_prod->>'code')) desc limit 1;
      -- 6b) Birebir tutmazsa TEK tolerant deneme (madde 3): büyük/küçük harf +
      --     baş/son boşluk + Türkçe-güvenli. Ham upper()/lower() DEĞİL → normalize_tr.
      --     İç ayraç farkı (ST-26 vs ST26) burada eşleşmez; o yalnız ÖNERİ olur.
      if v_cp.id is null then
        select id, code, name, site_code into v_cp from catalog_products
          where deleted_at is null
            and public.normalize_tr(v_prod->>'code') in (public.normalize_tr(code), public.normalize_tr(site_code))
          order by (public.normalize_tr(site_code) = public.normalize_tr(v_prod->>'code')) desc
          limit 1;
      end if;
      if v_cp.id is not null then
        insert into operation_catalog_items (operation_id, catalog_product_id, catalog_product_code, label)
        values (v_op_id, v_cp.id, coalesce(v_cp.site_code, v_cp.code), coalesce(nullif(trim(v_prod->>'name'),''), v_cp.name));
        v_matched := v_matched + 1;
      else
        -- Eşleşmeyen: kalem olarak EKLENİR ama catalog_product_id NULL (kartta çözülür).
        insert into operation_catalog_items (operation_id, catalog_product_id, catalog_product_code, label)
        values (v_op_id, null, trim(v_prod->>'code'), nullif(trim(v_prod->>'name'),''));
        v_unmatched := v_unmatched || (v_prod->>'code') || ' ';
      end if;
    end;
  end loop;

  -- 7) Katalogdan seçimde taslak teklif (durum DEĞİŞMEZ)
  if v_prod_source = 'katalogdan_secim' and v_matched > 0 then
    v_draft := public.build_draft_quote(v_op_id);
  end if;

  return jsonb_build_object('ok',true,'code',v_op_code,'operation_id',v_op_id,'customer_id',v_cust_id,
    'possible_merge_with', v_open_op, 'matched_products', v_matched, 'unmatched', trim(v_unmatched),
    'draft_quote_document_id', v_draft, 'idempotent', false);
end $function$;

-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.suggest_catalog_products(p_code text, p_limit integer DEFAULT 5)
 RETURNS TABLE(id bigint, code text, name text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  -- Ürünün iki kodu olabilir (iç kod + site kodu); ikisi de aranır, eşleşen kod döner.
  with k as (select public.catalog_code_key(p_code) key),
  aday as (
    select cp.id, cp.code, cp.name, public.catalog_code_key(cp.code) ck from catalog_products cp where cp.deleted_at is null
    union all
    select cp.id, cp.site_code, cp.name, public.catalog_code_key(cp.site_code) from catalog_products cp
      where cp.deleted_at is null and cp.site_code is not null and cp.site_code is distinct from cp.code
  )
  select distinct on (a.id) a.id, a.code, a.name
  from aday a, k
  where k.key <> '' and a.ck <> ''
    and (a.ck = k.key or a.ck like k.key || '%' or k.key like a.ck || '%'
         or position(k.key in a.ck) > 0 or position(a.ck in k.key) > 0)
  order by a.id,
    case when a.ck = k.key then 0
         when a.ck like k.key || '%' or k.key like a.ck || '%' then 1
         else 2 end,
    abs(length(a.ck) - length((select key from k)))
  limit greatest(1, coalesce(p_limit, 5));
$function$;

-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_catalog_item(p_item_id bigint, p_product_id bigint)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_code text; v_name text;
begin
  if not exists (select 1 from users u join roles r on r.id=u.role_id where u.id=auth.uid() and r.key in ('owner','admin','manager','sales')) then
    raise exception 'Yetkiniz yok.' using errcode='42501';
  end if;
  -- Müşteriye görünen kodu sakla: yazışmada ve teklifte aynı kodu konuşalım.
  select coalesce(site_code, code), name into v_code, v_name
    from catalog_products where id = p_product_id and deleted_at is null;
  if v_code is null then raise exception 'Katalog ürünü bulunamadı.' using errcode='P0002'; end if;
  update operation_catalog_items
    set catalog_product_id = p_product_id, catalog_product_code = v_code, label = coalesce(label, v_name)
    where id = p_item_id;
end $function$;
