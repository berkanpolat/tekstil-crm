-- =====================================================================
-- P8B — Eşleşmeyen katalog kodu çözümü (madde 20).
-- ADDİTİF: birebir eşleşme davranışı AYNEN korunur; tolerans yalnız birebir
-- BAŞARISIZSA devreye girer. Yakın eşleşme OTOMATİK bağlamaz (yalnız öneri).
--
-- İki normalize seviyesi (kasıtlı ayrım):
--   • Otomatik tolerans (madde 3): normalize_tr — büyük/küçük harf + baş/son boşluk
--     + Türkçe-güvenli (İ/ı). İç ayracı KORUR → "ST-26" ≠ "ST26".
--   • Öneri anahtarı (madde 4): catalog_code_key = normalize_tr + tüm boşlukları at
--     → "ST-26SS130010" = "ST26SS130010". Yalnız suggest_catalog_products'ta; öneri.
--
-- MEVCUT ve DEĞİŞMEYEN: resolve_catalog_item, create_catalog_product_and_link
--   (20260805000000_unmatched_catalog.sql) — bu migration onlara DOKUNMAZ.
-- =====================================================================

-- ---- Öneri anahtarı: normalize_tr + iç boşluk/ayraçları da at ----
create or replace function public.catalog_code_key(input text)
returns text language sql immutable as $$
  select replace(coalesce(public.normalize_tr(input), ''), ' ', '');
$$;
comment on function public.catalog_code_key(text) is
  'Katalog kodu ÖNERİ anahtarı: normalize_tr + tüm boşluk/ayraçları at (ST-26SS130010 = ST26SS130010). Yalnız öneri; otomatik bağlamada KULLANILMAZ.';

-- ---- Yakın eşleşme önerisi (madde 4) — ASLA otomatik bağlamaz ----
-- Uzantı (pg_trgm/fuzzystrmatch) gerektirmeyen deterministik sıralama:
--   0) anahtar birebir eşit  1) biri diğerinin öneki  2) biri diğerini içerir
-- sonra uzunluk farkı, sonra kod. Görsel/maliyet gibi hassas alan döndürmez.
create or replace function public.suggest_catalog_products(p_code text, p_limit int default 5)
returns table(id bigint, code text, name text)
language sql stable security definer set search_path = public as $$
  with k as (select public.catalog_code_key(p_code) key)
  select cp.id, cp.code, cp.name
  from catalog_products cp, k
  where cp.deleted_at is null
    and k.key <> ''
    and (
      public.catalog_code_key(cp.code) = k.key
      or public.catalog_code_key(cp.code) like k.key || '%'
      or k.key like public.catalog_code_key(cp.code) || '%'
      or position(k.key in public.catalog_code_key(cp.code)) > 0
      or position(public.catalog_code_key(cp.code) in k.key) > 0
    )
  order by
    case
      when public.catalog_code_key(cp.code) = k.key then 0
      when public.catalog_code_key(cp.code) like k.key || '%' or k.key like public.catalog_code_key(cp.code) || '%' then 1
      else 2
    end,
    abs(length(public.catalog_code_key(cp.code)) - length((select key from k))),
    cp.code
  limit greatest(1, coalesce(p_limit, 5));
$$;
grant execute on function public.suggest_catalog_products(text, int) to authenticated;
revoke execute on function public.suggest_catalog_products(text, int) from anon;

-- ---- intake_process: katalog eşleştirmeye ADDİTİF tolerans (madde 3) ----
-- SADECE 6. adımdaki eşleştirme bloğu değişti: birebir tutmazsa normalize_tr ile
-- TEK tolerant deneme. Diğer her şey 20260804000000'daki ile AYNIDIR.
create or replace function public.intake_process(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
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
  for v_prod in select value from jsonb_array_elements(v_products) loop
    declare v_cp record;
    begin
      -- 6a) BİREBİR eşleşme — davranış AYNEN korunur (madde 1: additif).
      select id, code, name into v_cp from catalog_products where code = trim(v_prod->>'code') and deleted_at is null limit 1;
      -- 6b) Birebir tutmazsa TEK tolerant deneme (madde 3): büyük/küçük harf +
      --     baş/son boşluk + Türkçe-güvenli. Ham upper()/lower() DEĞİL → normalize_tr.
      --     İç ayraç farkı (ST-26 vs ST26) burada eşleşmez; o yalnız ÖNERİ olur.
      if v_cp.id is null then
        select id, code, name into v_cp from catalog_products
          where deleted_at is null and public.normalize_tr(code) = public.normalize_tr(v_prod->>'code')
          limit 1;
      end if;
      if v_cp.id is not null then
        insert into operation_catalog_items (operation_id, catalog_product_id, catalog_product_code, label)
        values (v_op_id, v_cp.id, v_cp.code, coalesce(nullif(trim(v_prod->>'name'),''), v_cp.name));
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
end $$;

-- ---- manager_interventions: "ürün eşleşmeyen talep" satırı (madde 1, panelde görünürlük) ----
-- ADDİTİF: mevcut 6 satır aynen kalır; 7. satır eklenir (count=0 ise UI'de gizlenir).
create or replace function public.manager_interventions()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_fin boolean := public.has_permission('finance.view');
  v jsonb;
begin
  perform metrics.guard(null);   -- reports.view şart
  select coalesce(jsonb_agg(x order by ord), '[]'::jsonb) into v from (
    select 1 ord, 'sla_gecti' key, 'Teklif süresi geçen talep' label, '/talepler' href,
      (select count(*) from operations o where o.deleted_at is null and o.cancelled_at is null and o.request_status_id not in (7,8)
        and o.sla_deadline < now() and not exists (select 1 from quotes q where q.operation_id=o.id and q.deleted_at is null)) cnt
    union all
    select 2, 'cevap_36', '36 saati aşan cevapsız teklif', '/teklifler',
      (select count(*) from quotes q join operations o on o.id=q.operation_id
        where q.deleted_at is null and q.responded_at is null and q.rejection_reason_id is null and q.created_at < now()-interval '36 hours'
        and o.deleted_at is null and o.cancelled_at is null and o.request_status_id not in (7,8))
    union all
    select 3, 'sahipsiz', 'Sahipsiz talep (havuz)', '/talepler',
      (select count(*) from operations o where o.deleted_at is null and o.cancelled_at is null and o.request_status_id not in (7,8)
        and o.owner_id is null and not exists (select 1 from quotes q where q.operation_id=o.id and q.deleted_at is null))
    union all
    select 4, 'termin_yakin', 'Termine yaklaşan üretim', '/siparisler',
      (select count(*) from orders ord join operations o on o.id=ord.operation_id
        join order_statuses os on os.id=ord.status_id and os.key='uretimde'
        where ord.deleted_at is null and o.deleted_at is null and ord.promised_delivery is not null
        and ord.promised_delivery <= (now()+interval '3 days')::date)
    union all
    select 5, 'numune_3tur', '3. tura ulaşan numune', '/numuneler',
      (select count(*) from samples s join operations o on o.id=s.operation_id
        where s.deleted_at is null and coalesce(s.revision_round,1) >= 3
        and s.status_id not in (7,8,10,15) and o.deleted_at is null and o.cancelled_at is null)
    union all
    select 6, 'tahsilat_gecikti', 'Geciken tahsilat', '/finans',
      (case when v_fin then (select count(*) from orders ord where ord.deleted_at is null and ord.balance_overdue_at is not null) else 0 end)
    union all
    -- P8B — siteden gelip katalogla eşleşmeyen (catalog_product_id IS NULL) ürünlü talepler.
    select 7, 'urun_eslesmedi', 'Ürün eşleşmeyen talep', '/talepler',
      (select count(distinct o.id) from operation_catalog_items oci join operations o on o.id=oci.operation_id
        where oci.catalog_product_id is null and o.deleted_at is null and o.cancelled_at is null and o.request_status_id not in (7,8))
  ) t(ord, key, label, href, cnt)
  cross join lateral (select jsonb_build_object('key',key,'label',label,'href',href,'count',cnt) x) j
  where cnt > 0;
  return v;
end $$;

grant execute on function public.manager_interventions() to authenticated;
revoke execute on function public.manager_interventions() from anon;
