-- =====================================================================
-- P7.3 — Talep eğilimi (günlük seri). metric_requests saat/şehir/landing
-- kırıyor ama gün yok. Bu fonksiyon dönem boyunca günlük talep sayısını
-- boşluklar 0 dolu döndürür (çizgi grafik). Panel + talep raporu (P7.5)
-- aynı kaynağı kullanır. reports.view guard'lı; gün gruplaması app_timezone.
-- =====================================================================
create or replace function metrics.metric_request_trend(p_from timestamptz, p_to timestamptz, p_scope_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_tz text := public.app_timezone(); v jsonb;
begin
  perform metrics.guard(p_scope_user);
  with days as (
    select generate_series(
      date_trunc('day', p_from at time zone v_tz),
      date_trunc('day', p_to at time zone v_tz),
      interval '1 day')::date d
  ),
  cnt as (
    select (o.requested_at at time zone v_tz)::date d, count(*) c
    from public.operations o
    where o.deleted_at is null and o.requested_at >= p_from and o.requested_at < p_to
      and (p_scope_user is null or o.owner_id = p_scope_user)
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('day', to_char(days.d,'YYYY-MM-DD'), 'count', coalesce(cnt.c,0)) order by days.d), '[]')
  into v from days left join cnt on cnt.d = days.d;
  return v;
end $$;

create or replace function public.metric_request_trend(p_from timestamptz, p_to timestamptz, p_scope_user uuid default null)
returns jsonb language sql stable as $$ select metrics.metric_request_trend(p_from, p_to, p_scope_user) $$;

grant execute on function public.metric_request_trend(timestamptz,timestamptz,uuid) to authenticated;
revoke execute on function public.metric_request_trend(timestamptz,timestamptz,uuid) from anon;
