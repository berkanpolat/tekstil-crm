-- =====================================================================
-- P0.4/P0.5 düzeltmesi — kayıt kilidi + minimal köprü trigger'ı
--
-- KÖK NEDEN: GoTrue admin.createUser ile gönderilen app_metadata, auth.users
-- AFTER INSERT trigger'ı çalıştığında henüz YAZILMAMIŞ oluyor (GoTrue onu
-- insert'ten sonra uyguluyor). Bu yüzden trigger app_metadata'ya GÜVENEMEZ.
-- (Ayrıntı: docs/specs/P0.4-... "GoTrue app_metadata zamanlaması".)
--
-- YENİ TASARIM:
--   * Birincil kayıt kilidi PLATFORM seviyesinde: Supabase "Allow new users to
--     sign up" KAPALI → self-signup imkânsız; kullanıcı yalnızca admin API ile.
--   * Trigger SADELEŞİR: minimal köprü satırı yazar (id, email, full_name,
--     must_change_password, role_id). Yetki alanları (role_id, created_by) ve
--     profil, create-user Edge Function tarafından insert SONRASI service_role
--     UPDATE ile doldurulur (iki adımlı, fail-closed).
--   * YEDEK kilit (defense-in-depth): count>0 iken user_metadata.created_by_admin
--     yoksa reddet. user_metadata kullanılır çünkü app_metadata insert'te yok.
--     Bu yedek; forge edilse bile role_id metadata'dan gelmediği için rolsüz
--     (zararsız) hesap kalır — asıl koruma platform kilidi.
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count      bigint;
  -- app_metadata insert'te görünmediği için user_metadata'dan okunur (yedek kilit).
  v_is_admin   boolean := coalesce((new.raw_user_meta_data->>'created_by_admin')::boolean, false);
  v_owner_role bigint;
begin
  select count(*) into v_count from public.users;

  -- YEDEK kayıt kilidi (birincil savunma: platform signup-disable).
  if v_count > 0 and not v_is_admin then
    raise exception 'Kayıt kapalı: kullanıcılar yalnızca yönetici tarafından oluşturulur.'
      using errcode = '42501';
  end if;

  -- İlk kullanıcı (bootstrap owner) → owner rolü burada atanır.
  if v_count = 0 then
    select id into v_owner_role from public.roles where key = 'owner';
    if v_owner_role is null then
      raise exception 'owner rolü tanımlı değil; sistem bootstrap edilemedi.'
        using errcode = 'P0001';
    end if;
  end if;

  -- Minimal köprü satırı. role_id/created_by/profil create-user tarafından
  -- insert SONRASI yazılır (ilk kullanıcı hariç: owner burada set edilir).
  insert into public.users (id, email, full_name, role_id, must_change_password, is_active)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), new.email),
    case when v_count = 0 then v_owner_role else null end,
    (v_count > 0),          -- ilk kullanıcı false (kendi şifresi), sonrakiler true
    true
  );

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Minimal köprü: auth.users → public.users. Kayıt kilidi platform seviyesinde; '
  'bu trigger yedek kilit + ilk kullanıcı owner bootstrap. Yetki/profil create-user '
  'tarafından insert sonrası service_role ile yazılır. app_metadata insert''te '
  'güvenilmez (GoTrue zamanlaması).';
