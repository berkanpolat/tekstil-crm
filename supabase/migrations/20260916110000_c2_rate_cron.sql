-- =====================================================================
-- PAKET C · Aşama 2 — Bağımsız kur çekimi: sistem yolu + pg_cron
-- =====================================================================
-- - system_set_exchange_rate: is_active_user() kapısı OLMADAN yazan sistem yolu
--   (yalnız service_role çağırabilir → normal kullanıcıya kapalı). Edge fn bunu
--   SERVICE_ROLE ile çağırır. Sağlık bandı (±%25) korunur ama RAISE etmez —
--   durum metni döner ('written'|'duplicate'|'out_of_band'|'invalid'), böylece bir
--   para birimi diğerlerini düşürmez.
-- - pg_cron + pg_net ile hafta içi 16:00 TR (=13:00 UTC; TR sabit UTC+3) refresh-rates
--   edge fonksiyonu tetiklenir. URL + gizli anahtar Vault'tan okunur (git'e girmez).
-- =====================================================================

-- ── Sistem yolu: kullanıcı kapısı olmadan kur yaz (yalnız service_role) ──────
create or replace function public.system_set_exchange_rate(
  p_currency text,
  p_rate numeric,
  p_source text default 'TCMB',
  p_rate_date date default null
) returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_prev numeric;
  v_band numeric := 0.25;
  v_date date := coalesce(p_rate_date, (now() at time zone public.app_timezone())::date);
begin
  if p_rate is null or p_rate <= 0 then
    return 'invalid';
  end if;
  -- Mükerrer: bu para birimi için bu bülten tarihi zaten kayıtlıysa yazma.
  if exists (select 1 from public.exchange_rates where currency = p_currency and rate_date = v_date) then
    return 'duplicate';
  end if;
  select rate_try into v_prev
    from public.exchange_rates where currency = p_currency and is_current limit 1;
  -- Aşırı sapma (hatalı ayrıştırma / olağandışı hareket): otomatik yazma, insan onayına bırak.
  if v_prev is not null and v_prev > 0
     and (p_rate > v_prev * (1 + v_band) or p_rate < v_prev * (1 - v_band)) then
    return 'out_of_band';
  end if;
  update public.exchange_rates set is_current = false where currency = p_currency and is_current;
  insert into public.exchange_rates (currency, rate_try, source, is_current, rate_date)
  values (p_currency, p_rate, coalesce(p_source, 'TCMB'), true, v_date);
  return 'written';
end $function$;

comment on function public.system_set_exchange_rate(text, numeric, text, date) is
  'Sistem/cron için kur yazımı (is_active_user kapısı yok). Yalnız service_role. Sağlık bandı dışını yazmaz.';

-- Normal kullanıcılara KAPALI; yalnız service_role (edge fn) çağırabilir.
revoke all on function public.system_set_exchange_rate(text, numeric, text, date) from public;
revoke all on function public.system_set_exchange_rate(text, numeric, text, date) from anon, authenticated;
grant execute on function public.system_set_exchange_rate(text, numeric, text, date) to service_role;

-- ── Zamanlayıcı: pg_cron + pg_net ───────────────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Eski iş varsa temizle (idempotent).
select cron.unschedule('refresh-rates-tr-1600')
  where exists (select 1 from cron.job where jobname = 'refresh-rates-tr-1600');

-- Hafta içi 16:00 TR = 13:00 UTC (TR sabit UTC+3, DST yok). Pzt–Cum.
-- URL + gizli anahtar Vault'tan okunur (aşağıdaki ELLE adımlarla oluşturulur).
select cron.schedule('refresh-rates-tr-1600', '0 13 * * 1-5', $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'refresh_rates_url'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-refresh-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'refresh_rates_secret')
               ),
    body    := '{}'::jsonb
  );
$cron$);

-- =====================================================================
-- ELLE ADIMLAR (bu migration'ı uygulamadan/uyguladıktan sonra; git'e GİRMEZ):
--
-- 1) Vault gizli anahtarları (kendi değerlerinle):
--    select vault.create_secret('https://<PROJECT_REF>.functions.supabase.co/refresh-rates', 'refresh_rates_url');
--    select vault.create_secret('<GÜÇLÜ_RASTGELE_SECRET>', 'refresh_rates_secret');
--
-- 2) Edge fn ortam değişkeni (aynı secret):
--    supabase secrets set REFRESH_SECRET='<GÜÇLÜ_RASTGELE_SECRET>'
--
-- 3) Edge fn deploy (JWT doğrulaması kapalı — kimlik x-refresh-secret ile):
--    supabase functions deploy refresh-rates --no-verify-jwt
--
-- 4) Doğrula:
--    curl -s -X POST https://<REF>.functions.supabase.co/refresh-rates \
--         -H "x-refresh-secret: <SECRET>" | jq
--    select jobname, schedule, active from cron.job where jobname='refresh-rates-tr-1600';
--    select currency, rate_try, rate_date, fetched_at from exchange_rates where is_current;
-- =====================================================================
