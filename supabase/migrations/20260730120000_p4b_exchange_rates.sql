-- =====================================================================
-- P4B.5 — DÖVİZ KURU. TCMB Döviz Satış (§5 kararı). Güvenlik payı %0 (ayardan). Cron YOK:
-- okuma anında yaş kontrolü; eşiği (6s) aşarsa arayüz arka planda tazeler. 24s aşarsa teklif engeli.
-- =====================================================================
create table public.exchange_rates (
  id         bigserial primary key,
  currency   text not null,
  rate_try   numeric not null check (rate_try > 0),
  source     text not null default 'TCMB',
  fetched_at timestamptz not null default now(),
  is_current boolean not null default true
);
create index exchange_rates_current_idx on public.exchange_rates (currency) where is_current;
alter table public.exchange_rates enable row level security;
create policy exchange_rates_select on public.exchange_rates for select to authenticated using (public.is_active_user());
revoke all on public.exchange_rates from anon;
grant select on public.exchange_rates to authenticated;

insert into public.settings (key, value, category, description) values
  ('pricing.safety_margin_percent', '0'::jsonb, 'pricing', 'Kur üzerine güvenlik payı (%). Efektif kur = TCMB × (1+pay/100).'),
  ('pricing.rate_refresh_hours',   '6'::jsonb, 'pricing', 'Kur bu saatten eskiyse arka planda tazelenir.'),
  ('pricing.rate_block_hours',    '24'::jsonb, 'pricing', 'Kur bu saatten eskiyse teklif oluşturma engellenir.'),
  ('pricing.margin_erosion_percent', '5'::jsonb, 'pricing', 'Ürün maliyeti (USD) bu %''yi aşınca kur-erimesi işaretlenir.')
on conflict (key) do nothing;

-- Yeni kur yaz: eskiyi is_current=false yapar, yenisini ekler (RPC, SECURITY DEFINER).
create or replace function public.set_exchange_rate(p_currency text, p_rate numeric, p_source text default 'TCMB')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_rate is null or p_rate <= 0 then raise exception 'Geçersiz kur: %', p_rate using errcode = '22003'; end if;
  update public.exchange_rates set is_current = false where currency = p_currency and is_current;
  insert into public.exchange_rates (currency, rate_try, source, is_current) values (p_currency, p_rate, coalesce(p_source, 'TCMB'), true);
end; $$;
grant execute on function public.set_exchange_rate(text, numeric, text) to authenticated;

-- Güncel kurlar + yaş + engel bayrağı (arayüz + maliyet hesabı bunu okur).
create or replace function public.current_rates()
returns jsonb language sql stable security definer set search_path = '' as $$
  with cur as (
    select currency, rate_try, fetched_at from public.exchange_rates where is_current and currency in ('USD','EUR','GBP')
  ), s as (
    select coalesce((select (value #>> '{}')::numeric from public.settings where key='pricing.safety_margin_percent'),0) as safety,
           coalesce((select (value #>> '{}')::numeric from public.settings where key='pricing.rate_block_hours'),24) as block_h,
           coalesce((select (value #>> '{}')::numeric from public.settings where key='pricing.rate_refresh_hours'),6) as refresh_h
  )
  select jsonb_build_object(
    'USD', (select rate_try from cur where currency='USD'),
    'EUR', (select rate_try from cur where currency='EUR'),
    'GBP', (select rate_try from cur where currency='GBP'),
    'source', (select source from public.exchange_rates where is_current and currency='USD' limit 1),
    'fetched_at', (select min(fetched_at) from cur),
    'age_hours', round(extract(epoch from now() - coalesce((select min(fetched_at) from cur), now())) / 3600, 2),
    'safety_percent', (select safety from s),
    'refresh_hours', (select refresh_h from s),
    'stale', (select coalesce((select min(fetched_at) from cur) < now() - ((select refresh_h from s) || ' hours')::interval, true)),
    'blocked', (select coalesce((select min(fetched_at) from cur) < now() - ((select block_h from s) || ' hours')::interval, true))
  );
$$;
grant execute on function public.current_rates() to authenticated;

-- Başlangıç kurları (TCMB Döviz Satış, migration anı). Arayüz eskiyince tazeler.
select public.set_exchange_rate('USD', 47.3533, 'TCMB');
select public.set_exchange_rate('EUR', 53.9717, 'TCMB');
select public.set_exchange_rate('GBP', 63.2359, 'TCMB');
