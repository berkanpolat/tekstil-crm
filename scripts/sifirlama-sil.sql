-- TEKSTIL-CRM TAM VERİ SIFIRLAMA — canlı silme SQL'i
-- Yalnızca (c) onayından SONRA çalıştırılır. Tek transaction.
-- KORUNUR: katalog (catalog_products/_images/product_costs + katalog files),
--          users/roles/permissions, ayarlar, referans tabloları,
--          code_registry, audit_log, event_log, exchange_rates, margin_tiers.
-- Identity sayaçları SIFIRLANMAZ (id'ler kaldığı yerden devam eder).

\set ON_ERROR_STOP on
BEGIN;

-- 1) Yaprak / geçmiş çocuk tablolar
DELETE FROM public.messages;                 -- conversations cascade'i de kapsar; açıkça
DELETE FROM public.conversations;
DELETE FROM public.entity_tags;
DELETE FROM public.contact_points;
DELETE FROM public.notes;
DELETE FROM public.notifications;
DELETE FROM public.interactions;
DELETE FROM public.task_suggestion_state;
DELETE FROM public.open_file_snoozes;
DELETE FROM public.open_files;
DELETE FROM public.operation_items;
DELETE FROM public.operation_catalog_items;

-- 2) Finans
DELETE FROM public.account_transactions;
DELETE FROM public.payments;

-- 3) Belgeler (operations'tan ÖNCE — RESTRICT)
DELETE FROM public.documents;

-- 4) Sipariş / teklif / numune (operations'tan ÖNCE — RESTRICT; item'lar cascade)
DELETE FROM public.order_items;
DELETE FROM public.orders;
DELETE FROM public.quote_items;
DELETE FROM public.quotes;
DELETE FROM public.samples;

-- 5) Operasyonlar (talepler)
DELETE FROM public.operations;

-- 6) Müşteriler → potansiyeller
DELETE FROM public.customers;
DELETE FROM public.leads;

-- 7) Dosya kayıt defteri — YALNIZ katalog-DIŞI satırlar.
--    Katalog: entity_type='catalog_product' VEYA catalog_product_images'ta referanslı.
DELETE FROM public.files
  WHERE entity_type IS DISTINCT FROM 'catalog_product'
    AND id NOT IN (SELECT file_id FROM public.catalog_product_images WHERE file_id IS NOT NULL);

-- Koruma doğrulaması (commit ÖNCESİ). Beklenen katalog files = 3797.
DO $$
DECLARE cat_files int; cat_prod int;
BEGIN
  SELECT count(*) INTO cat_files FROM public.files;
  SELECT count(*) INTO cat_prod  FROM public.catalog_products;
  RAISE NOTICE 'Kalan files (katalog)=%, catalog_products=%', cat_files, cat_prod;
  IF cat_prod = 0 THEN
    RAISE EXCEPTION 'GÜVENLİK DURDURMA: catalog_products boşaldı — beklenm%dik!', 0;
  END IF;
END $$;

COMMIT;

-- PostgREST önbelleğini yenile
NOTIFY pgrst, 'reload schema';
