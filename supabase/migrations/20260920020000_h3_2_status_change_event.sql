-- =====================================================================
-- PAKET H · H3.2 (Karar T-A) — Durum değişimini event_log'a yaz (tek kaynak)
-- =====================================================================
-- Süreç panelinin salt-okunur zaman çizelgesi "hangi durum / ne zaman / kim" için
-- TEK KAYNAK: event_log. operation.stage_changed zaten var ama AYNI aşama içindeki
-- durum geçişleri (Bekliyor↔İletildi, Kargoda→Teslim) yoktu. Bu, status_id her
-- değiştiğinde 'operation.status_changed' olayı yazar (operations_log_stage_change simetriği).
-- Davranış trigger'ına (operations_status_after) DOKUNULMAZ — ayrı logger.
-- Döngü yok: log_event yalnız event_log'a insert eder, operations'ı güncellemez.
-- =====================================================================

create or replace function public.operations_log_status_change()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare v_from text; v_to text; v_from_lbl text; v_to_lbl text;
begin
  if new.status_id is distinct from old.status_id then
    select key, label into v_from, v_from_lbl from public.stage_statuses where id = old.status_id;
    select key, label into v_to,   v_to_lbl   from public.stage_statuses where id = new.status_id;
    perform public.log_event('operation.status_changed', 'operation', new.id::text,
      jsonb_build_object('from', v_from, 'to', v_to, 'from_label', v_from_lbl, 'to_label', v_to_lbl,
        'note', nullif(btrim(coalesce(new.status_note,'')),'')), now());
  end if;
  return null;
end; $function$;

drop trigger if exists operations_log_status_change on public.operations;
create trigger operations_log_status_change after update of status_id on public.operations
  for each row execute function public.operations_log_status_change();

-- ---------------------------------------------------------------------
-- DOĞUŞ + İLK DURUM: operation.created payload'ına başlangıç aşama+durum
-- etiketini ekle. T-A trigger'ı after UPDATE olduğu için ilk durum (INSERT
-- anındaki st_teklif_bekliyor) olay üretmez → çizelge yarım başlardı.
-- before_insert (BEFORE) status_id'yi zaten atadığı için AFTER INSERT olan bu
-- trigger new.status_id'yi dolu görür. Yalnız payload'a 2 anahtar eklenir;
-- davranış değişmez. Eski 870 kayıt bu anahtarlar olmadan kalır (istemci
-- zaten opsiyonel okur — geriye dönük güvenli).
-- ---------------------------------------------------------------------
create or replace function public.operations_timeline_events()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare v_stage text; v_status text;
begin
  if tg_op = 'INSERT' then
    select os.label, ss.label into v_stage, v_status
      from public.stage_statuses ss
      left join public.operation_stages os on os.id = ss.stage_id
      where ss.id = new.status_id;
    perform public.log_event('operation.created', 'operation', new.id::text,
      jsonb_build_object('code', new.code, 'title', new.title, 'customer_id', new.customer_id,
        'stage_label', v_stage, 'status_label', v_status),
      new.requested_at);
  end if;
  return null;
end; $function$;

notify pgrst, 'reload schema';

-- GERİ ALMA (down): drop trigger operations_log_status_change on public.operations;
--   drop function public.operations_log_status_change();
