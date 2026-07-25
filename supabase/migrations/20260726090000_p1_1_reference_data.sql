-- =====================================================================
-- P1.1 — Referans veriler (Satış Tanımları)
-- Kanallar, sonuçlar, kaynaklar, durumlar, müşteri türleri, etiketler + entity_tags.
-- Hepsi ayarlardan yönetilir; koda gömülü değil. Tohumlananlar is_system=true.
--
-- RLS kararı: tanım tabloları (config) YAZMA owner/admin (ayarlar alanı; Faz 0
-- settings/roles ile tutarlı, geniş-yazma açığı bırakmaz). OKUMA aktif kullanıcı
-- (açılır menüler için). entity_tags iş verisidir → aktif kullanıcı okur/yazar.
-- Fiziksel silme yok (is_active ile pasifleştir); entity_tags hariç (etiket kaldırma).
-- =====================================================================

-- Sistem tanımı koruması: is_system satırlarında key/is_system değişmez.
create or replace function public.guard_system_reference()
returns trigger
language plpgsql
as $$
begin
  if old.is_system then
    if new.key is distinct from old.key then
      raise exception 'Sistem tanımının anahtarı değiştirilemez: %', old.key using errcode = '2BP01';
    end if;
    if new.is_system is distinct from old.is_system then
      raise exception 'Sistem tanımının is_system bayrağı değiştirilemez: %', old.key using errcode = '2BP01';
    end if;
  end if;
  return new;
end;
$$;

-- Fiziksel silmeyi engelle (tanım tabloları — is_active ile pasifleştirilir).
create or replace function public.prevent_reference_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Tanım kaydı silinemez; pasifleştirin (is_active).' using errcode = '2BP01';
end;
$$;

-- Bir tanım tablosuna standart trigger'ları takan yardımcı (DDL, elle çağrılır).
-- (Postgres'te DDL döngüsü yok; her tabloya aşağıda tek tek takıyoruz.)

-- ---------------------------------------------------------------------
-- interaction_channels
-- ---------------------------------------------------------------------
create table public.interaction_channels (
  id         bigint generated always as identity primary key,
  key        text not null unique,
  label      text not null,
  sort_order int  not null default 0,
  color      text,
  is_active  boolean not null default true,
  is_system  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.interaction_channels (key, label, sort_order, color, is_system) values
  ('telefon', 'Telefon', 1, 'info', true),
  ('whatsapp', 'WhatsApp', 2, 'success', true),
  ('eposta', 'E-posta', 3, 'neutral', true),
  ('instagram', 'Instagram', 4, 'warning', true),
  ('telegram', 'Telegram', 5, 'info', true),
  ('online_toplanti', 'Online Toplantı', 6, 'info', true),
  ('ziyaret', 'Ziyaret', 7, 'neutral', true);

-- ---------------------------------------------------------------------
-- interaction_outcomes (+ is_positive)
-- ---------------------------------------------------------------------
create table public.interaction_outcomes (
  id          bigint generated always as identity primary key,
  key         text not null unique,
  label       text not null,
  sort_order  int  not null default 0,
  color       text,
  is_positive boolean not null default false,
  is_active   boolean not null default true,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
insert into public.interaction_outcomes (key, label, sort_order, color, is_positive, is_system) values
  ('ulasildi', 'Ulaşıldı', 1, 'success', true, true),
  ('ulasilamadi', 'Ulaşılamadı', 2, 'neutral', false, true),
  ('sonra_aranacak', 'Sonra Aranacak', 3, 'warning', false, true),
  ('teklif_isteniyor', 'Teklif İsteniyor', 4, 'info', true, true),
  ('numune_isteniyor', 'Numune İsteniyor', 5, 'info', true, true),
  ('siparis_olustu', 'Sipariş Oluştu', 6, 'success', true, true),
  ('olumsuz', 'Olumsuz', 7, 'danger', false, true);

-- ---------------------------------------------------------------------
-- lead_sources
-- ---------------------------------------------------------------------
create table public.lead_sources (
  id         bigint generated always as identity primary key,
  key        text not null unique,
  label      text not null,
  sort_order int  not null default 0,
  color      text,
  is_active  boolean not null default true,
  is_system  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.lead_sources (key, label, sort_order, is_system) values
  ('web_scraper', 'Web Scraper', 1, true),
  ('referans', 'Referans', 2, true),
  ('manuel', 'Manuel', 3, true),
  ('fuar', 'Fuar', 4, true),
  ('web_sitesi', 'Web Sitesi', 5, true),
  ('sosyal_medya', 'Sosyal Medya', 6, true),
  ('reklam', 'Reklam', 7, true),
  ('diger', 'Diğer', 8, true);

-- ---------------------------------------------------------------------
-- lead_statuses (+ is_closed). 'donusturuldu' sistem tarafından atanır.
-- ---------------------------------------------------------------------
create table public.lead_statuses (
  id         bigint generated always as identity primary key,
  key        text not null unique,
  label      text not null,
  sort_order int  not null default 0,
  color      text,
  is_closed  boolean not null default false,
  is_active  boolean not null default true,
  is_system  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.lead_statuses (key, label, sort_order, color, is_closed, is_system) values
  ('yeni', 'Yeni', 1, 'info', false, true),
  ('temas_kuruldu', 'Temas Kuruldu', 2, 'info', false, true),
  ('ilgileniyor', 'İlgileniyor', 3, 'warning', false, true),
  ('ulasilamiyor', 'Ulaşılamıyor', 4, 'neutral', false, true),
  ('olumsuz', 'Olumsuz', 5, 'danger', true, true),
  ('donusturuldu', 'Dönüştürüldü', 6, 'success', true, true);

-- ---------------------------------------------------------------------
-- customer_types
-- ---------------------------------------------------------------------
create table public.customer_types (
  id         bigint generated always as identity primary key,
  key        text not null unique,
  label      text not null,
  sort_order int  not null default 0,
  color      text,
  is_active  boolean not null default true,
  is_system  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.customer_types (key, label, sort_order, is_system) values
  ('yurtici', 'Yurtiçi', 1, true),
  ('ihracat', 'İhracat', 2, true);

-- ---------------------------------------------------------------------
-- tags (renk seçilebilir)
-- ---------------------------------------------------------------------
create table public.tags (
  id         bigint generated always as identity primary key,
  key        text not null unique,
  label      text not null,
  sort_order int  not null default 0,
  color      text,
  is_active  boolean not null default true,
  is_system  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.tags (key, label, sort_order, color, is_system) values
  ('premium', 'Premium', 1, 'info', true),
  ('ihracat', 'İhracat', 2, 'info', true),
  ('yuksek_potansiyel', 'Yüksek Potansiyel', 3, 'success', true),
  ('vip', 'VIP', 4, 'warning', true),
  ('riskli', 'Riskli', 5, 'danger', true),
  ('tek_seferlik', 'Tek Seferlik', 6, 'neutral', true);

-- ---------------------------------------------------------------------
-- entity_tags — çoktan çoğa (iş verisi)
-- ---------------------------------------------------------------------
create table public.entity_tags (
  id          bigint generated always as identity primary key,
  entity_type text not null,               -- 'lead' | 'customer'
  entity_id   bigint not null,
  tag_id      bigint not null references public.tags (id) on delete cascade,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  unique (entity_type, entity_id, tag_id)
);
create index entity_tags_entity_idx on public.entity_tags (entity_type, entity_id);
create index entity_tags_tag_idx on public.entity_tags (tag_id);

-- =====================================================================
-- Trigger'lar: her tanım tablosuna touch + guard + no-delete + audit
-- =====================================================================
do $$
declare
  t text;
  ref_tables text[] := array[
    'interaction_channels','interaction_outcomes','lead_sources',
    'lead_statuses','customer_types','tags'
  ];
begin
  foreach t in array ref_tables loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at();', t, t);
    execute format('create trigger %I_guard_system before update on public.%I for each row execute function public.guard_system_reference();', t, t);
    execute format('create trigger %I_no_delete before delete on public.%I for each row execute function public.prevent_reference_delete();', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger();', t, t);
  end loop;
end $$;

create trigger entity_tags_audit after insert or update or delete on public.entity_tags
  for each row execute function public.audit_trigger();

-- =====================================================================
-- RLS — tanımlar: okuma aktif kullanıcı, yazma owner/admin.
--       entity_tags: aktif kullanıcı okur/yazar (iş verisi).
-- =====================================================================
do $$
declare
  t text;
  ref_tables text[] := array[
    'interaction_channels','interaction_outcomes','lead_sources',
    'lead_statuses','customer_types','tags'
  ];
begin
  foreach t in array ref_tables loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_active_user());', t, t);
    execute format('create policy %I_write on public.%I for all to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());', t, t);
    execute format('revoke all on public.%I from anon;', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
  end loop;
end $$;

alter table public.entity_tags enable row level security;
create policy entity_tags_select on public.entity_tags
  for select to authenticated using (public.is_active_user());
create policy entity_tags_insert on public.entity_tags
  for insert to authenticated with check (public.is_active_user());
create policy entity_tags_delete on public.entity_tags
  for delete to authenticated using (public.is_active_user());
revoke all on public.entity_tags from anon;
grant select, insert, delete on public.entity_tags to authenticated;
