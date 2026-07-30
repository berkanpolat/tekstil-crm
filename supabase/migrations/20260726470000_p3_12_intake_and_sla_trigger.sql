-- =====================================================================
-- P3.12 hazırlık — sla_deadline TEK KAYNAK (DB trigger) + intake idempotency.
--   • add_working_hours(ts, hours): iş-saati hesabı (working_hours.* + app_timezone).
--     src/lib/workingHours.ts ile aynı kuralı SQL'de uygular; sla_deadline üretimi burada.
--   • operations_set_sla trigger: sla_deadline boşsa hesaplar (manuel/intake/frontend hepsi).
--   • operations.client_reference: intake-request idempotency (aynı referans → tek kayıt).
-- =====================================================================

-- İş-saati ekle (iş saat diliminde; UTC gün kayması yok).
create or replace function public.add_working_hours(p_from timestamptz, p_hours numeric)
returns timestamptz language plpgsql stable security definer set search_path = '' as $$
declare
  tz text := public.app_timezone();
  v_days int[] := (select array(select jsonb_array_elements_text(value)::int from public.settings where key = 'working_hours.days'));
  v_start text := (select value #>> '{}' from public.settings where key = 'working_hours.start');
  v_end text := (select value #>> '{}' from public.settings where key = 'working_hours.end');
  v_holidays text[] := (select array(select jsonb_array_elements_text(value) from public.settings where key = 'working_hours.holidays'));
  start_m int := split_part(coalesce(v_start,'09:00'),':',1)::int * 60 + split_part(coalesce(v_start,'09:00'),':',2)::int;
  end_m int := split_part(coalesce(v_end,'18:00'),':',1)::int * 60 + split_part(coalesce(v_end,'18:00'),':',2)::int;
  cur timestamp;
  remaining numeric := greatest(0, p_hours) * 60;
  cur_m int; iso int; avail numeric; guard int := 0;
begin
  if v_days is null or array_length(v_days,1) is null then v_days := array[1,2,3,4,5]; end if;
  if end_m <= start_m then return p_from; end if;
  cur := p_from at time zone tz;             -- iş TZ'sinde duvar-saati (timestamp)
  loop
    guard := guard + 1; exit when guard > 10000;
    iso := extract(isodow from cur)::int;
    if not (iso = any(v_days)) or (to_char(cur,'YYYY-MM-DD') = any(coalesce(v_holidays, array[]::text[]))) then
      cur := date_trunc('day', cur) + interval '1 day' + make_interval(mins => start_m); continue;
    end if;
    cur_m := extract(hour from cur)::int * 60 + extract(minute from cur)::int;
    if cur_m < start_m then cur := date_trunc('day', cur) + make_interval(mins => start_m); continue; end if;
    if cur_m >= end_m then cur := date_trunc('day', cur) + interval '1 day' + make_interval(mins => start_m); continue; end if;
    if remaining = 0 then exit; end if;
    avail := end_m - cur_m;
    if remaining <= avail then cur := date_trunc('day', cur) + make_interval(mins => (cur_m + remaining)::int); exit; end if;
    remaining := remaining - avail;
    cur := date_trunc('day', cur) + interval '1 day' + make_interval(mins => start_m);
  end loop;
  return cur at time zone tz;                 -- geri timestamptz
end; $$;
comment on function public.add_working_hours(timestamptz, numeric) is
  'İş-saati ekler (working_hours.* + app_timezone). sla_deadline üretiminin tek kaynağı; src/lib/workingHours.ts ile aynı kural.';

-- sla_deadline boşsa hesapla (talep tarihinden N iş saati).
create or replace function public.operations_set_sla()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.sla_deadline is null then
    new.sla_deadline := public.add_working_hours(
      coalesce(new.requested_at, now()),
      coalesce((select (value #>> '{}')::numeric from public.settings where key = 'sla.request_response_hours'), 24));
  end if;
  return new;
end; $$;
create trigger operations_set_sla before insert on public.operations
  for each row execute function public.operations_set_sla();

-- Intake idempotency: web ucundan gelen referans.
alter table public.operations add column client_reference text;
create unique index operations_client_reference_uidx on public.operations (client_reference) where client_reference is not null;
comment on column public.operations.client_reference is
  'tekstilas.com talep ucunun idempotency anahtarı. Aynı referans ikinci kez gelirse yeni kayıt açılmaz.';
