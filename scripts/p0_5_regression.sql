-- =====================================================================
-- P0.5 regresyon testi — yetki yükseltme guard'ları + sistem rolü koruması.
-- Tek transaction içinde 3 test kullanıcısı kurar, saldırıları dener, hepsi
-- reddedilmeli. Sonunda ROLLBACK → kalıcı veri bırakmaz.
--
-- Çalıştırma:
--   psql "<baglanti>" -v ON_ERROR_STOP=1 -f scripts/p0_5_regression.sql
-- Beklenen: tüm "PASS:" notice'ları, hata YOK, en sonda ROLLBACK.
-- =====================================================================
\set ON_ERROR_STOP on
begin;

-- Test kullanıcıları (tekstilas.com → alan adı kısıtı P0.6 sonrası da geçer).
-- created_by_admin + role_id app_metadata'da (users tablosu boş olmasa da çalışır).
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values (
  '00000000-0000-0000-0000-0000000000a1', 'owner@tekstilas.com',
  jsonb_build_object('created_by_admin', true, 'role_id', (select id from public.roles where key='owner')),
  jsonb_build_object('full_name', 'Test Owner')
);
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values (
  '00000000-0000-0000-0000-0000000000a2', 'admin@tekstilas.com',
  jsonb_build_object('created_by_admin', true, 'role_id', (select id from public.roles where key='admin')),
  jsonb_build_object('full_name', 'Test Admin')
);
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values (
  '00000000-0000-0000-0000-0000000000a3', 'viewer@tekstilas.com',
  jsonb_build_object('created_by_admin', true, 'role_id', (select id from public.roles where key='viewer')),
  jsonb_build_object('full_name', 'Test Viewer')
);

-- Kurulum doğrulaması (auth.uid null = servis bağlamı, has_permission owner/rol mantığı).
do $$
declare
  v_owner uuid := '00000000-0000-0000-0000-0000000000a1';
  v_admin uuid := '00000000-0000-0000-0000-0000000000a2';
begin
  if (select r.key from public.users u join public.roles r on r.id=u.role_id where u.id=v_owner) <> 'owner' then
    raise exception 'FAIL: ilk kullanıcı owner değil' using errcode='TESTF';
  end if;
  if (select r.key from public.users u join public.roles r on r.id=u.role_id where u.id=v_admin) <> 'admin' then
    raise exception 'FAIL: admin rolü atanmadı' using errcode='TESTF';
  end if;
  raise notice 'PASS: kurulum — owner ve admin rolleri doğru';
end $$;

-- Yardımcı: belirli bir kullanıcı bağlamına gir.
create or replace function pg_temp.act_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
end $$;

-- ------------------------------------------------------------------
-- TEST 1 (Rule A): admin KENDİ user_id'sine override yazamaz → reddedilmeli
-- ------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
do $$
begin
  insert into public.user_permission_overrides (user_id, permission_id, granted)
  values ('00000000-0000-0000-0000-0000000000a2', (select id from public.permissions where key='roles.manage'), true);
  raise exception 'FAIL: admin kendine override yazabildi' using errcode='TESTF';
exception
  when sqlstate '42501' then raise notice 'PASS: Rule A — admin kendine override yazamadı';
end $$;

-- ------------------------------------------------------------------
-- TEST 2 (Rule B): admin, sahip OLMADIĞI 'roles.manage' yetkisini viewer'a
-- override ile veremez → reddedilmeli
-- ------------------------------------------------------------------
do $$
begin
  insert into public.user_permission_overrides (user_id, permission_id, granted)
  values ('00000000-0000-0000-0000-0000000000a3', (select id from public.permissions where key='roles.manage'), true);
  raise exception 'FAIL: admin sahip olmadığı yetkiyi verebildi' using errcode='TESTF';
exception
  when sqlstate '42501' then raise notice 'PASS: Rule B — admin sahip olmadığı yetkiyi veremedi';
end $$;

-- ------------------------------------------------------------------
-- TEST 3 (Rule B pozitif): admin, SAHİP OLDUĞU 'users.create' yetkisini
-- viewer'a override ile verebilir → başarılı olmalı
-- ------------------------------------------------------------------
do $$
begin
  insert into public.user_permission_overrides (user_id, permission_id, granted)
  values ('00000000-0000-0000-0000-0000000000a3', (select id from public.permissions where key='users.create'), true);
  raise notice 'PASS: Rule B pozitif — admin sahip olduğu yetkiyi verebildi';
exception
  when others then raise exception 'FAIL: admin sahip olduğu yetkiyi veremedi (%）', sqlerrm using errcode='TESTF';
end $$;

-- ------------------------------------------------------------------
-- TEST 4 (role_permissions guard): admin, sahip olmadığı 'roles.manage'i
-- viewer ROLÜNE ekleyemez → reddedilmeli
-- ------------------------------------------------------------------
do $$
begin
  insert into public.role_permissions (role_id, permission_id)
  values ((select id from public.roles where key='viewer'), (select id from public.permissions where key='roles.manage'));
  raise exception 'FAIL: admin sahip olmadığı yetkiyi role ekleyebildi' using errcode='TESTF';
exception
  when sqlstate '42501' then raise notice 'PASS: role_permissions guard — admin sahip olmadığı yetkiyi role ekleyemedi';
end $$;

reset role;

-- ------------------------------------------------------------------
-- TEST 5 (sistem rolü key koruması): owner rolünün key'i değiştirilemez.
-- (postgres olarak; trigger RLS'ten bağımsız engeller.)
-- ------------------------------------------------------------------
do $$
begin
  update public.roles set key='owner_x' where key='owner';
  raise exception 'FAIL: owner rolünün key''i değiştirilebildi' using errcode='TESTF';
exception
  when sqlstate '2BP01' then raise notice 'PASS: sistem rolü key değişimi engellendi';
end $$;

-- ------------------------------------------------------------------
-- TEST 6 (sistem rolü name serbest): owner rolünün name'i değiştirilebilir
-- ------------------------------------------------------------------
do $$
begin
  update public.roles set name='Sahip (guncel)' where key='owner';
  raise notice 'PASS: sistem rolü name değiştirilebildi (beklenen)';
exception
  when others then raise exception 'FAIL: sistem rolü name değişmedi (%）', sqlerrm using errcode='TESTF';
end $$;

rollback;
\echo '>>> P0.5 regresyon: tüm testler tamamlandı, degisiklikler geri alindi (ROLLBACK).'
