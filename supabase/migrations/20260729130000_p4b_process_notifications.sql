-- =====================================================================
-- B.8 — SÜREÇ BİLDİRİMLERİ. Açık dosya dışındaki, işleyişte eksik bildirimler. Her birinin
-- ses davranışı ayrı (notifications.silent) — gürültü olmasın. Yeni talep SESSİZ (saatte on
-- talep gelir), bilinen müşteri SESLİ, iş atandı SESLİ, numune teslim SESLİ, termin/ön-ödemesiz/
-- 3.revizyon SESLİ. Görev bildirimleri YOK (Faz 6) — notifications.type açık kalır.
-- =====================================================================
alter table public.notifications add column if not exists silent boolean not null default false;
alter table public.orders add column if not exists delivery_warned_at timestamptz;

insert into public.settings (key, value, category, description) values
  ('alerts.delivery_warning_days', '3'::jsonb, 'alerts', 'Termin (promised_delivery) kaç gün kala uyarılsın.'),
  ('alerts.known_customer_days',   '30'::jsonb, 'alerts', 'Aynı müşteriden bu kadar gün içinde ikinci talep → bilinen müşteri uyarısı.')
on conflict (key) do nothing;

-- Havuz (ayardan) alıcıları — settings.alerts.pool_recipients
create or replace function public.alert_pool_recipients()
returns setof uuid language plpgsql stable security definer set search_path = '' as $$
declare e jsonb;
begin
  for e in select jsonb_array_elements(coalesce((select value from public.settings where key='alerts.pool_recipients'), '[]'::jsonb)) loop
    if e->>'type' = 'kisi' then return query select id from public.users where id = (e->>'ref')::uuid and is_active;
    elsif e->>'type' = 'departman' then return query select id from public.users where department_id = (e->>'ref')::bigint and is_active;
    elsif e->>'type' = 'rol' then return query select u.id from public.users u join public.roles r on r.id=u.role_id where r.key = e->>'ref' and u.is_active;
    end if;
  end loop;
end; $$;

-- Yönetici alıcıları (owner/admin/manager)
create or replace function public.alert_manager_recipients()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select u.id from public.users u join public.roles r on r.id=u.role_id where r.key in ('owner','admin','manager') and u.is_active;
$$;

-- ── Yeni talep + bilinen müşteri (operations INSERT) ────────────────────────
create or replace function public.notify_new_operation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_known boolean; v_last_owner uuid; v_days int; v_cust text;
begin
  v_days := coalesce((select (value #>> '{}')::int from public.settings where key='alerts.known_customer_days'), 30);
  select coalesce(company_name, full_name, '') into v_cust from public.customers where id = new.customer_id;
  -- Yeni talep — SESSİZ, havuz/ayardan alıcılara
  insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
  select uid, 'new_operation', 'info', new.code || ' · Yeni talep',
         coalesce(nullif(v_cust,''),'Müşteri') || ' için yeni talep düştü.', 'operation', new.id::text, '/talepler/'||new.id, true
  from public.alert_pool_recipients() uid;

  -- Bilinen müşteri: 30 gün içinde aynı müşteriden ikinci talep VEYA daha önce talebi olan müşteri
  select exists(select 1 from public.operations o2 where o2.customer_id=new.customer_id and o2.id<>new.id
                and o2.created_at > now() - (v_days || ' days')::interval) into v_known;
  if v_known then
    select owner_id into v_last_owner from public.operations o2 where o2.customer_id=new.customer_id and o2.id<>new.id and o2.owner_id is not null
      order by o2.created_at desc limit 1;
    -- SESLİ — havuz + müşterinin son sorumlusu
    insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
    select distinct uid, 'known_customer', 'warning', new.code || ' · Bilinen müşteriden talep',
           coalesce(nullif(v_cust,''),'Müşteri') || ' yeniden talep açtı — hızlı dönülmeli.', 'operation', new.id::text, '/talepler/'||new.id, false
    from (select uid from public.alert_pool_recipients() uid union select v_last_owner where v_last_owner is not null) r(uid)
    where uid is not null;
  end if;
  return null;
end; $$;
create trigger notify_new_operation after insert on public.operations for each row execute function public.notify_new_operation();

-- ── İş atandı (owner null→dolu, başkası atadıysa) ───────────────────────────
create or replace function public.notify_operation_assigned()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is not null and new.owner_id is distinct from old.owner_id
     and (auth.uid() is null or new.owner_id <> auth.uid()) then  -- kendi üstlenmesi değilse
    insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
    values (new.owner_id, 'operation_assigned', 'info', new.code || ' · Size atandı',
            'Bir operasyon size atandı.', 'operation', new.id::text, '/talepler/'||new.id, false);
  end if;
  return null;
end; $$;
create trigger notify_operation_assigned after update of owner_id on public.operations for each row execute function public.notify_operation_assigned();

-- ── Numune kargoda (sessiz) / teslim edildi (sesli) + 3. revizyon ───────────
create or replace function public.notify_sample_events()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_new text; v_old text; v_owner uuid; v_code text;
begin
  select owner_id, code into v_owner, v_code from public.operations where id = new.operation_id;
  if new.status_id is distinct from old.status_id then
    select key into v_new from public.sample_statuses where id = new.status_id;
    if v_new = 'kargoda' and v_owner is not null then
      insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
      values (v_owner, 'sample_shipped', 'info', v_code || ' · Numune kargoda', 'Numune kargoya verildi.', 'operation', new.operation_id::text, '/talepler/'||new.operation_id, true);
    elsif v_new = 'teslim_edildi' and v_owner is not null then
      insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
      values (v_owner, 'sample_delivered', 'info', v_code || ' · Numune teslim edildi', 'Numune müşteriye teslim edildi.', 'operation', new.operation_id::text, '/talepler/'||new.operation_id, false);
    end if;
  end if;
  -- 3. numune revizyonu → sorumlu + yönetici (sesli)
  if new.revision_round is distinct from old.revision_round and new.revision_round >= 3 then
    insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
    select distinct uid, 'sample_revision_high', 'warning', v_code || ' · ' || new.revision_round || '. numune revizyonu',
           'Numune ' || new.revision_round || '. kez revize ediliyor — süreç tıkanmış olabilir.', 'operation', new.operation_id::text, '/talepler/'||new.operation_id, false
    from (select v_owner where v_owner is not null union select uid from public.alert_manager_recipients() uid) r(uid) where uid is not null;
  end if;
  return null;
end; $$;
create trigger notify_sample_events after update on public.samples for each row execute function public.notify_sample_events();

-- ── Ön ödemesiz üretim (order → uretimde, ödeme yoksa) → yönetici ───────────
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
               'Sipariş ön ödeme alınmadan üretime geçti.', 'operation', new.operation_id::text, '/talepler/'||new.operation_id, false
        from public.alert_manager_recipients() uid;
      end if;
    end if;
  end if;
  return null;
end; $$;
create trigger notify_order_production after update of status_id on public.orders for each row execute function public.notify_order_production();

-- ── Termin yaklaşıyor (zaman-tabanlı; poller çağırır) ───────────────────────
create or replace function public.process_delivery_warnings()
returns int language plpgsql security definer set search_path = '' as $$
declare rec record; v_days int; v_owner uuid; v_code text; v_cnt int := 0;
begin
  v_days := coalesce((select (value #>> '{}')::int from public.settings where key='alerts.delivery_warning_days'), 3);
  for rec in
    select o.id, o.operation_id, o.promised_delivery from public.orders o
    join public.order_statuses s on s.id = o.status_id
    where o.deleted_at is null and o.promised_delivery is not null and o.delivery_warned_at is null
      and s.key not in ('teslim_edildi','iptal_edildi','tamamlandi','sevk_edildi')
      and o.promised_delivery::date <= (now() at time zone public.app_timezone())::date + v_days
  loop
    update public.orders set delivery_warned_at = now() where id = rec.id;
    select owner_id, code into v_owner, v_code from public.operations where id = rec.operation_id;
    insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
    select distinct uid, 'delivery_soon', 'warning', v_code || ' · Termin yaklaşıyor',
           'Teslim tarihi ' || to_char(rec.promised_delivery::date, 'DD.MM.YYYY') || ' — ' || v_days || ' gün veya daha az kaldı.',
           'operation', rec.operation_id::text, '/talepler/'||rec.operation_id, false
    from (select v_owner where v_owner is not null union select uid from public.alert_manager_recipients() uid) r(uid) where uid is not null;
    v_cnt := v_cnt + 1;
  end loop;
  return v_cnt;
end; $$;
grant execute on function public.process_delivery_warnings() to authenticated;
