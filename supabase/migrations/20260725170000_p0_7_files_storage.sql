-- =====================================================================
-- P0.7 — Dosya depolama
-- Storage bucket'ları (documents, avatars — ikisi de ÖZEL, imzalı URL ile) +
-- files tablosu (sürüm zinciri baştan) + RLS + audit. users.avatar_file_id
-- FK'sı burada eklenir (P0.4'ten ertelenmişti).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Storage bucket'ları (public=false → yalnızca imzalı URL ile erişim)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false),
       ('avatars',   'avatars',   false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- files tablosu — sürüm takibi baştan (replaces_file_id zinciri)
-- ---------------------------------------------------------------------
create table public.files (
  id               bigint generated always as identity primary key,
  bucket           text    not null,
  storage_path     text    not null,
  original_name    text    not null,
  mime_type        text,
  size_bytes       bigint,
  checksum         text,                       -- mükerrer tespiti (ör. SHA-256)
  category         public.file_category not null default 'other',
  entity_type      text,                        -- hangi kayda bağlı (Faz 1+ doldurur)
  entity_id        text,
  version          int     not null default 1,
  replaces_file_id bigint  references public.files (id) on delete set null,
  description      text,
  uploaded_by      uuid    references public.users (id) on delete set null,
  deleted_at       timestamptz,
  deleted_by       uuid,
  created_at       timestamptz not null default now()
);

create unique index files_bucket_path_uk  on public.files (bucket, storage_path);
create index        files_entity_idx      on public.files (entity_type, entity_id);
create index        files_checksum_idx    on public.files (checksum) where checksum is not null;
create index        files_category_idx    on public.files (category);
create index        files_active_idx      on public.files (created_at desc) where deleted_at is null;

comment on table public.files is
  'Yüklenen dosyaların kaydı. Fiziksel silme yok (deleted_at); sürüm zinciri replaces_file_id.';

-- Denetim (dosya oluşturma/güncelleme/silme izlenir)
create trigger files_audit after insert or update or delete on public.files
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- P0.4'ten ertelenen FK: users.avatar_file_id → files(id)
-- ---------------------------------------------------------------------
alter table public.users
  add constraint users_avatar_file_id_fkey
  foreign key (avatar_file_id) references public.files (id) on delete set null;

-- ---------------------------------------------------------------------
-- RLS — files (Faz 0 geniş: aktif kullanıcı okur/yazar; fiziksel silme yok)
-- ---------------------------------------------------------------------
alter table public.files enable row level security;

create policy files_select on public.files
  for select to authenticated using (public.is_active_user());
create policy files_insert on public.files
  for insert to authenticated with check (public.is_active_user());
create policy files_update on public.files
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());

revoke all on public.files from anon;
grant select, insert, update on public.files to authenticated;

-- ---------------------------------------------------------------------
-- RLS — storage.objects (yalnızca documents/avatars bucket'ları, aktif kullanıcı)
-- Bucket'lar özel; indirme imzalı URL ile. anon erişemez.
-- ---------------------------------------------------------------------
create policy "crm files select" on storage.objects
  for select to authenticated
  using (bucket_id in ('documents', 'avatars') and public.is_active_user());

create policy "crm files insert" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('documents', 'avatars') and public.is_active_user());

create policy "crm files update" on storage.objects
  for update to authenticated
  using (bucket_id in ('documents', 'avatars') and public.is_active_user())
  with check (bucket_id in ('documents', 'avatars') and public.is_active_user());

-- KOŞULLU FİZİKSEL SİLME: yalnızca yükleyenin kendi VE henüz bir aktif files
-- kaydına bağlanmamış nesneler silinebilir. files kaydı oluştuğu an nesne
-- dokunulmaz olur (gerçek belge = veri kaybı önlenir). Yarım/iptal yüklemeler
-- (files kaydı yok) temizlenebilir → çöp birikmez.
create or replace function public.file_record_exists(p_bucket text, p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.files f
    where f.bucket = p_bucket and f.storage_path = p_path and f.deleted_at is null
  );
$$;
grant execute on function public.file_record_exists(text, text) to authenticated;

create policy "crm files delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('documents', 'avatars')
    and public.is_active_user()
    and owner = auth.uid()
    and not public.file_record_exists(bucket_id, name)
  );
