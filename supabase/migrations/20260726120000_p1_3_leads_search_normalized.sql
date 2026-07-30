-- =====================================================================
-- P1.3 arama tutarlılığı: full_name ve city için de normalize_tr'li generated
-- stored sütunlar. Sebep: ilike Türkçe/aksan katlamıyor — 'sukru' arayan
-- 'Şükrü'yü, 'istanbul' arayan 'İstanbul'u bulamıyordu. Arama artık firma+kişi
-- +şehir için normalize sütunlardan yapılır (arama terimi de normalize_tr'den
-- geçer). ADD COLUMN generated stored mevcut satırları da hesaplar.
-- =====================================================================
alter table public.leads
  add column full_name_normalized text
    generated always as (public.normalize_tr(full_name)) stored,
  add column city_normalized text
    generated always as (public.normalize_tr(city)) stored;

create index leads_full_name_norm_idx on public.leads (full_name_normalized)
  where deleted_at is null;
create index leads_city_norm_idx on public.leads (city_normalized)
  where deleted_at is null;

comment on column public.leads.full_name_normalized is
  'normalize_tr(full_name) — Türkçe/aksan duyarsız arama için (generated stored).';
comment on column public.leads.city_normalized is
  'normalize_tr(city) — Türkçe/aksan duyarsız arama için (generated stored).';
