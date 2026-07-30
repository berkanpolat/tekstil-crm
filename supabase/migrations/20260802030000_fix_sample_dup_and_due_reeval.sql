-- =====================================================================
-- İki düzeltme (kullanıcı geri bildirimi, 28 Tem 2026)
--
-- (1) SAMPLE REVİZYON ÇİFTLİĞİ: iki mekanizma vardı —
--     • revise_sample(id,reason): AYNI kayıtta revision_round++ (UI'nin
--       "Revize" butonu bunu çağırır — DOĞRU yol).
--     • create_sample_revision(id): YENİ satır ekler, round'u ARTIRMAZ
--       (yalnız revision_of_sample_id bağlar). UI'de çağıran YOK (ölü).
--     İki model kafa karıştırıcı + round tutarsız. Ölü fonksiyonu düşür;
--     tek gerçek yol revise_sample kalsın.
--
-- (2) VADE DEĞİŞİNCE GECİKME KAYBI: orders_reset_due_flags (BEFORE UPDATE)
--     vade değişince *_overdue_at/*_warned_at'ı null'lar. Amaç: motorun yeni
--     vadeye göre yeniden bildirim üretmesi. Ama motor (process_payment_due
--     _warnings) yalnız istemci pollingiyle çalışıyor (pg_cron YOK) → edit ile
--     sonraki poll arası gecikme bayrağı YANLIŞ (raporlar eksik sayar).
--     Çözüm: vade değişiminde ANINDA yeniden hesapla. Motorun tek-sipariş
--     mantığını evaluate_order_due()'ya çıkar; AFTER trigger vade değişince
--     çağırsın (bayrağı doğru kur + gerekiyorsa bildir). Motor da bunu döngüde
--     kullanır (tek kaynak).
-- =====================================================================

-- (1) Ölü çift fonksiyonu düşür ------------------------------------------------
drop function if exists public.create_sample_revision(bigint);

-- (2a) Tek-sipariş vade değerlendirmesi (motor gövdesinden çıkarıldı) ---------
create or replace function public.evaluate_order_due(p_order_id bigint)
returns int language plpgsql security definer set search_path = '' as $$
declare
  rec record; v_days int; v_owner uuid; v_code text; v_cnt int := 0;
  v_today date := (now() at time zone public.app_timezone())::date;
  v_chk jsonb; v_sum jsonb; v_open boolean;
begin
  select o.id, o.operation_id, o.advance_due_date, o.balance_due_date,
         o.advance_due_warned_at, o.advance_overdue_at, o.balance_due_warned_at, o.balance_overdue_at
    into rec
    from public.orders o join public.order_statuses s on s.id = o.status_id
    where o.id = p_order_id and o.deleted_at is null and s.key not in ('teslim_edildi','iptal_edildi')
      and (o.advance_due_date is not null or o.balance_due_date is not null);
  if not found then return 0; end if;

  v_days := coalesce((select (value #>> '{}')::int from public.settings where key='alerts.payment_warning_days'), 3);
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

  return v_cnt;
end $$;
grant execute on function public.evaluate_order_due(bigint) to authenticated;

-- (2b) Motor artık tek-sipariş değerlendirmesini döngüde çağırır (tek kaynak) --
create or replace function public.process_payment_due_warnings()
returns int language plpgsql security definer set search_path = '' as $$
declare rec record; v_cnt int := 0;
begin
  for rec in
    select o.id
    from public.orders o join public.order_statuses s on s.id = o.status_id
    where o.deleted_at is null and s.key not in ('teslim_edildi','iptal_edildi')
      and (o.advance_due_date is not null or o.balance_due_date is not null)
  loop
    v_cnt := v_cnt + public.evaluate_order_due(rec.id);
  end loop;
  return v_cnt;
end $$;
grant execute on function public.process_payment_due_warnings() to authenticated;

-- (2c) Vade değişince ANINDA yeniden hesapla (BEFORE reset temizler → AFTER kurar)
create or replace function public.orders_reeval_due()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.evaluate_order_due(new.id);
  return null;  -- AFTER trigger
end $$;

-- Yalnız vade kolonları değişince (INSERT'te de) tetiklenir; overdue_at/warned_at
-- yazımı bu trigger'ı YENİDEN tetiklemez (UPDATE OF vade kolonları) → özyineleme yok.
drop trigger if exists orders_reeval_due on public.orders;
create trigger orders_reeval_due
  after insert or update of advance_due_date, balance_due_date on public.orders
  for each row execute function public.orders_reeval_due();
