-- =====================================================================
-- P0.4 — Kimlik doğrulama ve çalışanlar
-- departments, positions, users (+ auth.users köprüsü), current_app_user(),
-- ilk kullanıcı = owner + sonraki self-signup engeli, e-posta alan adı kısıtı.
--
-- İleri bağımlılıklar (kolon şimdi, FK sonra):
--   users.role_id        → public.roles(id)  FK P0.5''te eklenir
--   users.avatar_file_id → public.files(id)  FK P0.7''de eklenir
-- handle_new_user() gövdesi public.roles ve public.settings''e atıfta bulunur;
-- plpgsql bunu çalışma zamanına erteler (o tablolar imzadan sonra oluşur).
-- =====================================================================

-- ---------------------------------------------------------------------
-- departments
-- ---------------------------------------------------------------------
create table public.departments (
  id          bigint generated always as identity primary key,
  name        text    not null,
  code        text    not null unique,
  description text,
  sort_order  int     not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.departments is 'Departmanlar. Silme yok; is_active ile pasifleştirilir.';

-- ---------------------------------------------------------------------
-- positions (department_id null = global pozisyon)
-- ---------------------------------------------------------------------
create table public.positions (
  id            bigint generated always as identity primary key,
  department_id bigint references public.departments (id) on delete restrict,
  name          text    not null,
  code          text    not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index positions_department_idx on public.positions (department_id);
-- code departman başına benzersiz: farklı departmanlarda aynı code (ör. "Uzman")
-- açılabilir, ama bir departman içinde tekrarlanamaz.
create unique index positions_dept_code_uk
  on public.positions (department_id, code)
  where department_id is not null;
-- Global pozisyonlar (department_id null) için ayrı kısmi unique index:
-- global düzlemde code tekildir.
create unique index positions_global_code_uk
  on public.positions (code)
  where department_id is null;
comment on table public.positions is 'Pozisyonlar. department_id null ise global. code departman başına benzersiz. Silme yok; is_active.';

-- ---------------------------------------------------------------------
-- users — auth.users ile 1-1 köprü
-- ---------------------------------------------------------------------
create table public.users (
  id                   uuid primary key references auth.users (id) on delete restrict,
  email                text not null unique,
  full_name            text not null,
  phone                text,
  department_id        bigint references public.departments (id) on delete set null,
  position_id          bigint references public.positions (id) on delete set null,
  role_id              bigint,        -- FK → public.roles(id) P0.5''te
  is_active            boolean not null default true,
  must_change_password boolean not null default true,
  last_login_at        timestamptz,
  avatar_file_id       bigint,        -- FK → public.files(id) P0.7''de
  created_by           uuid references auth.users (id) on delete set null,
  deleted_at           timestamptz,
  deleted_by           uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index users_department_idx on public.users (department_id);
create index users_position_idx   on public.users (position_id);
create index users_role_idx       on public.users (role_id);
create index users_active_idx     on public.users (is_active) where deleted_at is null;
comment on table public.users is 'Çalışanlar. auth.users ile 1-1. Mantıksal silme: deleted_at/deleted_by.';

-- ---------------------------------------------------------------------
-- current_app_user() — P0.2''den ertelenmişti (dönüş tipi burada oluşur)
-- ---------------------------------------------------------------------
create or replace function public.current_app_user()
returns public.users
language sql
stable
security definer
set search_path = ''
as $$
  select u.* from public.users u where u.id = auth.uid();
$$;
comment on function public.current_app_user() is 'Oturumdaki kullanıcının public.users satırı.';
grant execute on function public.current_app_user() to authenticated;

-- ---------------------------------------------------------------------
-- updated_at trigger''ları
-- ---------------------------------------------------------------------
create trigger departments_touch before update on public.departments
  for each row execute function public.touch_updated_at();
create trigger positions_touch before update on public.positions
  for each row execute function public.touch_updated_at();
create trigger users_touch before update on public.users
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Denetim trigger''ları (P0.3 jenerik audit_trigger)
-- ---------------------------------------------------------------------
create trigger departments_audit after insert or update or delete on public.departments
  for each row execute function public.audit_trigger();
create trigger positions_audit after insert or update or delete on public.positions
  for each row execute function public.audit_trigger();
create trigger users_audit after insert or update or delete on public.users
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- handle_new_user() — auth.users''a her ekleme sonrası public.users köprüsü.
--   * İlk kullanıcı  → owner rolü, must_change_password=false (kendi şifresini kurdu)
--   * Sonrakiler     → yalnızca yönetici (created_by_admin bayrağı) ekleyebilir;
--                      self-signup ENGELLENİR (exception → auth insert rollback)
--   * E-posta alan adı kısıtı: settings.auth.allowed_email_domains (boşsa serbest)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count       bigint;
  -- GÜVENLİK: created_by_admin/role_id/created_by yalnızca raw_app_meta_data''dan
  -- okunur. Bu alana yalnızca admin API (service_role) yazabilir; kullanıcı
  -- signup sırasında dolduramaz. raw_user_meta_data kullanıcı kontrolündedir ve
  -- yetki/kilit kararlarında ASLA kullanılmaz.
  v_is_admin    boolean := coalesce((new.raw_app_meta_data->>'created_by_admin')::boolean, false);
  v_owner_role  bigint;
  v_role_id     bigint;
  v_domains     jsonb := '[]'::jsonb;
  v_domain      text  := lower(split_part(new.email, '@', 2));
begin
  select count(*) into v_count from public.users;

  -- Kayıt kilidi: ilk kullanıcıdan sonra yalnızca yönetici ekleyebilir
  if v_count > 0 and not v_is_admin then
    raise exception 'Kayıt kapalı: yeni kullanıcıları yalnızca yönetici ekleyebilir.'
      using errcode = '42501';
  end if;

  -- E-posta alan adı kısıtı (settings henüz yoksa serbest bırak)
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

  -- Rol tayini: ilk kullanıcı owner; sonrakiler metadata''daki role_id
  if v_count = 0 then
    begin
      select id into v_owner_role from public.roles where key = 'owner';
    exception when undefined_table then
      v_owner_role := null;  -- roller P0.5''te; o zamana dek null kalır
    end;
    v_role_id := v_owner_role;
  else
    v_role_id := nullif(new.raw_app_meta_data->>'role_id', '')::bigint;
  end if;

  -- Profil alanları (phone/department/position) yetki dışıdır → user_metadata''dan
  -- okunabilir. role_id/created_by/created_by_admin ise app_metadata''dan (güvenli).
  -- Hepsi TEK insert''te yazılır; Edge Function''da ikinci update/rollback gerekmez.
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
    (v_count > 0),                 -- ilk kullanıcı false, yönetici eklediği true
    true,
    nullif(new.raw_app_meta_data->>'created_by', '')::uuid
  );

  return new;
end;
$$;
comment on function public.handle_new_user() is
  'auth.users AFTER INSERT: public.users köprüsü + ilk kullanıcı owner + kayıt kilidi + alan adı kısıtı.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Yetki yükseltme koruması: kullanıcı KENDİ role_id''sini değiştiremez.
-- (Başka kullanıcının rolünü değiştirmek Faz 0''da geniş politikayla hâlâ
-- mümkün; bu P0.5''te RLS ile daraltılacak. Burada yalnızca self-escalation
-- kapatılıyor.) service_role/admin''de auth.uid() null olduğundan etkilenmez.
-- ---------------------------------------------------------------------
create or replace function public.users_prevent_self_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() = new.id and (new.role_id is distinct from old.role_id) then
    raise exception 'Kendi rolünüzü değiştiremezsiniz.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger users_no_self_role_change
  before update on public.users
  for each row execute function public.users_prevent_self_role_change();

-- ---------------------------------------------------------------------
-- RLS — Faz 0 GENİŞ: aktif kullanıcı okur/yazar. Fiziksel silme politikası
-- YOK (silme = deleted_at güncellemesi / is_active). Anon hiçbir şey göremez.
-- ---------------------------------------------------------------------
alter table public.departments enable row level security;
alter table public.positions   enable row level security;
alter table public.users       enable row level security;

-- departments
create policy departments_select on public.departments
  for select to authenticated using (public.is_active_user());
create policy departments_insert on public.departments
  for insert to authenticated with check (public.is_active_user());
create policy departments_update on public.departments
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());

-- positions
create policy positions_select on public.positions
  for select to authenticated using (public.is_active_user());
create policy positions_insert on public.positions
  for insert to authenticated with check (public.is_active_user());
create policy positions_update on public.positions
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());

-- users
create policy users_select on public.users
  for select to authenticated using (public.is_active_user());
create policy users_insert on public.users
  for insert to authenticated with check (public.is_active_user());
create policy users_update on public.users
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());

revoke all on public.departments, public.positions, public.users from anon;
grant select, insert, update on public.departments to authenticated;
grant select, insert, update on public.positions   to authenticated;
grant select, insert, update on public.users        to authenticated;
