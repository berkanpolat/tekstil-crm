-- metrics.metric_genel için public sarmalayıcı (PostgREST rpc public şemadan çağırır; diğer metrikler gibi).
create or replace function public.metric_genel(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path to ''
as $$ select metrics.metric_genel(p_from, p_to) $$;
grant execute on function public.metric_genel(timestamptz, timestamptz) to authenticated;
