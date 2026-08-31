-- =====================================================================
-- M1.1 — KATALOG ÖZELLİK ŞEMASI (birleştirme programı, M1: ürün master)
--
-- Amaç: Studio'da (uretimCrm) duran ürün sözlüklerini ve yapısal alanları yeniCrm'e
-- taşıyabilmek için ŞEMAYI hazırlamak. Bu migration YALNIZCA şema + küçük sabit
-- sözlükleri kurar; 672 ürünün alan doldurması AYRI pakettedir (M1.2).
--
-- Studio'nun şeması KOPYALANMADI; yeniCrm'in ev kalıbına uyarlandı:
--   • uuid yerine bigint identity      • name yerine key/label çifti
--   • has_role() yerine is_active_user() / is_admin_or_owner()
--   • is_system bayrağı (sistem kayıtları silinmesin)
--
-- GERİ ALINABİLİR: tüm kolonlar nullable, mevcut ürünler etkilenmez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) slug üreteci — site ile CRM arasındaki bağın anahtarı
--    tekstilas.com ürünleri /katalog/<slug>/ adresinden sunuyor ve görsel
--    yolları da slug ile başlıyor. Göç bu alan üzerinden eşleşecek.
--    "Cep Detaylı Baskılı Penye Tunik Yeşil" → "cep-detayli-baskili-penye-tunik-yesil"
-- ---------------------------------------------------------------------
create or replace function public.catalog_slugify(input text)
returns text language sql immutable as $$
  select nullif(
    trim(both '-' from
      regexp_replace(
        regexp_replace(
          lower(translate(
            replace(coalesce(input, ''), 'ß', 'ss'),
            'İIıŞşĞğÜüÖöÇç' || 'äÄëËïÏéÉèÈêÊàÀáÁâÂñÑåÅøØíÍóÓúÚýÝ',
            'iiissgguuoocc' || 'aaeeieeeeeeaaaaaannaaooiioouuyy'
          )),
          '[^a-z0-9]+', '-', 'g'   -- harf/rakam dışındaki her şey tire
        ),
        '-{2,}', '-', 'g'          -- ardışık tireleri tekile indir
      )
    ),
  '');
$$;
comment on function public.catalog_slugify(text) is
  'Ürün adından site ile uyumlu slug üretir (Türkçe→ASCII, boşluk/noktalama→tire).';

-- ---------------------------------------------------------------------
-- 2) Sözlük tabloları
--    fabric_groups → fabric_types iki kademeli; fit/print düz.
-- ---------------------------------------------------------------------
create table public.fabric_groups (
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
comment on table public.fabric_groups is 'Kumaş grubu (Dokuma, Örme, Denim …). M1.1.';

create table public.fabric_types (
  id         bigint generated always as identity primary key,
  group_id   bigint not null references public.fabric_groups(id) on delete restrict,
  key        text not null unique,
  label      text not null,
  sort_order int  not null default 0,
  is_active  boolean not null default true,
  is_system  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index fabric_types_group_idx on public.fabric_types (group_id, sort_order);
comment on table public.fabric_types is 'Kumaş tipi, grubuna bağlı (Süprem, Compact Penye …). M1.1.';

create table public.fit_types (
  id         bigint generated always as identity primary key,
  key        text not null unique,
  label      text not null,
  sort_order int  not null default 0,
  is_active  boolean not null default true,
  is_system  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.fit_types is 'Kalıp/fit tipi (Regular, Slim, Oversize …). M1.1.';

create table public.print_types (
  id         bigint generated always as identity primary key,
  key        text not null unique,
  label      text not null,
  sort_order int  not null default 0,
  is_active  boolean not null default true,
  is_system  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.print_types is 'Baskı tekniği (Serigrafi, Dijital, Nakış …). M1.1.';

-- ---------------------------------------------------------------------
-- 3) catalog_products genişletmesi — hepsi nullable, mevcut veri etkilenmez
-- ---------------------------------------------------------------------
alter table public.catalog_products
  add column if not exists slug            text,
  add column if not exists fabric_group_id bigint references public.fabric_groups(id) on delete set null,
  add column if not exists fabric_type_id  bigint references public.fabric_types(id)  on delete set null,
  add column if not exists fit_type_id     bigint references public.fit_types(id)     on delete set null,
  add column if not exists print_type_id   bigint references public.print_types(id)   on delete set null,
  add column if not exists gramaj          int,
  add column if not exists has_print       boolean not null default false,
  add column if not exists print_details   text;

alter table public.catalog_products
  add constraint catalog_products_gramaj_pozitif check (gramaj is null or gramaj > 0);

-- slug: silinmemiş ürünler arasında benzersiz. Site /katalog/<slug>/ ile sunduğu
-- için çakışma SEO'yu bozar; arşivlenen ürünün slug'ı yeniden kullanılabilsin diye
-- kısmi indeks (deleted_at is null).
create unique index catalog_products_slug_uidx
  on public.catalog_products (slug) where slug is not null and deleted_at is null;

create index catalog_products_fabric_type_idx on public.catalog_products (fabric_type_id) where deleted_at is null;
create index catalog_products_fit_type_idx    on public.catalog_products (fit_type_id)    where deleted_at is null;

comment on column public.catalog_products.slug is
  'Site URL parçası (/katalog/<slug>/). Site ile CRM arasındaki eşleşme anahtarı — M1.2 göçünde doldurulur.';
comment on column public.catalog_products.gramaj is 'Kumaş gramajı (gr/m²). Serbest metin composition alanının yapısal karşılığı.';
comment on column public.catalog_products.has_print is 'Baskı var mı — true ise print_type_id/print_details anlamlı.';

-- ---------------------------------------------------------------------
-- 4) updated_at tetikleyicileri + RLS + yetkiler (ev kalıbı)
--    Okuma: her aktif kullanıcı. Yazma: yalnız admin/owner (sözlükler sistem verisi).
-- ---------------------------------------------------------------------
do $$ declare t text;
begin
  foreach t in array array['fabric_groups','fabric_types','fit_types','print_types'] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at();', t, t);
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_active_user());', t, t);
    execute format('create policy %I_write  on public.%I for all    to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());', t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('revoke all on public.%I from anon;', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5) Sabit sözlük tohumlaması (Studio'daki canlı değerlerle birebir)
--    fabric_types (169 kayıt) VERİ'dir → M1.2'de aktarılır, burada değil.
-- ---------------------------------------------------------------------
insert into public.fabric_groups (key, label, sort_order, is_system) values
  ('dokuma',     'Dokuma Kumaşlar',                     1, true),
  ('orme',       'Örme Kumaşlar',                       2, true),
  ('denim',      'Denim Kumaşlar',                      3, true),
  ('dosemelik',  'Döşemelik Kumaşlar',                  4, true),
  ('ev_tekstili','Ev Tekstili Kumaşları',               5, true),
  ('perdelik',   'Perdelik Kumaşlar',                   6, true),
  ('astarlik',   'Astarlık Kumaşlar',                   7, true),
  ('aksesuar',   'Aksesuar ve Teknik Amaçlı Kumaşlar',  8, true),
  ('nonwoven',   'Nonwoven Kumaşlar',                   9, true)
on conflict (key) do nothing;

insert into public.fit_types (key, label, sort_order, is_system) values
  ('regular',  'Regular Fit (Normal Kalıp)',            1, true),
  ('slim',     'Slim Fit (Dar Kalıp)',                  2, true),
  ('oversize', 'Oversize Fit (Bol Kalıp)',              3, true),
  ('relaxed',  'Relaxed Fit (Rahat Kalıp)',             4, true),
  ('skinny',   'Skinny Fit (Dar Paça – alt giyim)',     5, true),
  ('straight', 'Straight Fit (Düz Paça – alt giyim)',   6, true)
on conflict (key) do nothing;

insert into public.print_types (key, label, sort_order, is_system) values
  ('serigrafi',  'Serigrafi',      10, true),
  ('dijital',    'Dijital Baskı',  20, true),
  ('sublimasyon','Sublimasyon',    30, true),
  ('nakis',      'Nakış',          40, true),
  ('transfer',   'Transfer Baskı', 50, true)
on conflict (key) do nothing;
