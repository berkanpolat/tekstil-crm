-- =====================================================================
-- P0.2 — Veritabanı temeli
-- Enum tipleri + jenerik yardımcı fonksiyonlar. Sonraki tüm paketler
-- (audit, users, roller, ayarlar, dosyalar, kod üreteci) bunlara dayanır.
--
-- Sıralama notu: is_active_user() ve has_permission() gövdeleri public.users
-- tablosuna atıfta bulunur; bu tablo P0.4'te oluşur. plpgsql gövdeleri
-- referansı çalışma zamanına ertelediğinden fonksiyonlar burada güvenle
-- tanımlanabilir (çağrılmadıkları sürece hata vermez). current_app_user()
-- ise public.users SATIR TİPİNİ döndürdüğü için P0.4'te tanımlanır.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enum tipleri
-- ---------------------------------------------------------------------
create type public.audit_action as enum ('insert', 'update', 'delete', 'restore');

create type public.audit_source as enum ('user', 'system', 'automation', 'migration', 'import');

create type public.file_category as enum ('document', 'image', 'avatar', 'export', 'other');

-- ---------------------------------------------------------------------
-- touch_updated_at() — BEFORE UPDATE trigger fonksiyonu
-- updated_at sütununu her güncellemede damgalar. İlgili tablolara
-- kendi migration'larında trigger olarak takılır.
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.touch_updated_at() is
  'BEFORE UPDATE trigger: updated_at sütununu now() ile damgalar.';

-- ---------------------------------------------------------------------
-- is_active_user() — oturumdaki kullanıcı aktif (ve silinmemiş) mi?
-- RLS politikalarının temel taşı. public.users P0.4''te gelir.
-- security definer + boş search_path: RLS özyinelemesini ve enjeksiyonu önler.
-- ---------------------------------------------------------------------
create or replace function public.is_active_user()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_active boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  select (u.is_active and u.deleted_at is null)
    into v_active
    from public.users u
   where u.id = auth.uid();

  return coalesce(v_active, false);
end;
$$;

comment on function public.is_active_user() is
  'Oturumdaki auth kullanıcısı public.users içinde aktif ve silinmemiş mi? RLS temel kontrolü.';

-- ---------------------------------------------------------------------
-- has_permission(permission_key) — yetki kontrolünün TEK giriş noktası.
-- Faz 0: mekanizma hazır, kapı geniş — aktif kullanıcı her yetkiye sahip
-- sayılır. Gerçek rol + kullanıcı override + süre kontrolü P0.5''te bu
-- gövdeye eklenecek. İmza ve çağrı noktaları BAŞTAN doğru olsun diye şimdi
-- kuruluyor; sonradan RLS'e yetki eklemek pahalı.
-- ---------------------------------------------------------------------
create or replace function public.has_permission(permission_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- permission_key Faz 0''da kasıtlı olarak kullanılmıyor; imza korunuyor.
  perform permission_key;
  return public.is_active_user();
end;
$$;

comment on function public.has_permission(text) is
  'Yetki kontrolü tek giriş noktası. Faz 0: aktif kullanıcı için true. Gerçek mantık P0.5.';

-- ---------------------------------------------------------------------
-- Çalıştırma yetkileri: RLS politikaları bu fonksiyonları sorgulayan
-- rolün bağlamında çağırır; anon ve authenticated execute alır.
-- ---------------------------------------------------------------------
grant execute on function public.is_active_user() to anon, authenticated;
grant execute on function public.has_permission(text) to anon, authenticated;
