-- =====================================================================
-- PAKET C · Aşama 1 — Kur: doğru damgalama + iş günü farkındalığı
-- =====================================================================
-- Sorunlar (teşhisten):
--  1) set_exchange_rate rate_date'i now()::date (BUGÜN) damgalıyor; TCMB
--     bülteninin kendi <Tarih>'i değil → 15:30 öncesi çekilen (önceki gün)
--     değer bugüne yanlış etiketleniyor.
--  2) Aynı bülten defalarca yazılıp mükerrer satır üretiyor.
--  3) current_rates staleness DUVAR-SAATİ esaslı (>6sa) → hafta sonu/tatilde
--     yeni bülten olmamasına rağmen yanlış "eski" alarmı veriyor.
--
-- Çözüm: (a) set_exchange_rate'e p_rate_date parametresi + (currency, rate_date)
-- mükerrer koruması; (b) expected_bulletin_date() = beklenen en güncel TCMB
-- bülten tarihi (hafta içi, 15:30 kesimi); (c) current_rates staleness'ı
-- rate_date vs beklenen bülten tarihi (iş günü) esaslı.
-- Not: Resmî tatiller modellenmez (yalnız Cmt/Pzr elenir) — tatilde en fazla
-- geçici hafif "stale" olur, bülten gelince temizlenir; yanlış fiyat üretmez.
-- =====================================================================

-- ── (b) Beklenen en güncel TCMB bülten tarihi (İstanbul, 15:30 kesimi, hafta içi)
create or replace function public.expected_bulletin_date()
returns date
language sql
stable
set search_path to ''
as $$
  with n as (select (now() at time zone public.app_timezone()) as ts),
  asof as (
    -- 15:30'dan önce bugünün bülteni henüz yayınlanmadı → dünü baz al.
    select case when (select ts from n)::time < time '15:30'
                then (select ts from n)::date - 1
                else (select ts from n)::date end as d
  )
  -- asof gününden geriye ilk hafta içi (Pzt–Cum) gün.
  select max(g::date)
  from generate_series((select d from asof)::timestamp - interval '6 days',
                       (select d from asof)::timestamp, interval '1 day') g
  where extract(dow from g) between 1 and 5;
$$;
comment on function public.expected_bulletin_date() is
  'Beklenen en güncel TCMB bülten tarihi (İstanbul saati, 15:30 kesimi, hafta içi). Staleness için referans.';
grant execute on function public.expected_bulletin_date() to authenticated;

-- ── (a) set_exchange_rate: bülten tarihini damgala + mükerrer koru
-- Eski 3 argümanlı imza düşürülür; yeni imza p_rate_date (varsayılan null) ekler.
-- 3 argümanlı mevcut çağrılar (useRefreshRates) p_rate_date=null ile çözülür →
-- geriye dönük uyumlu (Aşama 2'de gerçek bülten tarihi geçilecek).
drop function if exists public.set_exchange_rate(text, numeric, text);

create or replace function public.set_exchange_rate(
  p_currency text,
  p_rate numeric,
  p_source text default 'TCMB',
  p_rate_date date default null
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_prev numeric;
  v_band numeric := 0.25;   -- ±%25 sağlık bandı
  v_date date := coalesce(p_rate_date, (now() at time zone public.app_timezone())::date);
begin
  if not public.is_active_user() then
    raise exception 'Yetkisiz.' using errcode = '42501';
  end if;
  if p_rate is null or p_rate <= 0 then
    raise exception 'Kur pozitif olmalıdır (% verildi).', p_rate using errcode = 'check_violation';
  end if;

  -- Mükerrer koruması: bu para birimi için bu bülten tarihi zaten kayıtlıysa yazma.
  if exists (select 1 from public.exchange_rates where currency = p_currency and rate_date = v_date) then
    return;
  end if;

  select rate_try into v_prev
    from public.exchange_rates
   where currency = p_currency and is_current
   limit 1;

  -- Aşırı sapma: yalnız finance.edit yazabilir.
  if v_prev is not null and v_prev > 0
     and (p_rate > v_prev * (1 + v_band) or p_rate < v_prev * (1 - v_band))
     and not public.has_permission('finance.edit') then
    raise exception
      'Kur mevcut değerden aşırı sapıyor (% → %). Bu değişiklik için finans yetkisi gerekir.',
      v_prev, p_rate
      using errcode = '42501';
  end if;

  update public.exchange_rates set is_current = false where currency = p_currency and is_current;
  insert into public.exchange_rates (currency, rate_try, source, is_current, rate_date)
  values (p_currency, p_rate, coalesce(p_source, 'TCMB'), true, v_date);
end $function$;

comment on function public.set_exchange_rate(text, numeric, text, date) is
  'TCMB kuru yazar. p_rate_date = bültenin kendi tarihi (null → İstanbul bugünü). (currency, rate_date) mükerrer korumalı.';
grant execute on function public.set_exchange_rate(text, numeric, text, date) to authenticated;

-- ── (c) current_rates: staleness iş günü esaslı (rate_date vs beklenen bülten)
create or replace function public.current_rates()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with cur as (
    select currency, rate_try, fetched_at, rate_date
    from public.exchange_rates where is_current and currency in ('USD','EUR','GBP')
  ), s as (
    select coalesce((select (value #>> '{}')::numeric from public.settings where key='pricing.safety_margin_percent'),0) as safety,
           coalesce((select (value #>> '{}')::numeric from public.settings where key='pricing.rate_refresh_hours'),6) as refresh_h
  ), agg as (
    select min(fetched_at) as min_fetched, min(rate_date) as min_date from cur
  ), exp as (
    select public.expected_bulletin_date() as ed
  ), gap as (
    -- rate_date ile beklenen bülten arasında KAÇ iş günü geride kalındığı.
    select case when (select min_date from agg) is null then 999
      else (select count(*)::int
              from generate_series(((select min_date from agg) + 1)::timestamp,
                                   (select ed from exp)::timestamp, interval '1 day') d
             where extract(dow from d) between 1 and 5)
      end as biz_behind
  )
  select jsonb_build_object(
    'USD', (select rate_try from cur where currency='USD'),
    'EUR', (select rate_try from cur where currency='EUR'),
    'GBP', (select rate_try from cur where currency='GBP'),
    'source', (select source from public.exchange_rates where is_current and currency='USD' limit 1),
    'fetched_at', (select min_fetched from agg),
    'rate_date', (select min_date from agg),
    'expected_date', (select ed from exp),
    'age_hours', round(extract(epoch from now() - coalesce((select min_fetched from agg), now())) / 3600, 2),
    'safety_percent', (select safety from s),
    'refresh_hours', (select refresh_h from s),
    'business_days_behind', (select biz_behind from gap),
    -- İş günü esaslı: rate_date beklenen bültenden eskiyse stale; 2+ iş günü geride ise blocked.
    'stale', coalesce((select min_date from agg) < (select ed from exp), true),
    'blocked', coalesce((select biz_behind from gap) >= 2, true)
  );
$function$;

-- PostgREST şema önbelleğini yenile (imza değişti).
notify pgrst, 'reload schema';
