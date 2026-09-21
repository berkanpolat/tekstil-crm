-- H2 DÖNGÜ TESTİ — ROLLBACK'li (canlıya HİÇBİR ŞEY yazmaz). H1 uygulanmış olmalı.
-- H2 DDL'i txn içinde yükler, geçici bir talebi tüm sistem durumlarında yürütür,
-- trigger tetik derinliğini/sayısını NOTICE ile basar, sonsuz döngü/kapı hatası
-- ve stage-bounce olmadığını doğrular, sonra ROLLBACK.
\set ON_ERROR_STOP on
set client_min_messages to notice;
begin;
\i supabase/migrations/20260919121000_h1b_complete_data.sql
\i supabase/migrations/20260919130000_h2_behavior_engine.sql
\i supabase/migrations/20260920000000_h3_1_quotes_sync_reconcile.sql
\i supabase/migrations/20260920010000_h3_1b_new_op_defaults.sql
\i supabase/migrations/20260920020000_h3_2_status_change_event.sql
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
  -- T-A: her durum değişimi event_log'a 'operation.status_changed' yazmalı (zaman çizelgesi kaynağı)
  declare v_ev int; begin
    select count(*) into v_ev from public.event_log where entity_type='operation' and entity_id=v_op::text and event_type='operation.status_changed';
    raise notice 'status_changed event sayısı: % (yürüyüşteki durum değişimi kadar)', v_ev;
    if v_ev = 0 then raise exception 'FAIL: durum degisimi event_log kaydi olusmadi (zaman cizelgesi bos kalir)'; end if;
  end;
  raise notice 'GEÇTİ ✓  Sonsuz döngü/kapı hatası yok · çocuklar oluştu · stage stabil (final=Kapandı) · durum olayları loglandı.';
end $$;

-- ===== BLOK 2: teklif→quotes_sync→operations.status_id ZİNCİRİ (trigger→trigger) =====
do $$
declare v_cust bigint; v_op2 bigint; v_op3 bigint; v_q bigint; v_file bigint;
  v_st text; v_stage text; v_req text;
begin
  select customer_id into v_cust from public.operations where customer_id is not null limit 1;
  select id into v_file from public.files limit 1;   -- quote_file_id için (rollback'li — zararsız)
  if v_file is null then raise exception 'Test için files tablosunda kayıt yok'; end if;

  -- (a0) GERÇEK istemci dizisi: düz insert (before_insert modele sokmalı — KISAYOL YOK)
  insert into public.operations(customer_id, title) values (v_cust, '__H3_QSYNC_A__') returning id into v_op2;
  select ss.key, os.key into v_st, v_stage from public.operations o
    join public.stage_statuses ss on ss.id=o.status_id
    join public.operation_stages os on os.id=o.stage_id where o.id=v_op2;
  raise notice 'A0) yeni talep DOĞDU → durum=%  stage=% (beklenen st_teklif_bekliyor/teklif)', v_st, v_stage;
  if v_st <> 'st_teklif_bekliyor' or v_stage <> 'teklif' then
    raise exception 'FAIL A0: yeni talep iki kademeli modelde doğmadı (durum=%, stage=%).', v_st, v_stage; end if;
  -- T-A doğuş: operation.created payload'ı ilk aşama+durum etiketini taşımalı (çizelge yarım başlamasın)
  declare v_slbl text; v_stlbl text; begin
    select payload->>'stage_label', payload->>'status_label' into v_slbl, v_stlbl
      from public.event_log where event_type='operation.created' and entity_id=v_op2::text;
    raise notice 'A0b) doğuş olayı payload → stage_label=%  status_label=%', v_slbl, v_stlbl;
    if v_slbl is null or v_stlbl is null then
      raise exception 'FAIL A0b: doğuş olayı ilk aşama/durum etiketini taşımıyor (çizelge yarım başlar).'; end if;
  end;
  -- (a) teklif dosyası eklenince (gerçek useUploadQuoteFile: quotes insert + quote_file_id) İletildi'ye çekilmeli
  insert into public.quotes(operation_id, quote_file_id) values (v_op2, v_file) returning id into v_q;   -- quotes_sync zinciri
  select ss.key, os.key, rs.key into v_st, v_stage, v_req
    from public.operations o
    left join public.stage_statuses ss on ss.id=o.status_id
    left join public.operation_stages os on os.id=o.stage_id
    left join public.request_statuses rs on rs.id=o.request_status_id where o.id=v_op2;
  raise notice 'A) teklif eklendi → durum=%  stage=%  req_status=%  depth(dış)=%', v_st, v_stage, v_req, pg_trigger_depth();
  if v_st <> 'st_teklif_iletildi' then raise exception 'FAIL A: durum İletildi olmadı (%).', v_st; end if;
  if v_stage <> 'teklif' then raise exception 'FAIL A: stage teklif değil (%).', v_stage; end if;
  if v_req <> 'teklif_iletildi' then raise exception 'FAIL A: request_status senkronu bozuk (%).', v_req; end if;

  -- (b) Teklif silinince → Bekliyor'a geri dönmeli (yalnız Teklif aşaması + İletildi iken)
  update public.quotes set deleted_at=now() where id=v_q;   -- quotes_sync tekrar
  select ss.key, rs.key into v_st, v_req from public.operations o
    left join public.stage_statuses ss on ss.id=o.status_id
    left join public.request_statuses rs on rs.id=o.request_status_id where o.id=v_op2;
  raise notice 'B) teklif silindi → durum=%  req_status=%', v_st, v_req;
  if v_st <> 'st_teklif_bekliyor' then raise exception 'FAIL B: geri Bekliyor olmadı (%).', v_st; end if;
  if v_req <> 'teklif_bekliyor' then raise exception 'FAIL B: request_status geri senkronlanmadı (%).', v_req; end if;

  -- (c) Numune aşamasındaki operasyona teklif eklenince AŞAMA GERİ GİTMEMELİ
  insert into public.operations(customer_id, title) values (v_cust, '__H3_QSYNC_C__') returning id into v_op3;
  update public.operations set status_id=(select id from public.stage_statuses where key='st_teklif_iletildi') where id=v_op3;   -- geçerli geçiş
  update public.operations set status_id=(select id from public.stage_statuses where key='st_num_hazirlaniyor') where id=v_op3; -- artık numune
  insert into public.quotes(operation_id, quote_file_id) values (v_op3, v_file);
  select ss.key, os.key into v_st, v_stage from public.operations o
    left join public.stage_statuses ss on ss.id=o.status_id
    left join public.operation_stages os on os.id=o.stage_id where o.id=v_op3;
  raise notice 'C) numunedeyken teklif eklendi → durum=%  stage=% (beklenen: değişmez, numune)', v_st, v_stage;
  if v_stage <> 'numune' or v_st <> 'st_num_hazirlaniyor' then
    raise exception 'FAIL C: numune aşaması teklif eklenince geri gitti (stage=%, durum=%).', v_stage, v_st; end if;

  raise notice 'BLOK 2 GEÇTİ ✓  teklif→durum zinciri: ileri/geri doğru, numune geri çekilmedi, req_status senkron, özyineleme yok.';
end $$;

rollback;
