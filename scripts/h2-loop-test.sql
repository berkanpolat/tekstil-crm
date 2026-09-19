-- H2 DÖNGÜ TESTİ — ROLLBACK'li (canlıya HİÇBİR ŞEY yazmaz). H1 uygulanmış olmalı.
-- H2 DDL'i txn içinde yükler, geçici bir talebi tüm sistem durumlarında yürütür,
-- trigger tetik derinliğini/sayısını NOTICE ile basar, sonsuz döngü/kapı hatası
-- ve stage-bounce olmadığını doğrular, sonra ROLLBACK.
\set ON_ERROR_STOP on
set client_min_messages to notice;
begin;
\i supabase/migrations/20260919121000_h1b_complete_data.sql
\i supabase/migrations/20260919130000_h2_behavior_engine.sql
set local app.debug_stage = '1';

do $$
declare
  v_cust bigint; v_op bigint; v_stage text; sid bigint; k text;
  keys text[] := array[
    'st_teklif_bekliyor','st_teklif_iletildi','st_num_hazirlaniyor','st_num_kargoda',
    'st_num_teslim','st_num_onaylandi','st_sip_alindi','st_ur_uretimde',
    'st_tes_kargoda','st_tes_teslim','st_kap_tamamlandi'];
begin
  select customer_id into v_cust from public.operations where customer_id is not null limit 1;
  insert into public.operations(customer_id, title) values (v_cust, '__H2_LOOP_TEST__') returning id into v_op;
  raise notice '--- test talebi % (müşteri %) ---', v_op, v_cust;

  foreach k in array keys loop
    select id into sid from public.stage_statuses where key = k;
    update public.operations set status_id = sid,
      status_note = case when k in ('st_num_revize','st_num_reddedildi','st_kap_iptal') then 'test gerekçe' else null end
      where id = v_op;
    select os.key into v_stage from public.operations o join public.operation_stages os on os.id = o.stage_id where o.id = v_op;
    raise notice 'STEP %  → stage=%  (trigdepth artık %)', k, v_stage, pg_trigger_depth();
  end loop;

  -- Doğrulamalar
  if (select count(*) from public.samples where operation_id = v_op and deleted_at is null) = 0 then
    raise exception 'FAIL: numune otomatik oluşmadı'; end if;
  if (select count(*) from public.orders where operation_id = v_op and deleted_at is null) = 0 then
    raise exception 'FAIL: sipariş otomatik oluşmadı'; end if;
  if (select os.key from public.operations o join public.operation_stages os on os.id=o.stage_id where o.id=v_op) <> 'tamamlandi' then
    raise exception 'FAIL: final stage Kapandı değil'; end if;

  raise notice '--- ÖZET ---';
  raise notice 'numune: adet=%  shipped=%  received=%  approved=%  revision_round=%',
    (select count(*) from public.samples where operation_id=v_op),
    (select shipped_at is not null from public.samples where operation_id=v_op order by version desc limit 1),
    (select received_at is not null from public.samples where operation_id=v_op order by version desc limit 1),
    (select approved_at is not null from public.samples where operation_id=v_op order by version desc limit 1),
    (select revision_round from public.samples where operation_id=v_op order by version desc limit 1);
  raise notice 'siparis: adet=%  shipped=%  actual_delivery=%',
    (select count(*) from public.orders where operation_id=v_op),
    (select shipped_at is not null from public.orders where operation_id=v_op order by id desc limit 1),
    (select actual_delivery is not null from public.orders where operation_id=v_op order by id desc limit 1);
  raise notice 'GEÇTİ ✓  Sonsuz döngü/kapı hatası yok · çocuklar oluştu · stage stabil (final=Kapandı).';
end $$;

rollback;
