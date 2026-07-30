-- =====================================================================
-- P5.5 — Finans ekranı için toplama fonksiyonları (finance.view gerektirir).
--   open_balances()  — bakiyesi sıfır olmayan müşteriler (Açık Bakiyeler sekmesi)
--   due_payments()   — vadesi yaklaşan/geçen, ödemesi eksik siparişler (Vadesi Gelenler)
--   finance_summary()— özet kartları
--   Hareketler ve Ödemeler sekmeleri istemciden doğrudan sorgulanır (RLS finance.view).
-- =====================================================================

-- ---------------------------------------------------------------------
-- open_balances — her müşterinin cari bakiyesi (alacak−borç). Negatif = borçlu.
-- ---------------------------------------------------------------------
create or replace function public.open_balances()
returns table (customer_id bigint, customer_name text, balance_usd numeric, balance_try numeric, last_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('finance.view') then return; end if;
  return query
    select t.customer_id,
           coalesce(c.company_name, c.full_name, '#' || t.customer_id),
           round(sum(case t.direction when 'alacak' then t.amount_usd else -t.amount_usd end), 2),
           round(sum(case t.direction when 'alacak' then t.amount_try else -t.amount_try end), 2),
           max(t.occurred_at)
    from public.account_transactions t
    join public.customers c on c.id = t.customer_id
    where t.deleted_at is null
    group by t.customer_id, c.company_name, c.full_name
    having abs(sum(case t.direction when 'alacak' then t.amount_usd else -t.amount_usd end)) > 0.005
        or abs(sum(case t.direction when 'alacak' then t.amount_try else -t.amount_try end)) > 0.005
    order by sum(case t.direction when 'alacak' then t.amount_usd else -t.amount_usd end) asc;  -- en borçlu üstte
end; $$;
grant execute on function public.open_balances() to authenticated;

-- ---------------------------------------------------------------------
-- due_payments — vadesi tanımlı, ödemesi eksik aktif siparişler.
-- ---------------------------------------------------------------------
create or replace function public.due_payments()
returns table (
  order_id bigint, operation_id bigint, operation_code text, customer_id bigint, customer_name text,
  due_kind text, due_date date, days_left int, amount_usd numeric, sufficient boolean
) language plpgsql stable security definer set search_path = '' as $$
declare v_today date := (now() at time zone public.app_timezone())::date;
begin
  if not public.has_permission('finance.view') then return; end if;
  return query
    with base as (
      select o.id, o.operation_id, op.code, op.customer_id,
             coalesce(c.company_name, c.full_name) as cname,
             o.advance_due_date, o.balance_due_date,
             public.order_advance_check(o.id) as chk, public.order_paid_summary(o.id) as sum
      from public.orders o
      join public.operations op on op.id = o.operation_id
      join public.customers c on c.id = op.customer_id
      join public.order_statuses s on s.id = o.status_id
      where o.deleted_at is null and s.key not in ('teslim_edildi','iptal_edildi')
        and (o.advance_due_date is not null or o.balance_due_date is not null)
    )
    -- ön ödeme vadesi (yetersizse)
    select b.id, b.operation_id, b.code, b.customer_id, b.cname, 'on_odeme', b.advance_due_date,
           (b.advance_due_date - v_today), (b.chk->>'required_usd')::numeric, (b.chk->>'sufficient')::boolean
    from base b where b.advance_due_date is not null and not (b.chk->>'sufficient')::boolean
    union all
    -- bakiye vadesi (kalan > 0 ise)
    select b.id, b.operation_id, b.code, b.customer_id, b.cname, 'bakiye', b.balance_due_date,
           (b.balance_due_date - v_today), (b.sum->>'remaining_usd')::numeric, false
    from base b where b.balance_due_date is not null and (b.sum->>'remaining_usd')::numeric > 0.005
    order by 7 asc;  -- days_left artan (en geçmiş üstte)
end; $$;
grant execute on function public.due_payments() to authenticated;

-- ---------------------------------------------------------------------
-- finance_summary — özet kartları.
-- ---------------------------------------------------------------------
create or replace function public.finance_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_month_start date := date_trunc('month', (now() at time zone public.app_timezone()))::date;
  v_today date := (now() at time zone public.app_timezone())::date;
  v_res jsonb;
begin
  if not public.has_permission('finance.view') then return '{}'::jsonb; end if;
  with bal as (select * from public.open_balances()),
  due as (select * from public.due_payments()),
  -- ön ödemesi eksik AKTİF siparişler (vade şartı yok)
  adv as (
    select o.id from public.orders o join public.order_statuses s on s.id=o.status_id
    where o.deleted_at is null and s.key not in ('teslim_edildi','iptal_edildi') and o.total > 0
      and not (public.order_advance_check(o.id)->>'sufficient')::boolean
  )
  select jsonb_build_object(
    -- Açık alacak = borçlu müşterilerin toplam borcu (negatif bakiyeler)
    'open_receivable_usd', coalesce((select round(-sum(balance_usd),2) from bal where balance_usd < 0), 0),
    'open_receivable_try', coalesce((select round(-sum(balance_try),2) from bal where balance_try < 0), 0),
    -- Vadesi geçen (bakiye vadesi geçmiş, kalan tutar)
    'overdue_usd', coalesce((select round(sum(amount_usd),2) from due where due_kind='bakiye' and days_left < 0), 0),
    -- Bu ay tahsil edilen (gelen ödemeler)
    'collected_month_try', coalesce((select round(sum(amount_try),2) from public.payments where direction='gelen' and deleted_at is null and paid_at >= v_month_start), 0),
    'collected_month_usd', coalesce((select round(sum(amount_usd),2) from public.payments where direction='gelen' and deleted_at is null and paid_at >= v_month_start), 0),
    -- Ön ödemesi eksik sipariş sayısı (aktif)
    'advance_missing_count', coalesce((select count(*) from adv), 0),
    'as_of', v_today
  ) into v_res;
  return v_res;
end; $$;
grant execute on function public.finance_summary() to authenticated;
