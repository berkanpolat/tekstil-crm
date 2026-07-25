-- =====================================================================
-- P0.6 regresyon testi — settings silme/insert kısıtları + is_sensitive okuma.
-- Tek transaction, sonunda ROLLBACK (kalıcı veri yok).
--   psql "<baglanti>" -v ON_ERROR_STOP=1 -f scripts/p0_6_regression.sql
-- Beklenen: tüm PASS notice'ları, hata YOK.
-- =====================================================================
\set ON_ERROR_STOP on
begin;

-- Test kullanıcıları: owner + viewer (alan adı kısıtı boş → her e-posta geçer).
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000b1', 'owner6@example.com',
   jsonb_build_object('created_by_admin', true, 'role_id', (select id from public.roles where key='owner')),
   jsonb_build_object('full_name','Owner6')),
  ('00000000-0000-0000-0000-0000000000b3', 'viewer6@example.com',
   jsonb_build_object('created_by_admin', true, 'role_id', (select id from public.roles where key='viewer')),
   jsonb_build_object('full_name','Viewer6'));

-- Hassas bir test ayarı ekle (sistem bağlamı = postgres, auth.uid null → izinli).
insert into public.settings (key, value, category, description, is_sensitive)
values ('test.secret', '"gizli"'::jsonb, 'system', 'Test hassas ayar', true);

create or replace function pg_temp.act_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
end $$;

-- ------------------------------------------------------------------
-- TEST 1: ayar SİLİNEMEZ (privileged/postgres olsa bile trigger engeller)
-- ------------------------------------------------------------------
do $$
begin
  delete from public.settings where key='system.timezone';
  raise exception 'FAIL: ayar silinebildi' using errcode='TESTF';
exception
  when sqlstate '2BP01' then raise notice 'PASS: ayar silinemedi (delete engellendi)';
end $$;

-- ------------------------------------------------------------------
-- TEST 2: authenticated kullanıcı yeni ayar INSERT edemez
-- ------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');  -- owner bile olsa
do $$
begin
  insert into public.settings (key, value, category) values ('hack.key','"x"'::jsonb,'system');
  raise exception 'FAIL: authenticated insert yapabildi' using errcode='TESTF';
exception
  when sqlstate '42501' then raise notice 'PASS: authenticated ayar insert edemedi';
end $$;

-- ------------------------------------------------------------------
-- TEST 3: is_sensitive okuma kısıtı
--   viewer hassas ayarı GÖRMEMELİ; owner GÖRMELİ; non-sensitive herkese açık.
-- ------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b3');  -- viewer
do $$
declare v_cnt int;
begin
  select count(*) into v_cnt from public.settings where key='test.secret';
  if v_cnt <> 0 then raise exception 'FAIL: viewer hassas ayarı gördü' using errcode='TESTF'; end if;
  select count(*) into v_cnt from public.settings where key='system.timezone';
  if v_cnt <> 1 then raise exception 'FAIL: viewer non-sensitive ayarı göremedi' using errcode='TESTF'; end if;
  raise notice 'PASS: viewer hassas ayarı görmedi, non-sensitive gördü';
end $$;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');  -- owner
do $$
declare v_cnt int;
begin
  select count(*) into v_cnt from public.settings where key='test.secret';
  if v_cnt <> 1 then raise exception 'FAIL: owner hassas ayarı göremedi' using errcode='TESTF'; end if;
  raise notice 'PASS: owner hassas ayarı gördü';
end $$;

reset role;
rollback;
\echo '>>> P0.6 regresyon: tüm testler tamamlandı, ROLLBACK yapildi.'
