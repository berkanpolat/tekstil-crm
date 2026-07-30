-- =====================================================================
-- 1.7 — Müşteri özet kartı için tek-çağrılık özet.
--   Sayımlar + son etkileşim herkese; ciro/bakiye YALNIZ finance.view olana
--   (QA#1 sızıntı kuralı — security definer olsa da izin kontrol edilir).
-- =====================================================================
create or replace function public.customer_summary(p_customer_id bigint)
returns jsonb language sql stable security definer set search_path = '' as $function$
  select jsonb_build_object(
    'talep',      (select count(*) from public.operations o where o.customer_id = p_customer_id and o.deleted_at is null),
    'teklif',     (select count(*) from public.quotes q join public.operations o on o.id = q.operation_id
                     where o.customer_id = p_customer_id and q.deleted_at is null),
    'numune',     (select count(*) from public.samples s join public.operations o on o.id = s.operation_id
                     where o.customer_id = p_customer_id and s.deleted_at is null),
    'siparis',    (select count(*) from public.orders r join public.operations o on o.id = r.operation_id
                     where o.customer_id = p_customer_id and r.deleted_at is null),
    'acik_dosya', (select count(*) from public.open_files f join public.operations o on o.id = f.operation_id
                     where o.customer_id = p_customer_id and f.closed_at is null),
    'last_interaction', (select max(occurred_at) from public.interactions
                     where entity_type = 'customer' and entity_id = p_customer_id and deleted_at is null),
    'ciro_usd', case when public.has_permission('finance.view')
      then (select coalesce(sum(amount_usd), 0) from public.account_transactions
              where customer_id = p_customer_id and direction = 'borc' and deleted_at is null) else null end,
    'balance_usd', case when public.has_permission('finance.view')
      then (select coalesce(sum(case when direction = 'alacak' then amount_usd else -amount_usd end), 0)
              from public.account_transactions where customer_id = p_customer_id and deleted_at is null) else null end
  );
$function$;
revoke all on function public.customer_summary(bigint) from anon;
grant execute on function public.customer_summary(bigint) to authenticated;
