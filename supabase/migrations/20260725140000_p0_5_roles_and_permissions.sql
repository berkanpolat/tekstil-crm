-- =====================================================================
-- P0.5 — Rol ve yetki altyapısı (+ P0.4 bootstrap kilidi çözümü)
--
-- Rol = organizasyondaki görev. Yetki = sistemde ne yapabildiği. Aynı role
-- sahip iki kullanıcının farklı yetkisi olabilir (user_permission_overrides).
--
-- Sıra kritik: (1) roles + tohum → (2) users.role_id BACKFILL → (3) FK →
-- (4) handle_new_user sağlamlaştırma. Bu sıra P0.4'teki bootstrap kilidini çözer:
-- role_id null kalan ilk/en eski kullanıcıya owner atanır.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tablolar
-- ---------------------------------------------------------------------
create table public.roles (
  id          bigint generated always as identity primary key,
  key         text    not null unique,
  name        text    not null,
  description text,
  is_system   boolean not null default false,   -- true → silinemez
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.roles is 'Organizasyon rolleri. is_system=true olanlar silinemez.';

create table public.permissions (
  id          bigint generated always as identity primary key,
  key         text not null unique,             -- module.action
  module      text not null,
  action      text not null,
  description text,
  created_at  timestamptz not null default now()
);
comment on table public.permissions is 'Yetki tanımları. key = module.action.';

create table public.role_permissions (
  role_id       bigint not null references public.roles (id) on delete cascade,
  permission_id bigint not null references public.permissions (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table public.user_permission_overrides (
  id            bigint generated always as identity primary key,
  user_id       uuid   not null references public.users (id) on delete cascade,
  permission_id bigint not null references public.permissions (id) on delete cascade,
  granted       boolean not null,               -- true=ver, false=açıkça reddet
  granted_by    uuid   references public.users (id) on delete set null,
  reason        text,
  expires_at    timestamptz,                    -- null = süresiz; geçici yetki devri
  created_at    timestamptz not null default now()
);
create index user_perm_overrides_user_idx   on public.user_permission_overrides (user_id);
create index user_perm_overrides_expiry_idx on public.user_permission_overrides (expires_at)
  where expires_at is not null;
comment on table public.user_permission_overrides is
  'Kullanıcı bazlı yetki istisnaları. expires_at ile süreli (geçici yetki devri) olabilir.';

-- ---------------------------------------------------------------------
-- Tohum roller
-- ---------------------------------------------------------------------
insert into public.roles (key, name, description, is_system) values
  ('owner',      'Sahip',     'Sistem sahibi; tüm yetkiler',        true),
  ('admin',      'Yönetici',  'Sistem yönetimi',                    true),
  ('manager',    'Müdür',     'Departman / süreç yönetimi',         false),
  ('sales',      'Satış',     'Satış ve müşteri ilişkileri',        false),
  ('operations', 'Operasyon', 'Üretim ve operasyon',                false),
  ('finance',    'Finans',    'Finans ve muhasebe',                 false),
  ('viewer',     'İzleyici',  'Salt görüntüleme',                   false);

-- ---------------------------------------------------------------------
-- Tohum yetkiler (Faz 0 çekirdek seti; modüller sonraki fazlarda genişler)
-- ---------------------------------------------------------------------
insert into public.permissions (key, module, action, description) values
  ('users.view',           'users',       'view',           'Çalışanları görüntüle'),
  ('users.create',         'users',       'create',         'Çalışan oluştur'),
  ('users.update',         'users',       'update',         'Çalışan düzenle'),
  ('users.reset_password', 'users',       'reset_password', 'Çalışan şifresi sıfırla'),
  ('users.deactivate',     'users',       'deactivate',     'Çalışan pasifleştir'),
  ('roles.view',           'roles',       'view',           'Rolleri görüntüle'),
  ('roles.manage',         'roles',       'manage',         'Rol ve yetkileri yönet'),
  ('departments.view',     'departments', 'view',           'Departmanları görüntüle'),
  ('departments.manage',   'departments', 'manage',         'Departman yönet'),
  ('positions.view',       'positions',   'view',           'Pozisyonları görüntüle'),
  ('positions.manage',     'positions',   'manage',         'Pozisyon yönet'),
  ('settings.view',        'settings',    'view',           'Ayarları görüntüle'),
  ('settings.manage',      'settings',    'manage',         'Ayarları yönet');

-- admin çekirdek yönetim yetkileri (owner zaten kısayolla her şeye sahip).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'users.view', 'users.create', 'users.update', 'users.reset_password', 'users.deactivate',
  'roles.view', 'departments.view', 'departments.manage',
  'positions.view', 'positions.manage', 'settings.view', 'settings.manage'
)
where r.key = 'admin';

-- ---------------------------------------------------------------------
-- has_permission() — GERÇEK implementasyon (P0.2'deki geçici gövdeyi değiştirir).
-- Öncelik: aktif değil → false; owner → true; kullanıcı override (süreli) →
-- rol yetkisine üstün; yoksa rol yetkisi.
-- ---------------------------------------------------------------------
create or replace function public.has_permission(permission_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_granted boolean;
begin
  if not public.is_active_user() then
    return false;
  end if;

  -- owner her yetkiye sahiptir
  if exists (
    select 1 from public.users u
    join public.roles r on r.id = u.role_id
    where u.id = v_uid and r.key = 'owner'
  ) then
    return true;
  end if;

  -- kullanıcı override'ı (süresi geçmemiş) rol yetkisine üstün gelir
  select o.granted into v_granted
  from public.user_permission_overrides o
  join public.permissions p on p.id = o.permission_id
  where o.user_id = v_uid
    and p.key = permission_key
    and (o.expires_at is null or o.expires_at > now())
  order by o.created_at desc
  limit 1;
  if found then
    return v_granted;
  end if;

  -- rol yetkisi
  return exists (
    select 1
    from public.users u
    join public.role_permissions rp on rp.role_id = u.role_id
    join public.permissions p on p.id = rp.permission_id
    where u.id = v_uid and p.key = permission_key
  );
end;
$$;

-- is_admin_or_owner() — rol/yetki tablolarının YAZMA politikaları için.
create or replace function public.is_admin_or_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    join public.roles r on r.id = u.role_id
    where u.id = auth.uid()
      and r.key in ('owner', 'admin')
      and u.is_active
      and u.deleted_at is null
  );
$$;
grant execute on function public.is_admin_or_owner() to authenticated;

-- ---------------------------------------------------------------------
-- BOOTSTRAP DÜZELTMESİ (P0.4 kilidi):
-- role_id null kalmış en eski kullanıcıya owner ata — ama yalnızca sistemde
-- henüz owner yoksa. Tek kullanıcı varsa da, birden fazla varsa da en eski
-- created_at kazanır.
-- ---------------------------------------------------------------------
update public.users
set role_id = (select id from public.roles where key = 'owner')
where role_id is null
  and created_at = (select min(created_at) from public.users where role_id is null)
  and not exists (
    select 1 from public.users u
    join public.roles r on r.id = u.role_id
    where r.key = 'owner'
  );

-- Backfill'den SONRA FK ekle.
alter table public.users
  add constraint users_role_id_fkey
  foreign key (role_id) references public.roles (id) on delete restrict;

-- ---------------------------------------------------------------------
-- handle_new_user() SAĞLAMLAŞTIRMA: roles artık var. İlk kullanıcı için owner
-- rolü BULUNAMAZSA sessiz null yerine EXCEPTION (hatayı gizleme). settings hâlâ
-- P0.6'da olduğundan onun undefined_table yakalaması korunur.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count       bigint;
  v_is_admin    boolean := coalesce((new.raw_app_meta_data->>'created_by_admin')::boolean, false);
  v_owner_role  bigint;
  v_role_id     bigint;
  v_domains     jsonb := '[]'::jsonb;
  v_domain      text  := lower(split_part(new.email, '@', 2));
begin
  select count(*) into v_count from public.users;

  if v_count > 0 and not v_is_admin then
    raise exception 'Kayıt kapalı: yeni kullanıcıları yalnızca yönetici ekleyebilir.'
      using errcode = '42501';
  end if;

  begin
    select coalesce(value, '[]'::jsonb) into v_domains
      from public.settings where key = 'auth.allowed_email_domains';
  exception when undefined_table then
    v_domains := '[]'::jsonb;
  end;

  if jsonb_typeof(v_domains) = 'array'
     and jsonb_array_length(v_domains) > 0
     and not (v_domains ? v_domain) then
    raise exception 'İzin verilmeyen e-posta alan adı: %', v_domain
      using errcode = '42501';
  end if;

  if v_count = 0 then
    select id into v_owner_role from public.roles where key = 'owner';
    if v_owner_role is null then
      -- Sessiz null bootstrap kilidini gizlerdi; açıkça patla.
      raise exception 'owner rolü tanımlı değil; sistem bootstrap edilemedi.'
        using errcode = 'P0001';
    end if;
    v_role_id := v_owner_role;
  else
    v_role_id := nullif(new.raw_app_meta_data->>'role_id', '')::bigint;
  end if;

  insert into public.users (
    id, email, full_name, phone, department_id, position_id,
    role_id, must_change_password, is_active, created_by
  ) values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), new.email),
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'department_id', '')::bigint,
    nullif(new.raw_user_meta_data->>'position_id', '')::bigint,
    v_role_id,
    (v_count > 0),
    true,
    nullif(new.raw_app_meta_data->>'created_by', '')::uuid
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Sistem rolü koruması: SİLİNEMEZ; ayrıca is_system=true iken key ve is_system
-- DEĞİŞTİRİLEMEZ (owner rolünün key'i değişirse has_permission'daki owner
-- kısayolu kırılır → sistem kilitlenir). name/description/is_active serbest.
-- ---------------------------------------------------------------------
create or replace function public.prevent_system_role_delete()
returns trigger
language plpgsql
as $$
begin
  if old.is_system then
    raise exception 'Sistem rolü silinemez: %', old.key using errcode = '2BP01';
  end if;
  return old;
end;
$$;

create or replace function public.guard_system_role_update()
returns trigger
language plpgsql
as $$
begin
  if old.is_system then
    if new.key is distinct from old.key then
      raise exception 'Sistem rolünün key alanı değiştirilemez: %', old.key
        using errcode = '2BP01';
    end if;
    if new.is_system is distinct from old.is_system then
      raise exception 'Sistem rolünün is_system bayrağı değiştirilemez: %', old.key
        using errcode = '2BP01';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Yetki yükseltme koruması (override). RLS ifade edemez, trigger ile:
--   (A) Kimse KENDİ user_id'si için override yazamaz/güncelleyemez/silemez.
--   (B) granted=true için: yazan kişi o yetkiye sahip olmalı (has_permission).
--       Owner (B)'den muaf. Sistem/servis bağlamı (auth.uid null) her ikisinden muaf.
-- ---------------------------------------------------------------------
create or replace function public.guard_user_permission_override()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_is_owner boolean;
  v_target   uuid;
  v_perm_key text;
begin
  if v_uid is null then
    return coalesce(new, old);            -- migration / service_role: güven
  end if;

  v_is_owner := exists (
    select 1 from public.users u join public.roles r on r.id = u.role_id
    where u.id = v_uid and r.key = 'owner'
  );

  -- (A) kendi kaydına dokunamaz (owner dahil)
  v_target := coalesce(new.user_id, old.user_id);
  if v_target = v_uid then
    raise exception 'Kendi yetki istisnalarınızı düzenleyemezsiniz.'
      using errcode = '42501';
  end if;

  -- (B) sahip olmadığın yetkiyi veremezsin (owner muaf)
  if tg_op in ('INSERT', 'UPDATE') and new.granted = true and not v_is_owner then
    select key into v_perm_key from public.permissions where id = new.permission_id;
    if not public.has_permission(v_perm_key) then
      raise exception 'Sahip olmadığınız bir yetkiyi veremezsiniz: %', v_perm_key
        using errcode = '42501';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

-- Aynı yükseltme kısıtı role_permissions için: sahip olmadığın yetkiyi bir role
-- ekleyemezsin (INSERT/UPDATE). Owner ve sistem bağlamı muaf.
create or replace function public.guard_role_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_perm_key text;
begin
  if v_uid is null then
    return new;                            -- migration / service_role: güven
  end if;

  if exists (
    select 1 from public.users u join public.roles r on r.id = u.role_id
    where u.id = v_uid and r.key = 'owner'
  ) then
    return new;                            -- owner muaf
  end if;

  select key into v_perm_key from public.permissions where id = new.permission_id;
  if not public.has_permission(v_perm_key) then
    raise exception 'Sahip olmadığınız bir yetkiyi role ekleyemezsiniz: %', v_perm_key
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Trigger'lar: touch + audit (rol/yetki değişiklikleri denetime yazılır)
-- ---------------------------------------------------------------------
create trigger roles_touch before update on public.roles
  for each row execute function public.touch_updated_at();
create trigger roles_no_system_delete before delete on public.roles
  for each row execute function public.prevent_system_role_delete();
create trigger roles_guard_system_update before update on public.roles
  for each row execute function public.guard_system_role_update();

-- Yetki yükseltme koruması trigger'ları (tohumlardan SONRA kurulur ki seed
-- insert'leri etkilenmesin; zaten auth.uid() null olduğu için de muaf olurlardı).
create trigger user_perm_overrides_guard
  before insert or update or delete on public.user_permission_overrides
  for each row execute function public.guard_user_permission_override();
create trigger role_permissions_guard
  before insert or update on public.role_permissions
  for each row execute function public.guard_role_permission();

create trigger roles_audit after insert or update or delete on public.roles
  for each row execute function public.audit_trigger();
create trigger permissions_audit after insert or update or delete on public.permissions
  for each row execute function public.audit_trigger();
create trigger role_permissions_audit after insert or update or delete on public.role_permissions
  for each row execute function public.audit_trigger();
create trigger user_permission_overrides_audit after insert or update or delete on public.user_permission_overrides
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- RLS: okuma aktif kullanıcı; YAZMA yalnızca owner/admin.
-- (Faz 0'da diğer tablolar geniş kalıyor, ama yetki tablolarında geniş yazma
-- self-escalation olurdu: herkes kendine override verirdi. Bu yüzden burada
-- yazma owner/admin'e kısıtlı — kullanıcının önceki düzeltmeleriyle tutarlı.)
-- ---------------------------------------------------------------------
alter table public.roles                     enable row level security;
alter table public.permissions               enable row level security;
alter table public.role_permissions          enable row level security;
alter table public.user_permission_overrides enable row level security;

-- roles
create policy roles_select on public.roles
  for select to authenticated using (public.is_active_user());
create policy roles_write on public.roles
  for all to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());

-- permissions
create policy permissions_select on public.permissions
  for select to authenticated using (public.is_active_user());
create policy permissions_write on public.permissions
  for all to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());

-- role_permissions
create policy role_permissions_select on public.role_permissions
  for select to authenticated using (public.is_active_user());
create policy role_permissions_write on public.role_permissions
  for all to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());

-- user_permission_overrides
create policy user_perm_overrides_select on public.user_permission_overrides
  for select to authenticated using (public.is_active_user());
create policy user_perm_overrides_write on public.user_permission_overrides
  for all to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());

revoke all on public.roles, public.permissions, public.role_permissions,
  public.user_permission_overrides from anon;
grant select, insert, update, delete on public.roles                     to authenticated;
grant select, insert, update, delete on public.permissions               to authenticated;
grant select, insert, update, delete on public.role_permissions          to authenticated;
grant select, insert, update, delete on public.user_permission_overrides to authenticated;
