-- =====================================================================
-- ÜRETİM SIFIRLAMASI — TAM SİLME (KATALOG DAHİL)   — HAZIRLIK 2026-08-13
-- =====================================================================
-- Amaç: sistemi CANLI kullanıma hazırlamak için TÜM operasyon + CRM +
--   KATALOG verisini temizler. Bu, 1. sıfırlamadan (2026-08-12) farklı
--   olarak KATALOĞU DA siler (ürün, görsel, koleksiyon, katalog, maliyet).
--
-- ⚠️ DURUM: Bu dosya ŞU AN ROLLBACK-KİLİTLİ → çalıştırmak HİÇBİR ŞEYİ
--   DEĞİŞTİRMEZ (kazara çalışmaya karşı). Prova için son satır ROLLBACK
--   kalır; GERÇEK silme için bilinçli olarak COMMIT'e çekilir. Her ikisi
--   de AYRI onay gerektirir (üretim modu kuralı 1).
--
-- KORUNANLAR (silinmez):
--   * ayarlar (settings) + setting_history
--   * departman / pozisyon / rol / yetki / role_permissions
--   * TÜM referans listeleri (product_categories, *_statuses, provinces,
--     interaction_channels, document_types …)
--   * banka hesapları, döviz kurları (exchange_rates)
--   * workflows / workflow_steps, task şablonları
--   * notification_rules, audit_log, event_log, tags
--   * 3 kullanıcı (owner + polat.cetiner + ui.test) — auth.users + public.users
--
-- KAPSAM DIŞI (ayrı adım):
--   * Storage nesne silme (catalog/ DAHİL bu sefer) → scripts/storage-sifirlama.mjs
--     ile ayrıca çalıştırılır. Bu SQL yalnız public + storage.objects
--     METADATA'sına DEĞİL, yalnız public şema verisine dokunur.
--
-- Çalıştırma (prova):  psql ... -f scripts/uretim-sifirlama.sql
-- =====================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;

-- ---------------------------------------------------------------------
-- BÖLÜM 1 — VERİ SİLME (yapraktan köke; FK sırası korunur)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  n      bigint;
  toplam bigint := 0;
BEGIN
  RAISE NOTICE '======================================================';
  RAISE NOTICE 'ÜRETİM SIFIRLAMASI 2 — KATALOG DAHİL (kilitli: gerçek silme için COMMIT gerekir)';
  RAISE NOTICE '======================================================';

  -- 1) Operasyon alt kalemleri -----------------------------------------
  DELETE FROM quote_items;              GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  quote_items             : %', n;
  DELETE FROM order_items;              GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  order_items             : %', n;
  DELETE FROM operation_items;          GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  operation_items         : %', n;
  DELETE FROM operation_catalog_items;  GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  operation_catalog_items : %', n;

  -- 2) Belgeler (operations'a RESTRICT → operations'tan önce) -----------
  DELETE FROM documents;                GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  documents               : %', n;

  -- 3) Teklif / numune / sipariş (operations'a RESTRICT) ---------------
  DELETE FROM quotes;                   GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  quotes                  : %', n;
  DELETE FROM samples;                  GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  samples                 : %', n;
  DELETE FROM orders;                   GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  orders                  : %', n;

  -- 4) Finans (customers + operations'a RESTRICT) ----------------------
  DELETE FROM payments;                 GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  payments                : %', n;
  DELETE FROM account_transactions;     GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  account_transactions    : %', n;

  -- 5) Etkileşim / not / etiket ilişkisi (tags KORUNUR, entity_tags gider)
  DELETE FROM interactions;             GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  interactions            : %', n;
  DELETE FROM notes;                    GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  notes                   : %', n;
  DELETE FROM entity_tags;              GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  entity_tags             : %', n;

  -- 6) Görev / hedef OPERASYONEL verisi --------------------------------
  --    NOT: workflow(s)/workflow_steps ve team(s)/team_members YAPILANDIRMA
  --    olduğundan KORUNUR (bkz. script sonu notu).
  DELETE FROM task_suggestion_state;    GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  task_suggestion_state   : %', n;
  DELETE FROM task_dependencies;        GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  task_dependencies       : %', n;
  DELETE FROM task_assignments;         GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  task_assignments        : %', n;
  DELETE FROM tasks;                    GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  tasks                   : %', n;
  DELETE FROM goals;                    GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  goals                   : %', n;

  -- 7) Bildirimler -----------------------------------------------------
  DELETE FROM notifications;            GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  notifications           : %', n;

  -- 8) Açık dosyalar (snooze → CASCADE) --------------------------------
  DELETE FROM open_file_snoozes;        GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  open_file_snoozes       : %', n;
  DELETE FROM open_files;               GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  open_files              : %', n;

  -- 9) Sistem izleri ---------------------------------------------------
  DELETE FROM ai_requests;              GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  ai_requests             : %', n;
  DELETE FROM import_batches;           GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  import_batches          : %', n;

  -- 10) KATALOG — bu sefer TAMAMEN silinir (yapraktan köke) -------------
  --     product_cost_items → product_costs → catalog_product_images →
  --     catalog_products → catalog_collections → catalogs
  --     (files'tan ÖNCE: catalog_product_images.file_id ve
  --      catalogs.cover_file_id → files RESTRICT/NO-ACTION FK'leri var)
  DELETE FROM product_cost_items;       GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  product_cost_items      : %', n;
  DELETE FROM product_costs;            GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  product_costs           : %', n;
  DELETE FROM catalog_product_images;   GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  catalog_product_images  : %', n;
  DELETE FROM catalog_products;         GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  catalog_products        : %', n;
  DELETE FROM catalog_collections;      GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  catalog_collections     : %', n;
  DELETE FROM catalogs;                 GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  catalogs                : %', n;

  -- 11) Dosyalar — ARTIK TÜMÜ (katalog filtresi KALKTI) ----------------
  --     catalog_product_images + catalogs yukarıda silindiği için files
  --     üzerindeki NO-ACTION FK'ler serbest; kalan FK'ler (documents,
  --     orders, quotes, users, self) SET NULL → bloklamaz.
  DELETE FROM files;                    GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  files (TÜMÜ)            : %', n;

  -- 12) Operasyonlar (önce self-ref NULL: merged_into / possible_merge_with)
  UPDATE operations SET merged_into = NULL, possible_merge_with = NULL
   WHERE merged_into IS NOT NULL OR possible_merge_with IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE '  operations self-ref NULL: %  (silmeden önce)', n;
  DELETE FROM operations;               GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  operations              : %', n;

  -- 13) CRM kökü — leads / customers (ikisi de birbirine SET NULL) ------
  DELETE FROM leads;                    GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  leads                   : %', n;
  DELETE FROM customers;                GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  customers               : %', n;

  -- 14) İletişim noktaları (polimorfik, FK yok) ------------------------
  DELETE FROM contact_points;           GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  contact_points          : %', n;

  -- 15) Kod defteri — TAS + MUS tamamen boşalır ------------------------
  DELETE FROM code_registry;            GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  code_registry (TAS+MUS) : %', n;

  -- 16) KULLANICI KATMANI — DOKUNULMAZ (3 hesap korunur).

  RAISE NOTICE '------------------------------------------------------';
  RAISE NOTICE '  TOPLAM SİLİNEN SATIR   : %', toplam;
  RAISE NOTICE '------------------------------------------------------';
END $$;

-- ---------------------------------------------------------------------
-- BÖLÜM 2 — DOĞRULAMA (ROLLBACK öncesi): katalog=0, korunanlar dolu
-- ---------------------------------------------------------------------
DO $$
DECLARE
  c_prod int; c_img int; c_coll int; c_cat int; c_cost int; c_ci int;
  c_files int;
  c_set int; c_usr int; c_tag int; c_bank int; c_fx int;
  c_role int; c_perm int; c_rp int; c_tier int; c_pcat int;
  c_wf int; c_wfs int;
BEGIN
  -- Silinmesi beklenen (hepsi 0 olmalı):
  SELECT count(*) INTO c_prod  FROM catalog_products;
  SELECT count(*) INTO c_img   FROM catalog_product_images;
  SELECT count(*) INTO c_coll  FROM catalog_collections;
  SELECT count(*) INTO c_cat   FROM catalogs;
  SELECT count(*) INTO c_cost  FROM product_costs;
  SELECT count(*) INTO c_ci    FROM product_cost_items;
  SELECT count(*) INTO c_files FROM files;
  -- Korunması beklenen (dolu olmalı):
  SELECT count(*) INTO c_set  FROM settings;
  SELECT count(*) INTO c_usr  FROM public.users;
  SELECT count(*) INTO c_tag  FROM tags;
  SELECT count(*) INTO c_bank FROM bank_accounts;
  SELECT count(*) INTO c_fx   FROM exchange_rates;
  SELECT count(*) INTO c_role FROM roles;
  SELECT count(*) INTO c_perm FROM permissions;
  SELECT count(*) INTO c_rp   FROM role_permissions;
  SELECT count(*) INTO c_tier FROM margin_tiers;
  SELECT count(*) INTO c_pcat FROM product_categories;
  SELECT count(*) INTO c_wf   FROM workflows;
  SELECT count(*) INTO c_wfs  FROM workflow_steps;

  RAISE NOTICE '=========== SİLİNEN (0 olmalı) =======================';
  RAISE NOTICE '  catalog_products        : %   (beklenen 0)', c_prod;
  RAISE NOTICE '  catalog_product_images  : %   (beklenen 0)', c_img;
  RAISE NOTICE '  catalog_collections     : %   (beklenen 0)', c_coll;
  RAISE NOTICE '  catalogs                : %   (beklenen 0)', c_cat;
  RAISE NOTICE '  product_costs           : %   (beklenen 0)', c_cost;
  RAISE NOTICE '  product_cost_items      : %   (beklenen 0)', c_ci;
  RAISE NOTICE '  files                   : %   (beklenen 0)', c_files;
  RAISE NOTICE '=========== KORUNAN (dolu olmalı) ====================';
  RAISE NOTICE '  settings                : %', c_set;
  RAISE NOTICE '  users (public)          : %   (beklenen 3)', c_usr;
  RAISE NOTICE '  tags                    : %', c_tag;
  RAISE NOTICE '  bank_accounts           : %', c_bank;
  RAISE NOTICE '  exchange_rates          : %', c_fx;
  RAISE NOTICE '  roles                   : %', c_role;
  RAISE NOTICE '  permissions             : %', c_perm;
  RAISE NOTICE '  role_permissions        : %', c_rp;
  RAISE NOTICE '  margin_tiers            : %', c_tier;
  RAISE NOTICE '  product_categories      : %   (Faz3 ağacı — KORUNUR)', c_pcat;
  RAISE NOTICE '  workflows               : %   (süreç şablonu)', c_wf;
  RAISE NOTICE '  workflow_steps          : %   (süreç şablonu)', c_wfs;
  RAISE NOTICE '======================================================';
END $$;

-- =====================================================================
-- KİLİT: prova için ROLLBACK. Gerçek silme için bu satır bilinçli olarak
--   COMMIT yapılır (AYRI onay — üretim modu kuralı 1).
-- =====================================================================
-- KİLİT: gerçek silme 2026-08-13'te COMMIT ile UYGULANDI (1221 satır).
--   Dosya kazara yeniden çalışmasın diye ROLLBACK'e geri çekildi.
ROLLBACK;

-- =====================================================================
-- NOTLAR
-- ---------------------------------------------------------------------
-- * Bu 2. sıfırlama, 1.'den (2026-08-12) tek farkla ayrılır: KATALOG DA
--   silinir (ürün 144, görsel 504, koleksiyon 3, katalog 1, maliyet 4 +
--   13 kalem) ve files ARTIK TÜMÜYLE silinir (katalog_product filtresi yok).
--
-- * Storage: catalog/ öneki (504 obje) bu sefer KORUNMAZ →
--   scripts/storage-sifirlama.mjs ile ayrıca temizlenir (AYRI onay).
--
-- * operation_catalog_items → catalog_products NO-ACTION FK'si var; ama
--   bu tablo Bölüm 1 adım 1'de boşaltıldığı için katalog silme bloklanmaz.
--
-- * files silme sırası: catalog_product_images + catalogs (NO-ACTION FK)
--   ÖNCE silinir; kalan FK'ler (documents/orders/quotes/users/self) SET NULL.
--
-- * id sequence'leri ve TAS/MUS kodları: sıfırlanmaz (rastgele base32).
-- =====================================================================
