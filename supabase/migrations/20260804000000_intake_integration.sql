-- =====================================================================
-- tekstilas.com talep entegrasyonu (E.1/E.2/E.4 DB tarafı).
-- İş mantığı test edilebilir olsun diye edge fn değil, RPC'de:
--   intake_process(jsonb) → eşleştir/lead-çevir/operasyon/katalog/taslak-teklif.
-- Edge fn ince kalır: gizli-anahtar + dosya indir/yükle + bu RPC'yi çağır.
-- =====================================================================

-- ---- Şema ekleri ----
alter table public.documents add column if not exists is_draft boolean not null default false;
alter table public.operations add column if not exists possible_merge_with bigint references public.operations(id);
alter table public.operations add column if not exists merged_into bigint references public.operations(id);
create index if not exists operations_possible_merge_idx on public.operations(possible_merge_with) where possible_merge_with is not null;
create index if not exists documents_draft_idx on public.documents(is_draft) where is_draft;

insert into public.settings (key, value, category, description) values
  ('intake.draft_quote_qty', '50'::jsonb, 'intake', 'Katalogdan gelen taleplerde taslak teklif için varsayılan adet kademesi.'),
  ('intake.draft_margin_percent', '40'::jsonb, 'intake', 'Taslak teklifte maliyet üzerine uygulanan varsayılan kâr marjı (%).'),
  ('intake.max_file_mb', '50'::jsonb, 'intake', 'Talep ekindeki tek dosya için üst sınır (MB). Aşan dosya nota yazılır.')
on conflict (key) do nothing;

-- ---- Telefon normalizasyonu (TR, E.164) ----
create or replace function public.intake_normalize_phone(p_raw text)
returns text language plpgsql immutable as $$
declare d text;
begin
  if p_raw is null then return null; end if;
  d := regexp_replace(p_raw, '[^0-9]', '', 'g');
  if d = '' then return null; end if;
  if length(d) = 10 and left(d,1) = '5' then return '+90' || d; end if;       -- 5XXXXXXXXX
  if length(d) = 11 and left(d,1) = '0' then return '+90' || right(d,10); end if; -- 0 5XX...
  if length(d) = 12 and left(d,2) = '90' then return '+' || d; end if;         -- 90 5XX...
  if left(p_raw,1) = '+' then return '+' || d; end if;                          -- zaten uluslararası
  return '+90' || right(d,10);                                                  -- son çare: son 10 hane TR
end $$;

-- ---- Taslak teklif (E.2): maliyet varsa fiyatla, documents is_draft=true ----
create or replace function public.build_draft_quote(p_operation_id bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_qty int := coalesce((select (value#>>'{}')::int from settings where key='intake.draft_quote_qty'), 50);
  v_margin numeric := coalesce((select (value#>>'{}')::numeric from settings where key='intake.draft_margin_percent'), 40);
  v_lines jsonb := '[]'::jsonb; v_missing int := 0; v_total numeric := 0; v_doc_id bigint; v_dt bigint;
  r record; v_cost numeric; v_price numeric;
begin
  for r in
    select oci.catalog_product_id, coalesce(oci.label, oci.catalog_product_code) label, oci.catalog_product_code code
    from operation_catalog_items oci where oci.operation_id = p_operation_id
  loop
    select total_cost_usd into v_cost from product_costs
      where product_id = r.catalog_product_id and is_current limit 1;
    if v_cost is null then
      v_missing := v_missing + 1;
      v_lines := v_lines || jsonb_build_object('urun', r.label, 'kod', r.code, 'adet', v_qty, 'birim_fiyat', null, 'tutar', null, 'maliyet_eksik', true);
    else
      v_price := round(v_cost * (1 + v_margin/100), 2);
      v_total := v_total + v_price * v_qty;
      v_lines := v_lines || jsonb_build_object('urun', r.label, 'kod', r.code, 'adet', v_qty, 'birim_fiyat', v_price, 'tutar', round(v_price*v_qty,2), 'maliyet_eksik', false);
    end if;
  end loop;

  select id into v_dt from document_types where key='fiyat_teklifi';
  insert into documents (operation_id, document_type_id, is_draft, data)
  values (p_operation_id, v_dt, true, jsonb_build_object(
    'kaynak','katalog_otomatik','adet_kademesi', v_qty, 'satirlar', v_lines,
    'toplam_usd', round(v_total,2), 'maliyeti_eksik_urun', v_missing, 'para_birimi','USD'))
  returning id into v_doc_id;
  return v_doc_id;
end $$;

-- ---- Ana giriş işleme (E.1) ----
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
      select id, code, name into v_cp from catalog_products where code = trim(v_prod->>'code') and deleted_at is null limit 1;
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

-- ---- Birleştirme (E.4) ----
create or replace function public.merge_operations(p_source bigint, p_target bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('operations.edit') and not exists (select 1 from users u join roles r on r.id=u.role_id where u.id=auth.uid() and r.key in ('owner','admin','manager')) then
    raise exception 'Birleştirme yetkiniz yok.' using errcode='42501';
  end if;
  if p_source = p_target then raise exception 'Kaynak ve hedef aynı olamaz.'; end if;
  -- kalemleri, dosyaları, kataloğu, notu taşı
  update operation_catalog_items set operation_id = p_target where operation_id = p_source;
  update operation_items set operation_id = p_target where operation_id = p_source;
  update files set entity_id = p_target::text where entity_type='operation' and entity_id = p_source::text;
  update operations t set description = coalesce(t.description,'') || E'\n[Birleştirilen talep ' || (select code from operations where id=p_source) || ']: ' || coalesce((select description from operations where id=p_source),'—') where t.id = p_target;
  -- kaynağı kapat
  update operations set merged_into = p_target, possible_merge_with = null where id = p_source;
  update open_files set closed_at = now() where operation_id = p_source and closed_at is null;
  perform public.log_event('operation.merged', 'operation', p_source::text, jsonb_build_object('target', p_target));
end $$;

create or replace function public.dismiss_merge(p_operation bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update operations set possible_merge_with = null where id = p_operation;
  perform public.log_event('operation.merge_dismissed', 'operation', p_operation::text, '{}'::jsonb);
end $$;

grant execute on function public.intake_process(jsonb) to service_role;
grant execute on function public.merge_operations(bigint,bigint) to authenticated;
grant execute on function public.dismiss_merge(bigint) to authenticated;
