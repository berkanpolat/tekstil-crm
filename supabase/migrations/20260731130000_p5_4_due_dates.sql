-- =====================================================================
-- P5.4 — Vade takibi. orders'a ön ödeme/bakiye vadesi + bildirim motoru.
--   Yeni açık dosya tipi AÇILMAZ; mevcut bildirim altyapısı yeterli.
--   notifications.type: payment_due_soon (vade yaklaştı), payment_overdue (geçti).
--   Tetikleme: istemci useNotifications aralıkla process_payment_due_warnings çağırır.
-- =====================================================================

alter table public.orders
  add column advance_due_date date,   -- ön ödeme vadesi
  add column balance_due_date date,   -- bakiye vadesi
  -- tekrar bildirmeyi önleyen bayraklar (delivery_warned_at deseni)
  add column advance_due_warned_at   timestamptz,
  add column advance_overdue_at      timestamptz,
  add column balance_due_warned_at   timestamptz,
  add column balance_overdue_at      timestamptz;

comment on column public.orders.advance_due_date is 'Ön ödeme vadesi. payment_terms''ten türetilebilir, elle değiştirilebilir.';
comment on column public.orders.balance_due_date is 'Bakiye vadesi. payment_terms''ten türetilebilir, elle değiştirilebilir.';

-- Vade DEĞİŞİRSE ilgili bayrağı sıfırla (yeni vadeye göre yeniden uyarılabilsin).
create or replace function public.orders_reset_due_flags()
returns trigger language plpgsql as $$
begin
  if new.advance_due_date is distinct from old.advance_due_date then
    new.advance_due_warned_at := null; new.advance_overdue_at := null;
  end if;
  if new.balance_due_date is distinct from old.balance_due_date then
    new.balance_due_warned_at := null; new.balance_overdue_at := null;
  end if;
  return new;
end; $$;
create trigger orders_due_flags before update of advance_due_date, balance_due_date on public.orders
  for each row execute function public.orders_reset_due_flags();

-- Ödeme uyarı gün sayısı ayarı (vade N gün kala).
insert into public.settings (key, value, category, description) values
  ('alerts.payment_warning_days', '3'::jsonb, 'alerts', 'Ödeme vadesine bu kadar gün kala uyarı verilir.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- process_payment_due_warnings — vade yaklaşan/geçen, ödemesi eksik siparişler.
--   Ön ödeme vadesi: ön ödeme yetersizse. Bakiye vadesi: kalan tahsilat > 0 ise.
--   Alıcı: operasyon sahibi + yönetici alıcıları (alert_manager_recipients).
-- ---------------------------------------------------------------------
create or replace function public.process_payment_due_warnings()
returns int language plpgsql security definer set search_path = '' as $$
declare
  rec record; v_days int; v_owner uuid; v_code text; v_cnt int := 0;
  v_today date := (now() at time zone public.app_timezone())::date;
  v_chk jsonb; v_sum jsonb; v_open boolean;
begin
  v_days := coalesce((select (value #>> '{}')::int from public.settings where key='alerts.payment_warning_days'), 3);

  for rec in
    select o.id, o.operation_id, o.advance_due_date, o.balance_due_date,
           o.advance_due_warned_at, o.advance_overdue_at, o.balance_due_warned_at, o.balance_overdue_at
    from public.orders o join public.order_statuses s on s.id = o.status_id
    where o.deleted_at is null and s.key not in ('teslim_edildi','iptal_edildi')
      and (o.advance_due_date is not null or o.balance_due_date is not null)
  loop
    select owner_id, code into v_owner, v_code from public.operations where id = rec.operation_id;
    v_chk := public.order_advance_check(rec.id);
    v_sum := public.order_paid_summary(rec.id);

    -- ÖN ÖDEME vadesi — yalnız ön ödeme hâlâ yetersizse
    if rec.advance_due_date is not null and not (v_chk->>'sufficient')::boolean then
      if rec.advance_due_date < v_today and rec.advance_overdue_at is null then
        update public.orders set advance_overdue_at = now() where id = rec.id;
        perform public.notify_payment(rec.operation_id, v_owner, v_code, 'payment_overdue', 'critical',
          'Ön ödeme vadesi geçti', 'Ön ödeme vadesi ' || to_char(rec.advance_due_date,'DD.MM.YYYY') || ' doldu, ön ödeme hâlâ eksik.');
        v_cnt := v_cnt + 1;
      elsif rec.advance_due_date <= v_today + v_days and rec.advance_due_warned_at is null then
        update public.orders set advance_due_warned_at = now() where id = rec.id;
        perform public.notify_payment(rec.operation_id, v_owner, v_code, 'payment_due_soon', 'warning',
          'Ön ödeme vadesi yaklaşıyor', 'Ön ödeme vadesi ' || to_char(rec.advance_due_date,'DD.MM.YYYY') || ' — ' || v_days || ' gün veya daha az kaldı.');
        v_cnt := v_cnt + 1;
      end if;
    end if;

    -- BAKİYE vadesi — yalnız kalan tahsilat > 0 ise
    v_open := coalesce((v_sum->>'remaining_usd')::numeric, 0) > 0.005;
    if rec.balance_due_date is not null and v_open then
      if rec.balance_due_date < v_today and rec.balance_overdue_at is null then
        update public.orders set balance_overdue_at = now() where id = rec.id;
        perform public.notify_payment(rec.operation_id, v_owner, v_code, 'payment_overdue', 'critical',
          'Bakiye vadesi geçti', 'Bakiye vadesi ' || to_char(rec.balance_due_date,'DD.MM.YYYY') || ' doldu, tahsilat tamamlanmadı.');
        v_cnt := v_cnt + 1;
      elsif rec.balance_due_date <= v_today + v_days and rec.balance_due_warned_at is null then
        update public.orders set balance_due_warned_at = now() where id = rec.id;
        perform public.notify_payment(rec.operation_id, v_owner, v_code, 'payment_due_soon', 'warning',
          'Bakiye vadesi yaklaşıyor', 'Bakiye vadesi ' || to_char(rec.balance_due_date,'DD.MM.YYYY') || ' — ' || v_days || ' gün veya daha az kaldı.');
        v_cnt := v_cnt + 1;
      end if;
    end if;
  end loop;
  return v_cnt;
end; $$;
grant execute on function public.process_payment_due_warnings() to authenticated;

-- Ödeme bildirimi ekleyici (sahibi + yönetici alıcıları).
create or replace function public.notify_payment(p_op bigint, p_owner uuid, p_code text, p_type text, p_sev text, p_title text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
  select distinct uid, p_type, p_sev, coalesce(p_code,'Sipariş') || ' · ' || p_title, p_body,
         'operation', p_op::text, '/talepler/' || p_op, false
  from (select p_owner where p_owner is not null union select uid from public.alert_manager_recipients() uid) r(uid)
  where uid is not null;
end; $$;
