-- =====================================================================
-- P0.4 güvenlik sıkılaştırma — kullanıcı yönetimi (kabul testi açıkları)
--
-- KÖK NEDEN: users_update RLS'i is_active_user() idi → HERHANGİ bir aktif
-- kullanıcı BAŞKA bir kullanıcının role_id/is_active alanını değiştirebiliyordu
-- (kendi rolü trigger ile korunsa da başkalarınınki korunmasızdı). Bu, Faz 0'da
-- "geniş RLS"in İSTİSNASI olması gereken kullanıcı yönetimini açıkta bırakıyordu.
--
-- DÜZELTME: kullanıcı yazma yetkisi owner/admin'e (herkes) VEYA yalnızca kendi
-- satırına (self-profil) kısıtlanır. Ayrıca self privileged alan (role_id,
-- is_active, deleted_at) değişimi trigger ile engellenir (savunma katmanı).
-- =====================================================================

-- UPDATE: admin/owner herkesi; normal kullanıcı yalnızca KENDİ satırını.
drop policy if exists users_update on public.users;
create policy users_update on public.users
  for update to authenticated
  using (public.is_admin_or_owner() or id = auth.uid())
  with check (public.is_admin_or_owner() or id = auth.uid());

-- INSERT: yalnızca owner/admin. (Pratikte handle_new_user/create-user üzerinden;
-- doğrudan ekleme normal kullanıcıya kapalı.)
drop policy if exists users_insert on public.users;
create policy users_insert on public.users
  for insert to authenticated
  with check (public.is_admin_or_owner());

-- Self privileged alan koruması: kullanıcı KENDİ role_id / is_active / deleted_at
-- alanını değiştiremez (yetki yükseltme + kendini silme/pasifleştirme engeli).
create or replace function public.users_prevent_self_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() = new.id then
    if new.role_id is distinct from old.role_id then
      raise exception 'Kendi rolünüzü değiştiremezsiniz.' using errcode = '42501';
    end if;
    if new.is_active is distinct from old.is_active then
      raise exception 'Kendi hesap durumunuzu değiştiremezsiniz.' using errcode = '42501';
    end if;
    if new.deleted_at is distinct from old.deleted_at then
      raise exception 'Kendinizi silemezsiniz.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
