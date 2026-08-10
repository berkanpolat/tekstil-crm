-- =====================================================================
-- PAKET 5 · madde 5 — Katalog yumuşak silme
-- catalog_products zaten deleted_at/deleted_by taşıyor (P4B şeması).
-- catalogs tablosunda eksikti → ekleniyor. Fiziksel silme YOK; kayıt
-- gizlenir, ilişkili ürün/koleksiyon FK'leri korunur.
-- RLS: catalogs_write (for all, is_active_user) mevcut UPDATE'e izin verir.
-- =====================================================================

alter table public.catalogs
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users (id);

comment on column public.catalogs.deleted_at is 'Yumuşak silme zamanı; NULL = aktif.';
comment on column public.catalogs.deleted_by is 'Silen kullanıcı (auth.users).';
