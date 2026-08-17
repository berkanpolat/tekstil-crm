-- Yeni Sezon Katalog aktarımı — tedarik/maliyet referans kodu (CSV "Kodlar", ör. TN_T_01)
-- catalog_products.code (YS-XXXX) yeni üretilen ürün kodudur; source_code ise CSV'deki
-- orijinal koddur ve maliyet reçetesi eşleştirmesi + idempotent içe aktarma için saklanır.
-- Geriye dönük uyumlu: kolon nullable, mevcut 197 ürün etkilenmez.

ALTER TABLE public.catalog_products
  ADD COLUMN IF NOT EXISTS source_code text;

COMMENT ON COLUMN public.catalog_products.source_code IS
  'İçe aktarma kaynak kodu (CSV "Kodlar"; maliyet eşleştirme + idempotent koruma). code alanından farklıdır.';

-- Idempotent içe aktarma anahtarı: aynı katalogda aynı source_code iki kez yazılamaz.
CREATE UNIQUE INDEX IF NOT EXISTS catalog_products_catalog_source_code_uidx
  ON public.catalog_products (catalog_id, source_code)
  WHERE source_code IS NOT NULL AND deleted_at IS NULL;
