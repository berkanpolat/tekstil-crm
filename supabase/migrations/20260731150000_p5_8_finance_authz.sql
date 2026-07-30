-- =====================================================================
-- P5.8 — Finans yetkilendirmesi.
--   • sales rolü finance.view alır (kendi müşterisini görür, ödeme KAYDEDEMEZ).
--   • payments RLS finance.view/edit'e daraltılır (Faz 4A'daki is_active_user SIZINTIYDI).
--   • account_transactions + payments select: sales yalnız SORUMLU olduğu müşteriyi görür.
--   • open_balances/due_payments/finance_summary sales için kısıtlanır.
-- Kabul 19: finans yetkisi olmayan HİÇBİR finansal veri göremez.
-- =====================================================================

-- sales → finance.view (yalnız görüntüleme; edit YOK)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'finance.view'
where r.key = 'sales'
on conflict do nothing;

-- Tüm finansı görebilen roller (sales HARİÇ). Sales yalnız kendi müşterisini görür.
create or replace function public.finance_scope_all()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users u join public.roles r on r.id = u.role_id
    where u.id = auth.uid() and u.is_active and u.deleted_at is null
      and r.key in ('owner','admin','manager','finance')
  );
$$;
grant execute on function public.finance_scope_all() to authenticated;

-- Bir müşterinin finansı bana görünür mü? (finance.view + (tümü VEYA benim müşterim))
create or replace function public.finance_customer_visible(p_customer_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_permission('finance.view') and (
    public.finance_scope_all()
    or exists (select 1 from public.customers c where c.id = p_customer_id and c.assigned_to = auth.uid())
  );
$$;
grant execute on function public.finance_customer_visible(bigint) to authenticated;

-- ── account_transactions: select'e sales-kapsam eklenir ──────────────────────
drop policy if exists account_tx_select on public.account_transactions;
create policy account_tx_select on public.account_transactions
  for select to authenticated using (public.finance_customer_visible(customer_id));

-- ── payments RLS: is_active_user → finance ──────────────────────────────────
drop policy if exists payments_select on public.payments;
drop policy if exists payments_insert on public.payments;
drop policy if exists payments_update on public.payments;
create policy payments_select on public.payments
  for select to authenticated using (customer_id is null and public.has_permission('finance.view') or public.finance_customer_visible(customer_id));
create policy payments_insert on public.payments
  for insert to authenticated with check (public.has_permission('finance.edit'));
create policy payments_update on public.payments
  for update to authenticated using (public.has_permission('finance.edit')) with check (public.has_permission('finance.edit'));

-- ── open_balances / due_payments / finance_summary: sales kapsamı ────────────
create or replace function public.open_balances()
returns table (customer_id bigint, customer_name text, balance_usd numeric, balance_try numeric, last_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_all boolean := public.finance_scope_all(); v_uid uuid := auth.uid();
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
    where t.deleted_at is null and (v_all or c.assigned_to = v_uid)
    group by t.customer_id, c.company_name, c.full_name
    having abs(sum(case t.direction when 'alacak' then t.amount_usd else -t.amount_usd end)) > 0.005
        or abs(sum(case t.direction when 'alacak' then t.amount_try else -t.amount_try end)) > 0.005
    order by sum(case t.direction when 'alacak' then t.amount_usd else -t.amount_usd end) asc;
end; $$;

create or replace function public.due_payments()
returns table (
  order_id bigint, operation_id bigint, operation_code text, customer_id bigint, customer_name text,
  due_kind text, due_date date, days_left int, amount_usd numeric, sufficient boolean
) language plpgsql stable security definer set search_path = '' as $$
declare v_today date := (now() at time zone public.app_timezone())::date;
  v_all boolean := public.finance_scope_all(); v_uid uuid := auth.uid();
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
        and (v_all or c.assigned_to = v_uid)
    )
    select b.id, b.operation_id, b.code, b.customer_id, b.cname, 'on_odeme', b.advance_due_date,
           (b.advance_due_date - v_today), (b.chk->>'required_usd')::numeric, (b.chk->>'sufficient')::boolean
    from base b where b.advance_due_date is not null and not (b.chk->>'sufficient')::boolean
    union all
    select b.id, b.operation_id, b.code, b.customer_id, b.cname, 'bakiye', b.balance_due_date,
           (b.balance_due_date - v_today), (b.sum->>'remaining_usd')::numeric, false
    from base b where b.balance_due_date is not null and (b.sum->>'remaining_usd')::numeric > 0.005
    order by 7 asc;
end; $$;

create or replace function public.finance_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_month_start date := date_trunc('month', (now() at time zone public.app_timezone()))::date;
  v_today date := (now() at time zone public.app_timezone())::date;
  v_all boolean := public.finance_scope_all(); v_uid uuid := auth.uid();
  v_res jsonb;
begin
  if not public.has_permission('finance.view') then return '{}'::jsonb; end if;
  with bal as (select * from public.open_balances()),      -- zaten kapsamlı
  due as (select * from public.due_payments()),            -- zaten kapsamlı
  adv as (
    select o.id from public.orders o
    join public.order_statuses s on s.id=o.status_id
    join public.operations op on op.id=o.operation_id
    join public.customers c on c.id=op.customer_id
    where o.deleted_at is null and s.key not in ('teslim_edildi','iptal_edildi') and o.total > 0
      and (v_all or c.assigned_to = v_uid)
      and not (public.order_advance_check(o.id)->>'sufficient')::boolean
  ),
  pay as (
    select p.amount_try, p.amount_usd from public.payments p
    left join public.customers c on c.id = p.customer_id
    where p.direction='gelen' and p.deleted_at is null and p.paid_at >= v_month_start
      and (v_all or c.assigned_to = v_uid)
  )
  select jsonb_build_object(
    'open_receivable_usd', coalesce((select round(-sum(balance_usd),2) from bal where balance_usd < 0), 0),
    'open_receivable_try', coalesce((select round(-sum(balance_try),2) from bal where balance_try < 0), 0),
    'overdue_usd', coalesce((select round(sum(amount_usd),2) from due where due_kind='bakiye' and days_left < 0), 0),
    'collected_month_try', coalesce((select round(sum(amount_try),2) from pay), 0),
    'collected_month_usd', coalesce((select round(sum(amount_usd),2) from pay), 0),
    'advance_missing_count', coalesce((select count(*) from adv), 0),
    'as_of', v_today
  ) into v_res;
  return v_res;
end; $$;
