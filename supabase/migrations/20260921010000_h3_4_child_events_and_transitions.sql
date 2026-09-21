-- =====================================================================
-- PAKET H · H3.4 — Bulgu 2 (çift kayıt) + ulaşılamaz durumlara geçiş
-- =====================================================================
-- BULGU 2: Davranış motoru (operations_status_after, stage_sync=1) çocuk kaydı
-- güncelleyince çocuk timeline trigger'ı da event yazıyordu → operation.status_changed
-- ile AYNI anda çift satır. Çözüm: çocuk timeline olayları + revise_sample'ın doğrudan
-- logu stage_sync sırasında stand-down (motor zaten operation.status_changed yazıyor).
-- Motor-dışı doğrudan çocuk işlemi (varsa) aynen loglar — davranış değişmez.
--
-- ULAŞILAMAZ DURUMLAR: "Üretime Hazır" (st_sip_hazir) ve "Bekletiliyor" (st_ur_bekletiliyor)
-- hiçbir status_transitions kaydında to_key değildi → şeritten seçilemiyordu. Geçiş eklenir.
-- =====================================================================

-- 1) samples_timeline_events — stage_sync'te stand-down
create or replace function public.samples_timeline_events()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare v_key text;
begin
  if public.in_stage_sync() then return null; end if;   -- H3.4: motor sürücülüyken operation.status_changed yeter
  if tg_op = 'INSERT' then
    perform public.log_event('sample.created', 'operation', new.operation_id::text,
      jsonb_build_object('sample_id', new.id, 'version', new.version));
  elsif tg_op = 'UPDATE' then
    if new.shipped_at is not null and old.shipped_at is null then
      perform public.log_event('sample.shipped', 'operation', new.operation_id::text,
        jsonb_build_object('sample_id', new.id, 'version', new.version, 'carrier', new.carrier, 'tracking', new.tracking_number));
    end if;
    if new.approved_at is not null and old.approved_at is null then
      perform public.log_event('sample.approved', 'operation', new.operation_id::text,
        jsonb_build_object('sample_id', new.id, 'version', new.version, 'method', new.approval_method));
    end if;
    if new.status_id is distinct from old.status_id then
      select key into v_key from public.sample_statuses where id = new.status_id;
      perform public.log_event('sample.status_changed', 'operation', new.operation_id::text,
        jsonb_build_object('sample_id', new.id, 'version', new.version, 'status', v_key));
    end if;
  end if;
  return null;
end; $function$;

-- 2) orders_timeline_events — stage_sync'te stand-down
create or replace function public.orders_timeline_events()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare v_key text;
begin
  if public.in_stage_sync() then return null; end if;   -- H3.4
  if tg_op = 'INSERT' then
    perform public.log_event('order.created', 'operation', new.operation_id::text,
      jsonb_build_object('order_id', new.id));
  elsif tg_op = 'UPDATE' then
    if new.held_at is not null and old.held_at is null then
      perform public.log_event('order.held', 'operation', new.operation_id::text,
        jsonb_build_object('order_id', new.id, 'reason', new.hold_reason));
    end if;
    if new.shipped_at is not null and old.shipped_at is null then
      perform public.log_event('order.shipped', 'operation', new.operation_id::text,
        jsonb_build_object('order_id', new.id, 'carrier', new.carrier, 'tracking', new.tracking_number));
    end if;
    if new.actual_delivery is not null and old.actual_delivery is null then
      perform public.log_event('order.delivered', 'operation', new.operation_id::text,
        jsonb_build_object('order_id', new.id, 'delivered_on', new.actual_delivery));
    end if;
    if new.status_id is distinct from old.status_id then
      select key into v_key from public.order_statuses where id = new.status_id;
      perform public.log_event('order.status_changed', 'operation', new.operation_id::text,
        jsonb_build_object('order_id', new.id, 'status', v_key));
    end if;
  end if;
  return null;
end; $function$;

-- 3) revise_sample — doğrudan sample.revised logu yalnız motor-dışıysa
create or replace function public.revise_sample(p_sample_id bigint, p_reason text)
returns integer language plpgsql security definer set search_path to '' as $function$
declare v_round int; v_opid bigint;
begin
  if coalesce(btrim(p_reason),'') = '' then
    raise exception 'Revizyon sebebi zorunludur.' using errcode = 'check_violation';
  end if;
  update public.samples set revision_round = revision_round + 1, revision_reason = p_reason,
    status_id = (select id from public.sample_statuses where key = 'numune_uretimde'),
    approved_at = null, approved_by = null, approval_method = null, approval_note = null
    where id = p_sample_id and deleted_at is null
    returning revision_round, operation_id into v_round, v_opid;
  if v_opid is null then raise exception 'Numune bulunamadı (id=%).', p_sample_id using errcode='P0002'; end if;
  if not public.in_stage_sync() then   -- H3.4: motor sürücülüyken operation.status_changed (gerekçeli) yeter
    perform public.log_event('sample.revised', 'operation', v_opid::text,
      jsonb_build_object('sample_id', p_sample_id, 'round', v_round, 'reason', p_reason));
  end if;
  return v_round;
end; $function$;

-- 4) Ulaşılamaz durumlara geçiş (idempotent: yoksa ekle). is_system=true, gerekçe yok.
insert into public.status_transitions (entity_type, from_key, to_key, requires_reason, is_active, is_system, sort_order)
select 'operation_status', v.from_key, v.to_key, false, true, true, 0 from (values
  ('st_sip_alindi','st_sip_hazir'),
  ('st_sip_hazir','st_ur_uretimde'),
  ('st_ur_uretimde','st_ur_bekletiliyor'),
  ('st_ur_bekletiliyor','st_ur_uretimde'),
  ('st_ur_bekletiliyor','st_tes_kargoda')
) as v(from_key, to_key)
where not exists (
  select 1 from public.status_transitions st
  where st.entity_type = 'operation_status' and st.from_key = v.from_key and st.to_key = v.to_key
);

notify pgrst, 'reload schema';

-- GERİ ALMA: fonksiyonları H3.4-öncesi yedekten geri yükle;
--   delete from status_transitions where is_system and from_key in ('st_sip_alindi','st_sip_hazir','st_ur_uretimde','st_ur_bekletiliyor') and to_key in ('st_sip_hazir','st_ur_uretimde','st_ur_bekletiliyor','st_tes_kargoda');
