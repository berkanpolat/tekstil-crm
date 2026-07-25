-- =====================================================================
-- P0.8 entegrasyon testi — generate_operation_code() 10.000 üretim.
-- Beklenen: 10000 toplam, 10000 benzersiz, 0 hatalı format, 0 yasak karakter.
-- Sonunda test kayıtları temizlenir.
--   psql "<baglanti>" -v ON_ERROR_STOP=1 -f scripts/p0_8_codegen.sql
-- =====================================================================
\set ON_ERROR_STOP on
begin;

do $$
declare i int; c text;
begin
  for i in 1..10000 loop
    c := public.generate_operation_code('__codetest__', i::text);
  end loop;
end $$;

select
  count(*)                                                                              as toplam,
  count(distinct code)                                                                  as benzersiz,
  count(*) filter (where code !~ '^TAS-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$')         as hatali_format,
  count(*) filter (where code ~ '[IO01]')                                               as yasak_karakter
from public.code_registry where entity_type = '__codetest__';

do $$
declare v_total int; v_distinct int; v_bad int; v_forbidden int;
begin
  select count(*), count(distinct code),
    count(*) filter (where code !~ '^TAS-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$'),
    count(*) filter (where code ~ '[IO01]')
  into v_total, v_distinct, v_bad, v_forbidden
  from public.code_registry where entity_type = '__codetest__';

  if v_total <> 10000 then raise exception 'FAIL: toplam % <> 10000', v_total using errcode='TESTF'; end if;
  if v_distinct <> 10000 then raise exception 'FAIL: benzersiz % <> 10000 (çakışma!)', v_distinct using errcode='TESTF'; end if;
  if v_bad <> 0 then raise exception 'FAIL: % hatalı format', v_bad using errcode='TESTF'; end if;
  if v_forbidden <> 0 then raise exception 'FAIL: % yasak karakter', v_forbidden using errcode='TESTF'; end if;
  raise notice 'PASS: 10000 kod benzersiz, doğru format, yasak karakter yok';
end $$;

rollback;  -- test kayıtları kalıcı olmasın
\echo '>>> P0.8 benzersizlik testi tamamlandı (ROLLBACK).'

-- ---------------------------------------------------------------------
-- ERKEN UYARI testi: codes.length=2 (1024 kombinasyon) ile alanı doldur;
-- bazı üretimler >3 deneme gerektirir → 'codes.collision_pressure' olayı yazılmalı.
-- ---------------------------------------------------------------------
begin;
update public.settings set value = '2'::jsonb where key = 'codes.length';
do $$
declare i int; c text;
begin
  for i in 1..400 loop
    begin
      c := public.generate_operation_code('__pressure__', i::text);
    exception when sqlstate 'P0001' then
      exit;  -- alan doldu hatası olursa dur
    end;
  end loop;
end $$;
do $$
declare v_events int;
begin
  select count(*) into v_events from public.event_log where event_type = 'codes.collision_pressure';
  if v_events < 1 then
    raise exception 'FAIL: collision_pressure olayı yazılmadı (% olay)', v_events using errcode = 'TESTF';
  end if;
  raise notice 'PASS: erken uyarı — % adet codes.collision_pressure olayı yazıldı', v_events;
end $$;
rollback;
\echo '>>> P0.8 erken uyarı testi tamamlandı (ROLLBACK).'
