-- =====================================================================
-- P6.13 — YZ MALİYET KONTROLÜ. Tahmini maliyet (token×fiyat), günlük/aylık/özellik
-- bazlı sınır, harcama özeti, aylık %80 aşımında yönetici uyarısı.
-- =====================================================================

alter table public.ai_requests add column if not exists estimated_cost_usd numeric(10,5);
create index if not exists ai_requests_month_idx on public.ai_requests (created_at) where status = 'ok';

-- Fiyatlar (1M token başına USD) + maliyet sınırları + özellik-başı günlük çağrı sınırı.
insert into public.settings (key, value, category, description) values
  ('ai.price_per_1m_input',  '3'::jsonb,  'ai', 'Model girdi fiyatı (1M token başına USD). Fiyatlar değişebilir.'),
  ('ai.price_per_1m_output', '15'::jsonb, 'ai', 'Model çıktı fiyatı (1M token başına USD).'),
  ('ai.daily_cost_limit_usd',  '5'::jsonb,  'ai', 'Günlük YZ harcama sınırı (USD). Aşılırsa çağrı reddedilir.'),
  ('ai.monthly_cost_limit_usd','50'::jsonb, 'ai', 'Aylık YZ harcama sınırı (USD). Aşılırsa çağrı reddedilir.'),
  ('ai.limits', '{"siparis_cikarma":{"daily":100},"musteri_ozeti":{"daily":300},"talep_analizi":{"daily":300}}'::jsonb, 'ai', 'Özellik başına günlük çağrı sınırı.')
on conflict (key) do nothing;

-- Bugünkü / aylık maliyet
create or replace function public.ai_cost_today()
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(estimated_cost_usd), 0)::numeric from public.ai_requests
  where status='ok' and created_at >= (now() at time zone public.app_timezone())::date;
$$;
create or replace function public.ai_cost_month()
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(estimated_cost_usd), 0)::numeric from public.ai_requests
  where status='ok' and created_at >= date_trunc('month', (now() at time zone public.app_timezone()));
$$;
create or replace function public.ai_feature_calls_today(p_feature text)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.ai_requests
  where status='ok' and feature=p_feature and created_at >= (now() at time zone public.app_timezone())::date;
$$;
grant execute on function public.ai_cost_today(), public.ai_cost_month(), public.ai_feature_calls_today(text) to authenticated;

-- Harcama özeti (Ayarlar → YZ ekranı). owner/admin.
create or replace function public.ai_spend_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_res jsonb; v_month timestamptz := date_trunc('month', (now() at time zone public.app_timezone()));
begin
  if not public.is_admin_or_owner() then return '{}'::jsonb; end if;
  select jsonb_build_object(
    'today_usd', public.ai_cost_today(),
    'month_usd', public.ai_cost_month(),
    'daily_limit', (select (value#>>'{}')::numeric from public.settings where key='ai.daily_cost_limit_usd'),
    'monthly_limit', (select (value#>>'{}')::numeric from public.settings where key='ai.monthly_cost_limit_usd'),
    'by_feature', coalesce((select jsonb_agg(x) from (
      select feature, count(*) as calls, round(coalesce(sum(estimated_cost_usd),0),4) as usd
      from public.ai_requests where status='ok' and created_at >= v_month group by feature order by usd desc) x), '[]'::jsonb),
    'top_users', coalesce((select jsonb_agg(x) from (
      select coalesce(u.full_name, u.email, '—') as name, count(*) as calls, round(coalesce(sum(a.estimated_cost_usd),0),4) as usd
      from public.ai_requests a left join public.users u on u.id = a.user_id
      where a.status='ok' and a.created_at >= v_month group by u.full_name, u.email order by usd desc limit 10) x), '[]'::jsonb)
  ) into v_res;
  return v_res;
end; $$;
grant execute on function public.ai_spend_summary() to authenticated;
