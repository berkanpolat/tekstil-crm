-- =====================================================================
-- PAKET H · H2 — Durum davranış motoru + DÖNGÜ KORUMASI
-- =====================================================================
-- operations.status_id TEK SÜRÜCÜ. Durum değişince tek işlemde:
--   • stage_id güncellenir (BEFORE, satır-içi — ayrı UPDATE yok)
--   • Numune/Sipariş aşamasında çocuk kayıt otomatik oluşur (belgesiz olabilir)
--   • zaman damgaları yazılır (shipped/received/approved/actual_delivery)
--   • revize → mevcut revise_sample RPC (version++ arkada)
--   • Teklif durumları quote OLUŞTURMAZ (Karar 1)
--
-- DÖNGÜ KORUMASI (birinci iş): GUC app.stage_sync='1' iken eski çocuk→ebeveyn
--   trigger'ları (samples_advance_op/orders_advance_op/quotes_sync) ve sert kapı
--   (require_siparis_onay) STAND-DOWN eder. Eski trigger'lar SİLİNMEZ, guard'lanır.
--   (Not: *_advance_op AFTER INSERT + yalnız stage_id yazar → sonsuz özyineleme değil,
--    asıl risk stage-bounce + kapı; guard ikisini de keser. pg_trigger_depth ek emniyet.)
-- =====================================================================

-- ── 0) Guard yardımcı + transaction-local bayrak ─────────────────────
create or replace function public.in_stage_sync()
returns boolean language sql stable as $$
  select coalesce(current_setting('app.stage_sync', true), '') = '1'
$$;

-- Revize gerekçe ister (revise_sample boş sebeple hata verir).
update public.stage_statuses set requires_reason = true where key = 'st_num_revize';

-- Durum geçişi gerekçesi (reddet/revize/iptal) için taşıyıcı kolon.
alter table public.operations add column if not exists status_note text;
comment on column public.operations.status_note is 'Durum geçişinin gerekçesi (reddet/revize/iptal). Davranış motoru okur; kalıcı değil.';

-- ── 1) Eski trigger'ları GUARD'la (silme yok, yalnız erken çıkış) ────
create or replace function public.samples_advance_op()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if public.in_stage_sync() then return null; end if;   -- sürücü operations.status_id → stand down
  perform public.op_advance_stage(new.operation_id, 'numune');
  return null;
end; $function$;

create or replace function public.orders_advance_op()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if public.in_stage_sync() then return null; end if;
  perform public.op_advance_stage(new.operation_id, 'siparis');
  return null;
end; $function$;

create or replace function public.quotes_sync_operation_status()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare v_opid bigint := coalesce(new.operation_id, old.operation_id); v_has boolean;
begin
  if public.in_stage_sync() then return null; end if;
  select exists(select 1 from public.quotes where operation_id = v_opid and deleted_at is null and quote_file_id is not null) into v_has;
  update public.operations
    set request_status_id = (select id from public.request_statuses where key = case when v_has then 'teklif_iletildi' else 'teklif_bekliyor' end)
    where id = v_opid and cancelled_at is null;
  if v_has then
    update public.operations set stage_id = (select id from public.operation_stages where key = 'teklif_iletildi')
      where id = v_opid and stage_id = (select id from public.operation_stages where key = 'teklif_bekliyor');
  end if;
  return null;
end; $function$;

-- Sert kapı: sistem-sürücülü otomatik çocuk oluşturmada BYPASS (belgesiz olabilir — Karar).
create or replace function public.require_siparis_onay(p_operation_id bigint)
returns void language plpgsql security definer set search_path to '' as $function$
begin
  if public.in_stage_sync() then return; end if;
  if not exists (
    select 1 from public.documents d join public.document_types dt on dt.id = d.document_type_id
    where d.operation_id = p_operation_id and dt.key = 'siparis_onay' and d.deleted_at is null
  ) then
    raise exception 'Sipariş onay formu yüklenmeden numune ya da sipariş oluşturulamaz.' using errcode = 'check_violation';
  end if;
end; $function$;

-- ── 2) BEFORE: stage'i satır-içi ayarla + geçiş/gerekçe doğrula ──────
create or replace function public.operations_status_before()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare v_stage bigint; v_from text; v_to text; v_req boolean;
begin
  if new.status_id is null or new.status_id is not distinct from old.status_id then return new; end if;
  select stage_id, requires_reason into v_stage, v_req from public.stage_statuses where id = new.status_id;
  if v_stage is null then raise exception 'Bilinmeyen durum (id=%).', new.status_id using errcode='check_violation'; end if;
  new.stage_id := v_stage;                                  -- satır-içi (ayrı UPDATE yok → özyineleme yok)
  if v_req and coalesce(btrim(new.status_note),'') = '' then
    raise exception 'Bu durum için gerekçe zorunlu.' using errcode='check_violation';
  end if;
  -- Geçiş kuralı (tanımlıysa zorunlu; tanımsız from → serbest).
  v_to := (select key from public.stage_statuses where id = new.status_id);
  if old.status_id is not null then
    v_from := (select key from public.stage_statuses where id = old.status_id);
    if exists(select 1 from public.status_transitions where entity_type='operation_status' and from_key=v_from and is_active) then
      if not exists(select 1 from public.status_transitions where entity_type='operation_status' and from_key=v_from and to_key=v_to and is_active) then
        raise exception 'Geçersiz durum geçişi: % → %', v_from, v_to using errcode='check_violation';
      end if;
    end if;
  end if;
  return new;
end; $function$;

drop trigger if exists operations_status_before on public.operations;
create trigger operations_status_before before update of status_id on public.operations
  for each row execute function public.operations_status_before();

-- ── 3) AFTER: davranış (çocuk oluştur + zaman damgası) — GUARD'lı ────
create or replace function public.operations_status_after()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare v_beh text; v_sample bigint; v_order bigint; v_debug boolean := coalesce(current_setting('app.debug_stage', true),'')='1';
begin
  if new.status_id is not distinct from old.status_id then return null; end if;
  select behavior into v_beh from public.stage_statuses where id = new.status_id;
  if v_beh is null then return null; end if;               -- özel/bilgi durumu → davranış yok

  perform set_config('app.stage_sync', '1', true);         -- çocuk→ebeveyn trigger'ları + kapı stand-down
  if v_debug then raise notice 'BEHAVIOR % (op %) depth=%', v_beh, new.id, pg_trigger_depth(); end if;

  -- Numune davranışları: gerekiyorsa numuneyi garanti et
  if v_beh in ('sample_created','shipped','received','approved','rejected','revise') then
    select id into v_sample from public.samples where operation_id = new.id and deleted_at is null order by version desc limit 1;
    if v_sample is null then
      insert into public.samples(operation_id) values (new.id) returning id into v_sample;   -- kapı guard ile bypass
    end if;
    if v_beh = 'shipped' then
      update public.samples set shipped_at = coalesce(shipped_at, now()),
        status_id = (select id from public.sample_statuses where key='kargoda') where id = v_sample;
    elsif v_beh = 'received' then
      update public.samples set received_at = coalesce(received_at, now()),
        status_id = (select id from public.sample_statuses where key='teslim_edildi') where id = v_sample;
    elsif v_beh = 'approved' then
      update public.samples set approved_at = coalesce(approved_at, now()), approved_by = coalesce(approved_by, auth.uid()),
        status_id = (select id from public.sample_statuses where key='onaylandi') where id = v_sample;
    elsif v_beh = 'rejected' then
      update public.samples set rejection_reason = coalesce(nullif(btrim(new.status_note),''), rejection_reason),
        status_id = (select id from public.sample_statuses where key='reddedildi') where id = v_sample;
    elsif v_beh = 'revise' then
      perform public.revise_sample(v_sample, coalesce(new.status_note, ''));   -- version++ arkada
    end if;
  end if;

  -- Sipariş/üretim/teslimat davranışları: gerekiyorsa siparişi garanti et
  if v_beh in ('order_created','production','order_shipped','delivered') then
    select id into v_order from public.orders where operation_id = new.id and deleted_at is null order by id desc limit 1;
    if v_order is null then
      insert into public.orders(operation_id) values (new.id) returning id into v_order;  -- kapı guard ile bypass
    end if;
    if v_beh = 'production' then
      update public.orders set status_id = (select id from public.order_statuses where key='uretimde') where id = v_order;
    elsif v_beh = 'order_shipped' then
      update public.orders set shipped_at = coalesce(shipped_at, now()),
        status_id = (select id from public.order_statuses where key='kargoda') where id = v_order;
    elsif v_beh = 'delivered' then
      update public.orders set actual_delivery = coalesce(actual_delivery, (now() at time zone public.app_timezone())::date),
        status_id = (select id from public.order_statuses where key='teslim_edildi') where id = v_order;
    end if;
  end if;

  perform set_config('app.stage_sync', '0', true);         -- guard'ı kapat (bu işlem bitti)
  return null;
end; $function$;

drop trigger if exists operations_status_after on public.operations;
create trigger operations_status_after after update of status_id on public.operations
  for each row execute function public.operations_status_after();

notify pgrst, 'reload schema';

-- =====================================================================
-- GERİ ALMA (down): drop trigger operations_status_after/before; ilgili fonksiyonları drop;
--   eski samples_advance_op/orders_advance_op/quotes_sync_operation_status/require_siparis_onay
--   fonksiyonlarını guard'sız hâline geri koy; alter table operations drop column status_note;
--   update stage_statuses set requires_reason=false where key='st_num_revize';
-- =====================================================================
