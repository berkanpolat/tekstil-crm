-- =====================================================================
-- P11.1 — orders.extraction_source CHECK'ine 'belge' eklenir
-- =====================================================================
-- Sorun: "Sipariş bilgisini belgeden çek" akışı extraction_source='belge'
--   yazıyor, ama kısıt yalnız ('manuel','ai') izin veriyordu → her "Onayla
--   ve kaydet" CHECK ihlaliyle (23514) düşüyordu (generic "İşlem tamamlanamadı").
-- Çözüm: izinli değer kümesine 'belge' eklenir. Idempotent (drop + add).
-- =====================================================================

alter table public.orders drop constraint if exists orders_extraction_source_check;

alter table public.orders add constraint orders_extraction_source_check
  check (extraction_source = any (array['manuel'::text, 'ai'::text, 'belge'::text]));
