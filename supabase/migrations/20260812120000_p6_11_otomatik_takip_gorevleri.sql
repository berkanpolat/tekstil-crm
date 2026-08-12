-- =====================================================================
-- P6.11 — OTOMATİK TAKİP GÖREVLERİ (Paket 6 / Aşama 2)
--
-- Karar (Aşama 1): operations'a KOLON EKLENMEZ. Görevler tasks üzerinden.
-- Bu göç, P6.3 "öneri" sisteminden FARKLIDIR: burada görev DOĞRUDAN oluşur
-- (kullanıcı onayı beklenmez), source='otomatik' + auto_kind ile işaretlenir.
--
-- Tetikler (yalnız bekleyen durumlarda):
--   • Teklif iletildi   (quotes.sent_at    : null→dolu) → "Müşteriyi ara — teklif takibi"   +24 saat
--   • Numune gönderildi (samples.shipped_at: null→dolu) → "Numune geri dönüşü alındı mı?"    +3 gün
--   • Kargoya verildi   (orders.shipped_at : null→dolu) → "Teslim edildi mi?"                +3 gün
--   • Etkileşim sonucu  (interactions insert):
--        ulasilamadi    → "Tekrar ara"  +1 gün
--        sonra_aranacak → "Geri dön"    +3 gün
--
-- Kurallar:
--   • Mükerrer koruma: aynı entity + auto_kind için AÇIK otomatik görev varsa üretme.
--   • Kapanmış/iptal operasyonda üretme (aşama is_terminal).
--   • Operasyon kapanınca (aşama terminal'e geçince) o operasyonun açık otomatik
--     görevlerini kapat (status → iptal_edildi).
--   • Tarih kullanıcı tarafından sonradan değiştirilebilir (normal görev düzenleme).
-- =====================================================================

-- 1) tasks.auto_kind — otomatik görev tipi (dedup + toplu kapatma için). Manuel görevlerde null.
alter table public.tasks add column if not exists auto_kind text;
comment on column public.tasks.auto_kind is
  'Otomatik görev tipi (teklif_takip|numune_donus|teslim_kontrol|tekrar_ara|geri_don). source=otomatik ile birlikte; mükerrer koruma ve operasyon kapanınca toplu kapatma için.';
create index if not exists tasks_auto_open_idx on public.tasks (entity_type, entity_id, auto_kind)
  where source = 'otomatik' and deleted_at is null and completed_at is null;

-- 2) Ortak yardımcı — mükerrer + kapalı-operasyon kontrolü + insert. Yalnız trigger'lardan çağrılır.
create or replace function public._auto_task_upsert(
  p_entity_type text, p_entity_id bigint, p_auto_kind text,
  p_title text, p_due_at timestamptz, p_assigned_to uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_terminal boolean;
begin
  if p_entity_id is null then return; end if;

  -- Kapanmış/iptal operasyonda üretme (yalnız operasyon kapsamlı görevler için).
  if p_entity_type = 'operation' then
    select st.is_terminal into v_terminal
    from public.operations o
    left join public.operation_stages st on st.id = o.stage_id
    where o.id = p_entity_id and o.deleted_at is null;
    if not found then return; end if;            -- operasyon yok/silinmiş
    if coalesce(v_terminal, false) then return; end if;
  end if;

  -- Mükerrer koruma: aynı entity + tip için AÇIK otomatik görev varsa üretme.
  if exists (
    select 1 from public.tasks t
    join public.task_statuses s on s.id = t.status_id
    where t.source = 'otomatik' and t.auto_kind = p_auto_kind
      and t.entity_type = p_entity_type and t.entity_id = p_entity_id
      and t.deleted_at is null and t.completed_at is null and not s.is_closed
  ) then return; end if;

  -- status_id / priority_id varsayılanları tasks_stamp trigger'ı doldurur.
  insert into public.tasks (title, entity_type, entity_id, due_at, assigned_to, source, auto_kind, created_by)
  values (p_title, p_entity_type, p_entity_id, p_due_at, p_assigned_to, 'otomatik', p_auto_kind, auth.uid());
end; $$;

-- 3) Teklif iletildi → teklif takibi (+24 saat)
create or replace function public.quotes_auto_task()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if new.sent_at is not null and old.sent_at is null then
    select owner_id into v_owner from public.operations where id = new.operation_id;
    perform public._auto_task_upsert('operation', new.operation_id, 'teklif_takip',
      'Müşteriyi ara — teklif takibi', now() + interval '24 hours', v_owner);
  end if;
  return null;
end; $$;
create trigger quotes_auto_task after update of sent_at on public.quotes
  for each row execute function public.quotes_auto_task();

-- 4) Numune gönderildi → geri dönüş takibi (+3 gün)
create or replace function public.samples_auto_task()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if new.shipped_at is not null and old.shipped_at is null then
    select owner_id into v_owner from public.operations where id = new.operation_id;
    perform public._auto_task_upsert('operation', new.operation_id, 'numune_donus',
      'Numune geri dönüşü alındı mı?', now() + interval '3 days', v_owner);
  end if;
  return null;
end; $$;
create trigger samples_auto_task after update of shipped_at on public.samples
  for each row execute function public.samples_auto_task();

-- 5) Kargoya verildi → teslim kontrolü (+3 gün)
create or replace function public.orders_auto_task()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if new.shipped_at is not null and old.shipped_at is null then
    select owner_id into v_owner from public.operations where id = new.operation_id;
    perform public._auto_task_upsert('operation', new.operation_id, 'teslim_kontrol',
      'Teslim edildi mi?', now() + interval '3 days', v_owner);
  end if;
  return null;
end; $$;
create trigger orders_auto_task after update of shipped_at on public.orders
  for each row execute function public.orders_auto_task();

-- 6) Etkileşim sonucu → takip görevi. Operasyona bağlıysa operasyona, değilse lead/customer'a.
create or replace function public.interactions_auto_task()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_key text; v_title text; v_due timestamptz; v_kind text; v_etype text; v_eid bigint;
begin
  if new.outcome_id is null then return null; end if;
  select key into v_key from public.interaction_outcomes where id = new.outcome_id;

  if v_key = 'ulasilamadi' then
    v_title := 'Tekrar ara'; v_due := now() + interval '1 day';  v_kind := 'tekrar_ara';
  elsif v_key = 'sonra_aranacak' then
    v_title := 'Geri dön';   v_due := now() + interval '3 days'; v_kind := 'geri_don';
  else
    return null;
  end if;

  if new.operation_id is not null then
    v_etype := 'operation'; v_eid := new.operation_id;
  else
    v_etype := new.entity_type; v_eid := new.entity_id;   -- 'lead' | 'customer'
  end if;

  perform public._auto_task_upsert(v_etype, v_eid, v_kind, v_title, v_due, new.created_by);
  return null;
end; $$;
create trigger interactions_auto_task after insert on public.interactions
  for each row execute function public.interactions_auto_task();

-- 7) Operasyon kapanınca (aşama terminal'e geçince) açık otomatik görevleri kapat.
create or replace function public.operations_close_auto_tasks()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_new_terminal boolean; v_old_terminal boolean; v_cancel_id bigint;
begin
  select is_terminal into v_new_terminal from public.operation_stages where id = new.stage_id;
  select is_terminal into v_old_terminal from public.operation_stages where id = old.stage_id;
  if coalesce(v_new_terminal, false) and not coalesce(v_old_terminal, false) then
    select id into v_cancel_id from public.task_statuses where key = 'iptal_edildi';
    update public.tasks t
      set status_id = v_cancel_id
    from public.task_statuses s
    where t.status_id = s.id
      and t.entity_type = 'operation' and t.entity_id = new.id
      and t.source = 'otomatik' and t.deleted_at is null and t.completed_at is null
      and not s.is_closed;
  end if;
  return null;
end; $$;
create trigger operations_close_auto_tasks after update of stage_id on public.operations
  for each row execute function public.operations_close_auto_tasks();

-- =====================================================================
-- İSTEĞE BAĞLI — P6.3 öneri sistemiyle çakışma giderme.
--   teklif_gonderildi / numune_gonderildi olayları artık OTOMATİK üretiliyor;
--   aynı olay için ÖNERİ de gelmesin diye ilgili şablonları pasifleştir.
--   (İki sistemi de açık tutmak istersen bu bloğu UYGULAMA.)
-- ---------------------------------------------------------------------
-- update public.task_templates set is_active = false
--   where trigger_event in ('teklif_gonderildi','numune_gonderildi');
-- =====================================================================
