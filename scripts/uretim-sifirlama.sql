-- =====================================================================
-- ÜRETİM SIFIRLAMASI — SİLME SCRİPTİ  (ÇALIŞTIRILDI 2026-08-12, ARTIK KİLİTLİ)
-- =====================================================================
-- Amaç: sistemi gerçek kullanıma hazırlamak için demo/deneme verisini
--   temizler; katalog, ayarlar, referans veriler ve korunan 3 kullanıcı
--   (owner + polat.cetiner + ui.test) KALIR.
--
-- ⚠️ DURUM: Gerçek silme 2026-08-12'de COMMIT ile UYGULANDI (1080 satır).
--   Son satır güvenlik için tekrar ROLLBACK'e çekildi → şu an bu dosyayı
--   çalıştırmak HİÇBİR ŞEYİ DEĞİŞTİRMEZ (kazara yeniden çalışmaya karşı).
--   Tekrar gerçek silme gerekiyorsa bilinçli olarak son satır COMMIT yapılır.
--
-- KAPSAM DIŞI (ayrı adımlar):
--   * Storage nesne silme (document/ image/ intake/) → scripts/storage-sifirlama.mjs
--     ile 2026-08-12'de UYGULANDI (72 obje; catalog/ 504 korundu).
--   * auth.users silme → GEREK YOK (silinecek hesap yok; 3 hesap korunuyor).
--
-- Bu script YALNIZCA public şemasındaki demo/operasyon verisini siler.
--
-- Çalıştırma:  psql ... -f scripts/uretim-sifirlama.sql
-- =====================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;

-- ---------------------------------------------------------------------
-- BÖLÜM 1 — VERİ SİLME (yapraktan köke, envanter (e) sırasıyla)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  n      bigint;
  toplam bigint := 0;
BEGIN
  RAISE NOTICE '======================================================';
  RAISE NOTICE 'ÜRETİM SIFIRLAMASI (gerçek silme 2026-08-12 uygulandı; dosya artık ROLLBACK-kilitli)';
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

  -- 6) Görev / hedef OPERASYONEL verisi (tümü 0). ----------------------
  --    NOT: workflow(s)/workflow_steps ve team(s)/team_members YAPILANDIRMA
  --    olduğundan KORUNUR (bkz. script sonu notu).
  DELETE FROM task_suggestion_state;    GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  task_suggestion_state   : %', n;
  DELETE FROM task_dependencies;        GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  task_dependencies       : %', n;
  DELETE FROM task_assignments;         GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  task_assignments        : %', n;
  DELETE FROM tasks;                    GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  tasks                   : %', n;
  DELETE FROM goals;                    GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  goals                   : %', n;

  -- 7) Bildirimler (open_files'tan önce; yalnız auth.users'a CASCADE) ---
  DELETE FROM notifications;            GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  notifications           : %', n;

  -- 8) Açık dosyalar (snooze → CASCADE; operations'a da CASCADE) --------
  DELETE FROM open_file_snoozes;        GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  open_file_snoozes       : %', n;
  DELETE FROM open_files;               GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  open_files              : %', n;

  -- 9) Sistem izleri --------------------------------------------------
  DELETE FROM ai_requests;              GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  ai_requests             : %', n;
  DELETE FROM import_batches;           GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  import_batches          : %', n;

  -- 10) Dosyalar — KATALOG GÖRSELLERİ HARİÇ (yalnız operation/customer) -
  DELETE FROM files WHERE entity_type <> 'catalog_product';
  GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  files (katalog hariç)   : %  (catalog_product KORUNUR)', n;

  -- 11) Operasyonlar (önce self-ref NULL: merged_into / possible_merge_with)
  UPDATE operations SET merged_into = NULL, possible_merge_with = NULL
   WHERE merged_into IS NOT NULL OR possible_merge_with IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE '  operations self-ref NULL: %  (silmeden önce)', n;
  DELETE FROM operations;               GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  operations              : %', n;

  -- 12) CRM kökü — leads / customers (ikisi de birbirine SET NULL) ------
  DELETE FROM leads;                    GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  leads                   : %', n;
  DELETE FROM customers;                GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  customers               : %', n;

  -- 13) İletişim noktaları (polimorfik, FK yok) ------------------------
  DELETE FROM contact_points;           GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  contact_points          : %', n;

  -- 14) Kod defteri — TAS + MUS tamamen boşalır ------------------------
  --     NOT: code_registry'nin sequence/sayacı YOKTUR. Kodlar rastgele
  --     base32 (generate_operation_code) üretilir; sıfırlanacak sayaç yok.
  DELETE FROM code_registry;            GET DIAGNOSTICS n = ROW_COUNT; toplam := toplam + n; RAISE NOTICE '  code_registry (TAS+MUS) : %', n;

  -- 15) KULLANICI KATMANI — DOKUNULMAZ.
  --     Silinecek deneme hesabı YOK: mevcut 3 hesap (owner + polat.cetiner
  --     + ui.test) korunuyor. Eski hard-coded 2 deneme hesabı zaten DB'de
  --     yok (önceki turda silinmiş) → silme bloğu kaldırıldı.

  RAISE NOTICE '------------------------------------------------------';
  RAISE NOTICE '  TOPLAM SİLİNEN SATIR   : %', toplam;
  RAISE NOTICE '------------------------------------------------------';
END $$;

-- ---------------------------------------------------------------------
-- BÖLÜM 2 — KORUNAN TABLOLARIN SAYIMI (ROLLBACK öncesi doğrulama)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  c_prod int; c_img int; c_set int; c_usr int; c_tag int;
  c_bank int; c_fx int; c_role int; c_perm int; c_rp int;
  c_cost int; c_tier int; c_coll int; c_cat int;
  c_wf int; c_wfs int;
BEGIN
  SELECT count(*) INTO c_prod FROM catalog_products;
  SELECT count(*) INTO c_img  FROM catalog_product_images;
  SELECT count(*) INTO c_set  FROM settings;
  SELECT count(*) INTO c_usr  FROM public.users;
  SELECT count(*) INTO c_tag  FROM tags;
  SELECT count(*) INTO c_bank FROM bank_accounts;
  SELECT count(*) INTO c_fx   FROM exchange_rates;
  SELECT count(*) INTO c_role FROM roles;
  SELECT count(*) INTO c_perm FROM permissions;
  SELECT count(*) INTO c_rp   FROM role_permissions;
  SELECT count(*) INTO c_cost FROM product_costs;
  SELECT count(*) INTO c_tier FROM margin_tiers;
  SELECT count(*) INTO c_coll FROM catalog_collections;
  SELECT count(*) INTO c_cat  FROM product_categories;
  SELECT count(*) INTO c_wf   FROM workflows;
  SELECT count(*) INTO c_wfs  FROM workflow_steps;

  RAISE NOTICE '=========== KORUNAN TABLOLAR (silme sonrası) ==========';
  RAISE NOTICE '  catalog_products        : %   (beklenen 144)', c_prod;
  RAISE NOTICE '  catalog_product_images  : %   (beklenen 504)', c_img;
  RAISE NOTICE '  settings                : %   (beklenen 62)',  c_set;
  RAISE NOTICE '  users (public)          : %   (beklenen 3: owner+polat.cetiner+ui.test)', c_usr;
  RAISE NOTICE '  tags                    : %   (beklenen 6)',   c_tag;
  RAISE NOTICE '  bank_accounts           : %   (beklenen 1)',   c_bank;
  RAISE NOTICE '  exchange_rates          : %   (beklenen 22)',  c_fx;
  RAISE NOTICE '  roles                   : %   (beklenen 7)',   c_role;
  RAISE NOTICE '  permissions             : %   (beklenen 21)',  c_perm;
  RAISE NOTICE '  role_permissions        : %   (beklenen 38)',  c_rp;
  RAISE NOTICE '  product_costs           : %   (beklenen 4)',   c_cost;
  RAISE NOTICE '  margin_tiers            : %   (beklenen 3)',   c_tier;
  RAISE NOTICE '  catalog_collections     : %   (beklenen 3)',   c_coll;
  RAISE NOTICE '  product_categories      : %   (beklenen 342)', c_cat;
  RAISE NOTICE '  workflows               : %   (beklenen 1 — süreç şablonu)', c_wf;
  RAISE NOTICE '  workflow_steps          : %   (beklenen 5 — süreç şablonu)', c_wfs;
  RAISE NOTICE '======================================================';
END $$;

-- =====================================================================
-- KİLİT: gerçek silme 2026-08-12'de COMMIT ile uygulandı; dosya kazara
--   yeniden çalışmasın diye ROLLBACK'e çekildi. Yeniden gerçek silme
--   gerekiyorsa bu satır bilinçli olarak COMMIT yapılır.
-- =====================================================================
ROLLBACK;

-- =====================================================================
-- NOTLAR
-- ---------------------------------------------------------------------
-- * KORUNAN yapılandırma (bilinçli, silinmedi): workflows (1),
--   workflow_steps (5), teams / team_members (0), task_templates,
--   task_statuses/priorities, tüm *_statuses referansları, departments,
--   positions, provinces, interaction_channels, document_types,
--   notification_rules, margin_tiers, catalog_collections,
--   product_categories. Bunlar müşteri/operasyon verisi değil.
--   >>> workflow_steps (5) senin ilk silme listende yoktu; envanter (e)'de
--       0 sanılarak eklenmişti. Yapılandırma olduğu için KORUNDU. Silinsin
--       istersen söyle, ekleyeyim.
--
-- * id sequence'leri (customers_id_seq vb.) BİLİNÇLİ sıfırlanmadı —
--   iç kimliktir, kullanıcıya görünmez; TAS/MUS kodları rastgeledir,
--   sıralı sayaca bağlı değildir.
--
-- * files: yalnız entity_type <> 'catalog_product' (operation+customer =
--   15 satır) silinir; 504 katalog görseli dosyası KORUNUR.
--
-- * SONRAKİ AYRI ADIMLAR (bu scriptte YOK):
--     1. Storage: documents bucket'ında document/ image/ intake/ önekleri
--        silinir; catalog/ (504) korunur.
--     2. auth.users: 4f762e8d + 769872b5 Admin API ile silinir (katman 2).
-- =====================================================================
