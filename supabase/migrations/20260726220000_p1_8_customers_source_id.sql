-- =====================================================================
-- P1.8 hazırlık — customers.source_id (lead kaynağı dönüşümde korunur).
-- Gerekçe: müşterinin ilk nereden geldiği (web_scraper/fuar/referans...) kalıcı;
-- raporlamada değerli. Sonradan doldurulmaz → dönüşümde lead.source_id taşınır.
-- =====================================================================
alter table public.customers
  add column source_id bigint references public.lead_sources (id) on delete set null;

create index customers_source_idx on public.customers (source_id) where deleted_at is null;

comment on column public.customers.source_id is
  'Müşterinin ilk kaynağı (lead_sources). Dönüşümde lead.source_id''den taşınır.';
