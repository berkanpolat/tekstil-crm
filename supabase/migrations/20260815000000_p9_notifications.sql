-- =====================================================================
-- P9 — BİLDİRİMLER (madde 16). Mevcut altyapıyı GENİŞLETİR, yeniden yazmaz.
-- Cron yok → zaman-tabanlı yeni RPC'ler istemci poller'ına (useAlertEngine) eklenir.
--
-- SES POLİTİKASI (kesin): yalnız ÜÇ olayda ses (silent=false):
--   1) yeni talep (site/elle)            → 16.1
--   2) süresi dolan termin (numune/sipariş) → 16.5
--   3) 1 saat kalan teklif               → 16.4
-- Diğer HER ŞEY görsel (silent=true). Bu göç, madde-16 kapsamındaki mevcut
-- sesli bildirimleri de bu politikaya çeker (atama, bilinen müşteri, numune
-- teslim/revizyon, ön-ödemesiz üretim, termin-yaklaşıyor → hepsi silent=true).
-- Finans (P5) ve görev/hedef (P6) bildirimleri madde-16 kapsamı DIŞINDA →
-- dokunulmadı.
--
-- Mükerrer koruma: her yeni zaman-tabanlı uyarı BİR KEZ — bayrak kolonu +
-- koşullu update (yarış-güvenli), mevcut delivery_warned_at deseniyle aynı.
-- =====================================================================

-- ── Şema eklemeleri ─────────────────────────────────────────────────────────
alter table public.samples    add column if not exists target_date         date;         -- numune termini (16.5)
alter table public.samples    add column if not exists overdue_warned_at    timestamptz;  -- termin-doldu uyarısı bir kez
alter table public.orders     add column if not exists delivery_overdue_at  timestamptz;  -- teslim-doldu uyarısı bir kez
alter table public.open_files add column if not exists final_hour_notified_at timestamptz;-- teklif 1-saat sesli bir kez

comment on column public.samples.target_date is 'Numune için hedef/termin tarihi (16.5). Dolduğunda SESLİ uyarı.';

-- Numune termini değişince gecikme bayrağı sıfırlansın → motor yeniden değerlendirir.
create or replace function public.samples_reset_overdue_flag()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.target_date is distinct from old.target_date then new.overdue_warned_at := null; end if;
  return new;
end $$;
drop trigger if exists samples_reset_overdue on public.samples;
create trigger samples_reset_overdue before update of target_date on public.samples
  for each row execute function public.samples_reset_overdue_flag();

-- ═════════════════════════════════════════════════════════════════════════════
-- 16.1 — YENİ TALEP → SESLİ + görsel. (Eskiden silent=true idi; ses politikasının
--        1. maddesi.) Bilinen müşteri uyarısı ARTIK görsel (silent=true) — çift ses
--        olmasın, yeni-talep sesi tek başına duyulsun.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.notify_new_operation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_known boolean; v_last_owner uuid; v_days int; v_cust text;
begin
  v_days := coalesce((select (value #>> '{}')::int from public.settings where key='alerts.known_customer_days'), 30);
  select coalesce(company_name, full_name, '') into v_cust from public.customers where id = new.customer_id;
  -- Yeni talep — SESLİ, havuz/ayardan alıcılara
  insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
  select uid, 'new_operation', 'info', new.code || ' · Yeni talep',
         coalesce(nullif(v_cust,''),'Müşteri') || ' için yeni talep düştü.', 'operation', new.id::text, '/talepler/'||new.id, false
  from public.alert_pool_recipients() uid;

  -- Bilinen müşteri: 30 gün içinde aynı müşteriden ikinci talep → GÖRSEL (sessiz)
  select exists(select 1 from public.operations o2 where o2.customer_id=new.customer_id and o2.id<>new.id
                and o2.created_at > now() - (v_days || ' days')::interval) into v_known;
  if v_known then
    select owner_id into v_last_owner from public.operations o2 where o2.customer_id=new.customer_id and o2.id<>new.id and o2.owner_id is not null
      order by o2.created_at desc limit 1;
    insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
    select distinct uid, 'known_customer', 'warning', new.code || ' · Bilinen müşteriden talep',
           coalesce(nullif(v_cust,''),'Müşteri') || ' yeniden talep açtı — hızlı dönülmeli.', 'operation', new.id::text, '/talepler/'||new.id, true
    from (select uid from public.alert_pool_recipients() uid union select v_last_owner where v_last_owner is not null) r(uid)
    where uid is not null;
  end if;
  return null;
end; $$;

-- İş atandı → GÖRSEL (eskiden sesli). Ses politikası dışı.
create or replace function public.notify_operation_assigned()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is not null and new.owner_id is distinct from old.owner_id
     and (auth.uid() is null or new.owner_id <> auth.uid()) then
    insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
    values (new.owner_id, 'operation_assigned', 'info', new.code || ' · Size atandı',
            'Bir operasyon size atandı.', 'operation', new.id::text, '/talepler/'||new.id, true);
  end if;
  return null;
end; $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 16.2 — TALEP / TEKLİF DURUM DEĞİŞİKLİĞİ → görsel (silent).
-- ═════════════════════════════════════════════════════════════════════════════
-- Talep (operations.request_status_id)
create or replace function public.notify_operation_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_label text;
begin
  if new.request_status_id is distinct from old.request_status_id then
    select label into v_label from public.request_statuses where id = new.request_status_id;
    if new.owner_id is not null then
      insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
      values (new.owner_id, 'operation_status', 'info', new.code || ' · Talep durumu: ' || coalesce(v_label,'—'),
              'Talep durumu güncellendi.', 'operation', new.id::text, '/talepler/'||new.id, true);
    else
      insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
      select uid, 'operation_status', 'info', new.code || ' · Talep durumu: ' || coalesce(v_label,'—'),
             'Talep durumu güncellendi.', 'operation', new.id::text, '/talepler/'||new.id, true
      from public.alert_pool_recipients() uid;
    end if;
  end if;
  return null;
end; $$;
drop trigger if exists notify_operation_status on public.operations;
create trigger notify_operation_status after update of request_status_id on public.operations
  for each row execute function public.notify_operation_status();

-- Teklif (quotes.status_id) → operasyon sorumlusuna görsel
create or replace function public.notify_quote_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_label text; v_owner uuid; v_code text;
begin
  if new.status_id is distinct from old.status_id and new.deleted_at is null then
    select label into v_label from public.quote_statuses where id = new.status_id;
    select owner_id, code into v_owner, v_code from public.operations where id = new.operation_id;
    if v_owner is not null then
      insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
      values (v_owner, 'quote_status', 'info', coalesce(v_code,'Teklif') || ' · Teklif v' || new.version || ' durumu: ' || coalesce(v_label,'—'),
              'Teklif durumu güncellendi.', 'operation', new.operation_id::text, '/talepler/'||new.operation_id, true);
    end if;
  end if;
  return null;
end; $$;
drop trigger if exists notify_quote_status on public.quotes;
create trigger notify_quote_status after update of status_id on public.quotes
  for each row execute function public.notify_quote_status();

-- ═════════════════════════════════════════════════════════════════════════════
-- 16.3 — NUMUNE / SİPARİŞ DURUM DEĞİŞİKLİĞİ → görsel (silent).
-- notify_sample_events yeniden düzenlendi: her durum değişimi tek bir GÖRSEL
-- bildirim üretir (özel kargoda/teslim dalları buna dahil, artık sessiz).
-- 3. revizyon uyarısı da GÖRSEL (ses politikası dışı).
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.notify_sample_events()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_label text; v_owner uuid; v_code text;
begin
  select owner_id, code into v_owner, v_code from public.operations where id = new.operation_id;
  if new.status_id is distinct from old.status_id and v_owner is not null then
    select label into v_label from public.sample_statuses where id = new.status_id;
    insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
    values (v_owner, 'sample_status', 'info', coalesce(v_code,'Numune') || ' · Numune N' || new.version || ' durumu: ' || coalesce(v_label,'—'),
            'Numune durumu güncellendi.', 'operation', new.operation_id::text, '/talepler/'||new.operation_id, true);
  end if;
  -- 3. numune revizyonu → sorumlu + yönetici (GÖRSEL)
  if new.revision_round is distinct from old.revision_round and new.revision_round >= 3 then
    insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
    select distinct uid, 'sample_revision_high', 'warning', v_code || ' · ' || new.revision_round || '. numune revizyonu',
           'Numune ' || new.revision_round || '. kez revize ediliyor — süreç tıkanmış olabilir.', 'operation', new.operation_id::text, '/talepler/'||new.operation_id, true
    from (select v_owner where v_owner is not null union select uid from public.alert_manager_recipients() uid) r(uid) where uid is not null;
  end if;
  return null;
end; $$;

-- Sipariş durum değişikliği → sorumluya görsel
create or replace function public.notify_order_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_label text; v_owner uuid; v_code text;
begin
  if new.status_id is distinct from old.status_id then
    select label into v_label from public.order_statuses where id = new.status_id;
    select owner_id, code into v_owner, v_code from public.operations where id = new.operation_id;
    if v_owner is not null then
      insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
      values (v_owner, 'order_status', 'info', coalesce(v_code,'Sipariş') || ' · Sipariş durumu: ' || coalesce(v_label,'—'),
              'Sipariş durumu güncellendi.', 'operation', new.operation_id::text, '/talepler/'||new.operation_id, true);
    end if;
  end if;
  return null;
end; $$;
drop trigger if exists notify_order_status on public.orders;
create trigger notify_order_status after update of status_id on public.orders
  for each row execute function public.notify_order_status();

-- Ön-ödemesiz üretim uyarısı → GÖRSEL (eskiden sesli). Ses politikası dışı.
create or replace function public.notify_order_production()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_new text; v_paid boolean; v_code text;
begin
  if new.status_id is distinct from old.status_id then
    select key into v_new from public.order_statuses where id = new.status_id;
    if v_new = 'uretimde' then
      select exists(select 1 from public.payments where operation_id = new.operation_id and direction='in' and deleted_at is null) into v_paid;
      if not v_paid then
        select code into v_code from public.operations where id = new.operation_id;
        insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
        select uid, 'production_no_prepayment', 'warning', v_code || ' · Ön ödemesiz üretim',
               'Sipariş ön ödeme alınmadan üretime geçti.', 'operation', new.operation_id::text, '/talepler/'||new.operation_id, true
        from public.alert_manager_recipients() uid;
      end if;
    end if;
  end if;
  return null;
end; $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 16.4 — TEKLİF 1 SAAT KALA → SESLİ. Mevcut yüzde-tabanlı motor korunur; bu yalnız
--        eksik olan "son 1 saat sesli" uyarısını ekler. Bir kez (final_hour_notified_at).
--        Alıcılar mevcut kademe-2 (urgent) yönlendirmesinden gelir.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.process_quote_final_hour()
returns int language plpgsql security definer set search_path = '' as $$
declare rec record; v_code text; v_cnt int := 0; v_won int;
begin
  for rec in
    select * from public.open_files
    where file_type = 'teklif_bekleniyor' and closed_at is null and final_hour_notified_at is null
      and (snooze_until is null or snooze_until <= now())
      and due_at > now() and due_at <= now() + interval '1 hour'
  loop
    update public.open_files set final_hour_notified_at = now()
      where id = rec.id and final_hour_notified_at is null;
    get diagnostics v_won = row_count;
    if v_won > 0 then
      select code into v_code from public.operations where id = rec.operation_id;
      insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
      select uid, 'quote_final_hour', 'critical',
             coalesce(v_code,'Talep') || ' · Teklife 1 saatten az kaldı',
             'Teklif süresine 1 saatten az kaldı — son tarih ' ||
             to_char(rec.due_at at time zone public.app_timezone(), 'HH24:MI') || '.',
             'operation', rec.operation_id::text, '/talepler/'||rec.operation_id, false
      from public.resolve_alert_recipients('teklif_bekleniyor', 2, rec.assigned_to) uid;
      v_cnt := v_cnt + 1;
    end if;
  end loop;
  return v_cnt;
end; $$;
grant execute on function public.process_quote_final_hour() to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 16.5 — TERMİN DOLDU → SESLİ + görsel (numune + sipariş).
-- process_delivery_warnings yeniden düzenlendi: "yaklaşıyor" artık GÖRSEL (silent),
-- "doldu" ise SESLİ (critical). Ayrı bayrak: delivery_warned_at / delivery_overdue_at.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.process_delivery_warnings()
returns int language plpgsql security definer set search_path = '' as $$
declare rec record; v_days int; v_owner uuid; v_code text; v_cnt int := 0;
        v_today date := (now() at time zone public.app_timezone())::date;
begin
  v_days := coalesce((select (value #>> '{}')::int from public.settings where key='alerts.delivery_warning_days'), 3);
  for rec in
    select o.id, o.operation_id, o.promised_delivery, o.delivery_warned_at, o.delivery_overdue_at
    from public.orders o
    join public.order_statuses s on s.id = o.status_id
    where o.deleted_at is null and o.promised_delivery is not null
      and s.key not in ('teslim_edildi','iptal_edildi','tamamlandi','sevk_edildi')
      and (o.delivery_warned_at is null or o.delivery_overdue_at is null)
  loop
    select owner_id, code into v_owner, v_code from public.operations where id = rec.operation_id;
    -- TERMİN DOLDU → SESLİ (critical)
    if rec.promised_delivery < v_today and rec.delivery_overdue_at is null then
      update public.orders set delivery_overdue_at = now() where id = rec.id;
      insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
      select distinct uid, 'delivery_overdue', 'critical', v_code || ' · Termin doldu',
             'Sipariş teslim tarihi ' || to_char(rec.promised_delivery, 'DD.MM.YYYY') || ' geçti — hâlâ teslim edilmedi.',
             'operation', rec.operation_id::text, '/talepler/'||rec.operation_id, false
      from (select v_owner where v_owner is not null union select uid from public.alert_manager_recipients() uid) r(uid) where uid is not null;
      v_cnt := v_cnt + 1;
    -- TERMİN YAKLAŞIYOR → GÖRSEL (silent). Yalnız gelecekteki termin; geçmiş "doldu" dalına girer.
    elsif rec.promised_delivery >= v_today and rec.promised_delivery <= v_today + v_days and rec.delivery_warned_at is null then
      update public.orders set delivery_warned_at = now() where id = rec.id;
      insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
      select distinct uid, 'delivery_soon', 'warning', v_code || ' · Termin yaklaşıyor',
             'Teslim tarihi ' || to_char(rec.promised_delivery, 'DD.MM.YYYY') || ' — ' || v_days || ' gün veya daha az kaldı.',
             'operation', rec.operation_id::text, '/talepler/'||rec.operation_id, true
      from (select v_owner where v_owner is not null union select uid from public.alert_manager_recipients() uid) r(uid) where uid is not null;
      v_cnt := v_cnt + 1;
    end if;
  end loop;
  return v_cnt;
end; $$;
grant execute on function public.process_delivery_warnings() to authenticated;

-- Numune termini doldu → SESLİ (critical). Bir kez (overdue_warned_at).
create or replace function public.process_sample_due_warnings()
returns int language plpgsql security definer set search_path = '' as $$
declare rec record; v_owner uuid; v_code text; v_cnt int := 0;
        v_today date := (now() at time zone public.app_timezone())::date;
begin
  for rec in
    select s.id, s.operation_id, s.version, s.target_date
    from public.samples s
    join public.sample_statuses st on st.id = s.status_id
    where s.deleted_at is null and s.target_date is not null and s.overdue_warned_at is null
      and not st.is_closed
      and s.target_date < v_today
  loop
    update public.samples set overdue_warned_at = now() where id = rec.id and overdue_warned_at is null;
    if not found then continue; end if;
    select owner_id, code into v_owner, v_code from public.operations where id = rec.operation_id;
    insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
    select distinct uid, 'sample_overdue', 'critical', v_code || ' · Numune termini doldu',
           'Numune N' || rec.version || ' termini ' || to_char(rec.target_date, 'DD.MM.YYYY') || ' geçti.',
           'operation', rec.operation_id::text, '/talepler/'||rec.operation_id, false
    from (select v_owner where v_owner is not null union select uid from public.alert_manager_recipients() uid) r(uid) where uid is not null;
    v_cnt := v_cnt + 1;
  end loop;
  return v_cnt;
end; $$;
grant execute on function public.process_sample_due_warnings() to authenticated;
