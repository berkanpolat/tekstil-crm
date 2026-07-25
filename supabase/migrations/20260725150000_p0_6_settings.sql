-- =====================================================================
-- P0.6 — Ayarlar altyapısı
-- settings (anahtar/değer, jsonb) + setting_history (her değişiklik izlenir).
-- Genişletilebilirlik: departman/rol/durum gibi ayarlar KODA gömülmez, veri olur.
-- system.test_mode Faz 0'da kullanılmıyor ama Faz 2'de gerçek müşteriye kaza ile
-- mesaj gitmesini engelleyecek tek koruma; şimdi kuruluyor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------
create table public.settings (
  key          text primary key,
  value        jsonb not null,
  category     text  not null,
  description  text,
  is_sensitive boolean not null default false,
  updated_by   uuid references public.users (id) on delete set null,
  updated_at   timestamptz not null default now()
);
comment on table public.settings is 'Anahtar/değer sistem ayarları (jsonb). Değişiklikler setting_history''ye yazılır.';

-- ---------------------------------------------------------------------
-- setting_history — append-only değişiklik geçmişi
-- ---------------------------------------------------------------------
create table public.setting_history (
  id          bigint generated always as identity primary key,
  setting_key text not null,
  old_value   jsonb,
  new_value   jsonb,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);
create index setting_history_key_idx on public.setting_history (setting_key, changed_at desc);
comment on table public.setting_history is 'Ayar değişiklik geçmişi (append-only). is_sensitive ayarlarda değer maskelenir.';

-- ---------------------------------------------------------------------
-- BEFORE UPDATE: updated_at + updated_by (auth.uid) otomatik damgalanır
-- ---------------------------------------------------------------------
create or replace function public.settings_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- AFTER UPDATE: değer değiştiyse geçmişe yaz. is_sensitive → değer maskeli.
-- ---------------------------------------------------------------------
create or replace function public.settings_write_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.value is distinct from new.value then
    insert into public.setting_history (setting_key, old_value, new_value, changed_by)
    values (
      new.key,
      case when new.is_sensitive then '"***"'::jsonb else old.value end,
      case when new.is_sensitive then '"***"'::jsonb else new.value end,
      auth.uid()
    );
  end if;
  return null;
end;
$$;

create trigger settings_stamp_trg
  before update on public.settings
  for each row execute function public.settings_stamp();
create trigger settings_history_trg
  after update on public.settings
  for each row execute function public.settings_write_history();

-- setting_history append-only: update/delete/truncate engelli (P0.3 prevent_mutation).
create trigger setting_history_no_update
  before update on public.setting_history
  for each row execute function public.prevent_mutation();
create trigger setting_history_no_delete
  before delete on public.setting_history
  for each row execute function public.prevent_mutation();
create trigger setting_history_no_truncate
  before truncate on public.setting_history
  for each statement execute function public.prevent_mutation();

-- ---------------------------------------------------------------------
-- settings satırları SİLİNEMEZ; INSERT yalnızca sistem bağlamında (migration,
-- auth.uid() null) mümkün — yeni ayar anahtarları koddan/migration'dan gelir,
-- arayüzden eklenmez. Bu iki kısıtla setting_history'nin yalnızca UPDATE izlemesi
-- yeterli olur; genel audit_trigger'a gerek kalmaz.
-- ---------------------------------------------------------------------
create or replace function public.settings_prevent_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Ayar silinemez: %', old.key using errcode = '2BP01';
end;
$$;

create or replace function public.settings_insert_system_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    raise exception 'Yeni ayar anahtarları yalnızca migration ile eklenir.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger settings_no_delete
  before delete on public.settings
  for each row execute function public.settings_prevent_delete();
create trigger settings_insert_guard
  before insert on public.settings
  for each row execute function public.settings_insert_system_only();

-- ---------------------------------------------------------------------
-- Tohum ayarlar
-- ---------------------------------------------------------------------
insert into public.settings (key, value, category, description, is_sensitive) values
  ('company.name',          '""'::jsonb,                 'company', 'Şirket adı',                    false),
  ('company.legal_name',    '""'::jsonb,                 'company', 'Yasal unvan',                   false),
  ('company.tax_office',    '""'::jsonb,                 'company', 'Vergi dairesi',                 false),
  ('company.tax_number',    '""'::jsonb,                 'company', 'Vergi numarası',                false),
  ('company.address',       '""'::jsonb,                 'company', 'Adres',                         false),
  ('company.phone',         '""'::jsonb,                 'company', 'Telefon',                       false),
  ('company.whatsapp',      '""'::jsonb,                 'company', 'WhatsApp',                      false),
  ('company.email',         '""'::jsonb,                 'company', 'E-posta',                       false),
  ('company.website',       '""'::jsonb,                 'company', 'Web sitesi',                    false),
  ('company.logo_file_id',  'null'::jsonb,               'company', 'Logo dosyası (files.id)',       false),

  ('auth.allowed_email_domains',   '[]'::jsonb, 'auth', 'İzinli e-posta alan adları (boş=serbest)', false),
  ('auth.session_timeout_minutes', '480'::jsonb,               'auth', 'Oturum zaman aşımı (dakika)',              false),

  ('codes.operation_prefix', '"TAS"'::jsonb,             'codes',  'Operasyon kodu öneki',          false),
  ('codes.length',           '6'::jsonb,                 'codes',  'Operasyon kodu uzunluğu',       false),

  ('system.test_mode',       'true'::jsonb,              'system', 'Test modu (Faz 2 mesaj koruması)', false),
  ('system.timezone',        '"Europe/Istanbul"'::jsonb, 'system', 'Sistem saat dilimi',            false),

  ('working_hours.days',     '[1,2,3,4,5]'::jsonb,       'working_hours', 'Çalışma günleri (1=Pzt)',  false),
  ('working_hours.start',    '"09:00"'::jsonb,           'working_hours', 'Mesai başlangıcı',         false),
  ('working_hours.end',      '"18:00"'::jsonb,           'working_hours', 'Mesai bitişi',             false),
  ('working_hours.holidays', '[]'::jsonb,                'working_hours', 'Resmi tatiller (tarih dizisi)', false);

-- ---------------------------------------------------------------------
-- RLS: okuma aktif kullanıcı; YAZMA yalnızca owner/admin.
-- setting_history: okuma aktif kullanıcı; yazma yalnızca trigger (definer).
-- ---------------------------------------------------------------------
alter table public.settings        enable row level security;
alter table public.setting_history enable row level security;

-- Okuma: aktif kullanıcı; ANCAK is_sensitive=true satırları yalnızca owner/admin.
create policy settings_select on public.settings
  for select to authenticated
  using (public.is_active_user() and (not is_sensitive or public.is_admin_or_owner()));
-- Yazma yalnızca UPDATE (insert/delete trigger ile kapalı) ve yalnızca owner/admin.
create policy settings_update on public.settings
  for update to authenticated
  using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());

-- setting_history: hassas ayar geçmişini de yalnızca owner/admin görsün
-- (değer maskeli olsa da anahtar/zaman bilgisini sızdırmayalım).
create policy setting_history_select on public.setting_history
  for select to authenticated
  using (
    public.is_active_user()
    and (
      public.is_admin_or_owner()
      or not exists (
        select 1 from public.settings s
        where s.key = setting_history.setting_key and s.is_sensitive
      )
    )
  );

revoke all on public.settings, public.setting_history from anon;
grant select, update on public.settings to authenticated;
grant select on public.setting_history to authenticated;
