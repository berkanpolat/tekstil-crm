-- Talep alma eşleştirmesi: TELEFON öncelikli, tam isim uyarılı, benzer isim yalnız not.
-- Karar: Tuna, 21 Eyl 2026 ("siteden yeni talep %99 yeni müşteridir; yine de isim+telefon, özellikle telefon").
-- Değişen yalnız 1) ve 2) bölümleri; gerisi (il, açık talep, operasyon, kalemler, taslak teklif) aynen.
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
  v_esleme_notu text; v_benzer_notu text;
begin
  -- idempotency
  if v_ref is not null then
    select id, code into v_op_id, v_op_code from operations where client_reference = v_ref limit 1;
    if v_op_id is not null then
      return jsonb_build_object('ok',true,'code',v_op_code,'operation_id',v_op_id,'idempotent',true);
    end if;
  end if;

  -- 1) Eşleştir — KARAR (21 Eyl 2026): TELEFON öncelikli, sonra TAM İSİM (uyarılı),
  --    benzer isim ASLA otomatik bağlamaz (yalnız not). Gerekçe: 471 talepte 1 yanlış
  --    bağlama (aynı isim, farklı numara) görüldü; find_duplicates'ta telefon ve isim
  --    aynı öncelikteydi ve %75 benzerlik de bağlıyordu.
  -- 1a) Telefon: contact_points üzerinden; silinmemiş müşteri > lead
  if v_phone is not null then
    select cp.entity_id into v_cust_id from contact_points cp
      join customers c on c.id = cp.entity_id and c.deleted_at is null
      where cp.entity_type = 'customer' and cp.type in ('phone','whatsapp') and cp.value_normalized = v_phone
      order by cp.is_primary desc, cp.entity_id limit 1;
    if v_cust_id is null then
      select cp.entity_id into v_lead_id from contact_points cp
        join leads l on l.id = cp.entity_id and l.deleted_at is null
        where cp.entity_type = 'lead' and cp.type in ('phone','whatsapp') and cp.value_normalized = v_phone
        order by cp.is_primary desc, cp.entity_id limit 1;
    end if;
  end if;
  -- 1b) Telefon tutmadı → TAM isim (normalize edilmiş, aynı çekirdek). Bağlanır ama uyarı düşer,
  --     yeni numara müşteriye ikincil telefon olarak eklenir (bir sonraki talep telefonla bulunsun).
  if v_cust_id is null and v_lead_id is null and v_name is not null then
    for v_dm in select * from find_duplicates(v_name, null) loop
      if v_dm.reason = 'aynı firma adı' then
        if v_dm.entity_type = 'customer' then v_cust_id := v_dm.id; v_esleme_notu := '[Eşleştirme: aynı isim, FARKLI telefon — kontrol edin]'; exit;
        elsif v_dm.entity_type = 'lead' and v_lead_id is null then v_lead_id := v_dm.id; v_esleme_notu := '[Eşleştirme: aynı isim, FARKLI telefon — kontrol edin]'; end if;
      elsif v_dm.reason like '%benzer%' and v_benzer_notu is null then
        -- 1c) Benzer isim: bağlama, yalnız not
        v_benzer_notu := '[Olası aynı müşteri: ' || coalesce(v_dm.title,'') || case when v_dm.code is not null then ' (' || v_dm.code || ')' else '' end || ']';
      end if;
    end loop;
    if v_cust_id is not null and v_phone is not null then
      insert into contact_points (entity_type, entity_id, type, value, is_primary)
      select 'customer', v_cust_id, 'phone', v_phone, false
      where not exists (select 1 from contact_points where entity_type='customer' and entity_id=v_cust_id and type in ('phone','whatsapp') and value_normalized = v_phone);
    end if;
  end if;
  if v_esleme_notu is not null or v_benzer_notu is not null then
    v_note := concat_ws(E'\n', v_note, v_esleme_notu, v_benzer_notu);
  end if;

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
end $function$

;
