-- =====================================================================
-- M1.4a — catalog_products.site_code: sitede görünen ürün kodu
--
-- SORUN (canlı veri boşluğu): tekstilas.com'daki 475 ürün müşteriye
-- ST-26SS3xxxxx kodlarıyla görünüyor, ama aynı ürünlerin CRM kodu YS-xxxxxx.
-- Müşteri talep formuna sitede gördüğü kodu yazınca CRM onu tanımıyor →
-- 58 talep satırı (56 farklı kod) hiçbir ürüne bağlanamamış durumda.
--
-- KARAR: site kodları esas alınır. Sitedeki kodlar DEĞİŞMEZ (SEO ve müşteri
-- yazışmaları korunur); kod CRM'e taşınır ve eşleştirme buna da bakar.
-- `code` (YS-…) iç kod olarak kalır — 12 operasyon ona bağlı.
--
-- Geri alınabilir: kolon nullable, mevcut veri okunmuyor.
-- =====================================================================

alter table public.catalog_products
  add column if not exists site_code text;

comment on column public.catalog_products.site_code is
  'Sitede (tekstilas.com/katalog) görünen ürün kodu. Müşteri talep formuna bunu yazar. '
  'code alanından farklı olabilir: katalog 2''de aynı, katalog 4''te code=YS-…, site_code=ST-26SS3…';

-- Silinmemiş ürünler arasında benzersiz — iki ürün aynı site kodunu taşıyamaz.
create unique index if not exists catalog_products_site_code_uidx
  on public.catalog_products (site_code)
  where site_code is not null and deleted_at is null;

-- Talep girişindeki kod eşleştirmesi bu kolona da bakacağı için aramaya uygun indeks.
create index if not exists catalog_products_site_code_lookup_idx
  on public.catalog_products (upper(site_code))
  where site_code is not null and deleted_at is null;
