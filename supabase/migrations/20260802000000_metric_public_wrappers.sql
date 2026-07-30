-- =====================================================================
-- P7.3 — public.metric_* köprüleri
-- metrics.* fonksiyonları PostgREST'e kapalı (yalnız public exposed).
-- Frontend supabase.rpc('metric_x') public'i çağırır; bu köprüler
-- SECURITY INVOKER olup metrics.*'i çağırır → guard (auth.uid) korunur.
-- =====================================================================

create or replace function public.metric_interactions(p_from timestamptz, p_to timestamptz, p_scope_user uuid default null, p_channel bigint default null)
returns jsonb language sql stable as $$ select metrics.metric_interactions(p_from, p_to, p_scope_user, p_channel) $$;

create or replace function public.metric_requests(p_from timestamptz, p_to timestamptz, p_scope_user uuid default null, p_channel bigint default null, p_category bigint default null, p_province bigint default null)
returns jsonb language sql stable as $$ select metrics.metric_requests(p_from, p_to, p_scope_user, p_channel, p_category, p_province) $$;

create or replace function public.metric_funnel(p_from timestamptz, p_to timestamptz, p_scope_user uuid default null)
returns jsonb language sql stable as $$ select metrics.metric_funnel(p_from, p_to, p_scope_user) $$;

create or replace function public.metric_quotes(p_from timestamptz, p_to timestamptz, p_scope_user uuid default null)
returns jsonb language sql stable as $$ select metrics.metric_quotes(p_from, p_to, p_scope_user) $$;

create or replace function public.metric_samples(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable as $$ select metrics.metric_samples(p_from, p_to) $$;

create or replace function public.metric_orders(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable as $$ select metrics.metric_orders(p_from, p_to) $$;

create or replace function public.metric_finance(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable as $$ select metrics.metric_finance(p_from, p_to) $$;

create or replace function public.metric_employees(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable as $$ select metrics.metric_employees(p_from, p_to) $$;

create or replace function public.metric_leads(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable as $$ select metrics.metric_leads(p_from, p_to) $$;

create or replace function public.metric_stage_durations(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable as $$ select metrics.metric_stage_durations(p_from, p_to) $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'metric_interactions(timestamptz,timestamptz,uuid,bigint)',
    'metric_requests(timestamptz,timestamptz,uuid,bigint,bigint,bigint)',
    'metric_funnel(timestamptz,timestamptz,uuid)',
    'metric_quotes(timestamptz,timestamptz,uuid)',
    'metric_samples(timestamptz,timestamptz)',
    'metric_orders(timestamptz,timestamptz)',
    'metric_finance(timestamptz,timestamptz)',
    'metric_employees(timestamptz,timestamptz)',
    'metric_leads(timestamptz,timestamptz)',
    'metric_stage_durations(timestamptz,timestamptz)'
  ] loop
    execute format('grant execute on function public.%s to authenticated', fn);
    execute format('revoke execute on function public.%s from anon', fn);
  end loop;
end $$;
