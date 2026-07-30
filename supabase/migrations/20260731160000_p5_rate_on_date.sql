-- =====================================================================
-- P5 düzeltme — GEÇMİŞ TARİHLİ kur. Ödeme günü kuru kullanılacak (karar); geçmişe
-- girilen ödemede bugünün kuru KONULMAZ. exchange_rates'e rate_date eklenir, geçmiş
-- TCMB bültenleri önbelleğe yazılabilir, rate_on_date() saklı fallback verir.
-- =====================================================================

alter table public.exchange_rates add column if not exists rate_date date;
-- Mevcut satırlar: yazım gününü kurun tarihi say (yaklaşık; ileride TCMB bülten tarihi netleşir).
update public.exchange_rates
  set rate_date = (fetched_at at time zone public.app_timezone())::date
  where rate_date is null;
create index if not exists exchange_rates_date_idx on public.exchange_rates (currency, rate_date);

-- set_exchange_rate: güncel kura rate_date = bugün (TCMB bülten günü) yazılır.
create or replace function public.set_exchange_rate(p_currency text, p_rate numeric, p_source text default 'TCMB')
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.exchange_rates set is_current = false where currency = p_currency and is_current;
  insert into public.exchange_rates (currency, rate_try, source, is_current, rate_date)
  values (p_currency, p_rate, coalesce(p_source, 'TCMB'), true, (now() at time zone public.app_timezone())::date);
end; $$;
grant execute on function public.set_exchange_rate(text, numeric, text) to authenticated;

-- Geçmiş kuru önbelleğe yaz (is_current'a DOKUNMAZ). Aynı gün+para varsa atlar.
create or replace function public.cache_historical_rate(p_currency text, p_rate numeric, p_date date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_rate is null or p_rate <= 0 or p_date is null then return; end if;
  if exists (select 1 from public.exchange_rates where currency = p_currency and rate_date = p_date) then return; end if;
  insert into public.exchange_rates (currency, rate_try, source, is_current, rate_date, fetched_at)
  values (p_currency, p_rate, 'TCMB', false, p_date, now());
end; $$;
grant execute on function public.cache_historical_rate(text, numeric, date) to authenticated;

-- Belirli tarihteki kur (saklı fallback): rate_date ≤ tarih olan en YAKIN önceki kayıt.
create or replace function public.rate_on_date(p_currency text, p_date date)
returns numeric language sql stable security definer set search_path = '' as $$
  select case when p_currency = 'TRY' then 1::numeric else (
    select rate_try from public.exchange_rates
    where currency = p_currency and rate_date is not null and rate_date <= p_date
    order by rate_date desc limit 1
  ) end;
$$;
grant execute on function public.rate_on_date(text, date) to authenticated;
