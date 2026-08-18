-- =====================================================================
-- EŞLEŞMEYEN LEAD'LER · YAZMA (tek transaction, idempotent).
-- Payload: /tmp/leads-canli/payload.ndjson (her satır 1 kişi, JSON).
-- Model: lead → convert_lead_to_customer → operation (+katalog +görsel-ad).
-- Idempotency: leads.external_id = telefon(son10) ; operations.client_reference.
-- Çalıştırma: -v do_commit=true  → COMMIT ; aksi halde ROLLBACK (kuru).
-- =====================================================================
\set ON_ERROR_STOP on
begin;

create temp table _imp(data jsonb) on commit drop;
\copy _imp(data) from '/tmp/leads-canli/payload.ndjson' with (format csv, delimiter E'\x02', quote E'\x01')

-- yazma öncesi sayılar
create temp table _pre on commit drop as
  select (select count(*) from public.leads) leads,
         (select count(*) from public.customers) customers,
         (select count(*) from public.operations) operations,
         (select count(*) from public.contact_points) contact_points,
         (select count(*) from public.operation_catalog_items) cat_items,
         (select count(*) from public.files) files;

create temp table _res(kind text, n bigint) on commit drop;

do $$
declare
  r record; s jsonb; c jsonb; g text;
  v_lead_id bigint; v_cust_id bigint; v_op_id bigint;
  v_phone10 text; v_cref text; v_ord int; v_ts timestamptz;
  n_lead int:=0; n_cust int:=0; n_op int:=0; n_cat int:=0; n_file int:=0; n_reuse int:=0; n_skip_op int:=0;
begin
  for r in select data from _imp loop
    v_phone10 := right(regexp_replace(coalesce(r.data->>'phone_e164',''), '\D','','g'), 10);

    -- kişi idempotency
    select id, converted_customer_id into v_lead_id, v_cust_id
      from public.leads
      where external_source='deneme-landing-import' and external_id=v_phone10 and deleted_at is null
      limit 1;

    if v_lead_id is null then
      insert into public.leads(full_name, company_name, city, source_id, external_source, external_id, created_at, updated_at)
      values (r.data->>'full_name', r.data->>'full_name', nullif(r.data->>'city',''),
              5, 'deneme-landing-import', v_phone10,
              (r.data->>'lead_ts')::timestamptz, (r.data->>'lead_ts')::timestamptz)
      returning id into v_lead_id;
      n_lead := n_lead + 1;

      if nullif(r.data->>'phone_e164','') is not null then
        insert into public.contact_points(entity_type, entity_id, type, value, is_primary)
        values ('lead', v_lead_id, 'phone', r.data->>'phone_e164', true);
      end if;
      if nullif(r.data->>'email','') is not null then
        insert into public.contact_points(entity_type, entity_id, type, value, is_primary)
        values ('lead', v_lead_id, 'email', r.data->>'email', false);
      end if;

      v_cust_id := public.convert_lead_to_customer(v_lead_id, 1);
      n_cust := n_cust + 1;

      -- created_at kaynağa çek (RPC now() koymuştu)
      update public.customers set created_at=(r.data->>'lead_ts')::timestamptz, converted_at=(r.data->>'lead_ts')::timestamptz where id=v_cust_id;
      update public.leads set converted_at=(r.data->>'lead_ts')::timestamptz where id=v_lead_id;
    else
      n_reuse := n_reuse + 1;
    end if;

    for s in select value from jsonb_array_elements(r.data->'submissions') loop
      v_ts := (s->>'ts')::timestamptz;
      v_cref := 'denemelanding:'||v_phone10||':'||(s->>'ts');
      if exists(select 1 from public.operations where client_reference=v_cref) then
        n_skip_op := n_skip_op + 1; continue;
      end if;

      insert into public.operations(customer_id, description, source, channel_id, landing_source,
             product_source, province_id, stage_id, request_status_id, requested_at, created_at, updated_at, client_reference)
      values (v_cust_id, nullif(s->>'note',''), 'web_sitesi', 2, 'deneme-landing',
              s->>'product_source', (r.data->>'province_id')::bigint, 9, 9, v_ts, v_ts, v_ts, v_cref)
      returning id into v_op_id;
      n_op := n_op + 1;

      v_ord := 0;
      for c in select value from jsonb_array_elements(s->'codes') loop
        insert into public.operation_catalog_items(operation_id, catalog_product_code, catalog_product_id, label, sort_order, created_at, updated_at)
        values (v_op_id, c->>'code', (c->>'id')::bigint, c->>'name', v_ord, v_ts, v_ts);
        n_cat := n_cat + 1; v_ord := v_ord + 1;
      end loop;

      for g in select value from jsonb_array_elements_text(s->'gorsel') loop
        if not exists (select 1 from public.files where entity_type='operation' and entity_id=v_op_id::text and original_name=g) then
          insert into public.files(bucket, storage_path, original_name, category, version, entity_type, entity_id, description, created_at)
          values ('intake-pending', v_phone10||'/'||g, g, 'image', 1, 'operation', v_op_id::text,
                  'Landing görseli — dosya henüz yüklenmedi (import; sonra bağlanacak)', v_ts);
          n_file := n_file + 1;
        end if;
      end loop;
    end loop;
  end loop;

  insert into _res values ('lead',n_lead),('customer',n_cust),('operation',n_op),
    ('catalog_item',n_cat),('file',n_file),('reuse_person',n_reuse),('skip_op',n_skip_op);
end $$;

\echo '── EKLENEN (DO sayaçları) ──'
select kind, n from _res order by kind;
\echo '── FARK (sonra - önce) ──'
select 'leads +'||((select count(*) from public.leads)-leads) leads,
       'customers +'||((select count(*) from public.customers)-customers) customers,
       'operations +'||((select count(*) from public.operations)-operations) operations,
       'contact_points +'||((select count(*) from public.contact_points)-contact_points) contact_points,
       'cat_items +'||((select count(*) from public.operation_catalog_items)-cat_items) cat_items,
       'files +'||((select count(*) from public.files)-files) files
from _pre;
\echo '── ÖRNEK: yeni 1 talep (kod+title+requested_at doğru mu) ──'
select o.id, o.code, o.title, o.customer_id, o.stage_id, o.channel_id, o.landing_source, o.product_source, o.requested_at, o.created_at, left(o.description,40) descr
from public.operations o where o.client_reference like 'denemelanding:%' order by o.id desc limit 3;

\if :do_commit
  commit;
  \echo '>>> COMMIT edildi'
\else
  rollback;
  \echo '>>> ROLLBACK (kuru koşu) — hiçbir şey kalıcı değil'
\endif
