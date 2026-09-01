-- ============================================================================
-- GÜVENLİK 2/4 — Storage sertleştirmesi + katalog kod biçimi kısıtı
--
-- SAST kök neden D: `storage.objects` UPDATE politikasında sahiplik kontrolü yok
-- ve iki bucket'ta da boyut/MIME sınırı tanımlı değil.
-- SAST kök neden E: `catalog_products.code` / `source_code` hiç doğrulanmıyor.
--
-- Canlıda doğrulandı (1 Eyl 2026):
--   crm files delete → is_active_user() AND owner = auth.uid() AND NOT file_record_exists(...)
--   crm files update → is_active_user()                       ← sahiplik YOK
--   documents/avatars → file_size_limit = NULL, allowed_mime_types = NULL
--   catalog_products → tek kısıt UNIQUE(code); 672/672 satır temiz (`..` veya `/` yok)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. storage.objects UPDATE — sahiplik kontrolü
--
-- Üzerine yazma, silmeye eşdeğer bir yetkidir; hatta daha sinsidir çünkü
-- files.checksum ve denetim izi değişmez. DELETE'te doğru kurulmuş koşul
-- UPDATE'te de uygulanıyor.
--
-- `file_record_exists` koşulu DELETE'ten kopyalanmıyor: orada amaç "kaydı olan
-- dosya silinemesin"di. UPDATE'te dosyanın kaydı olması normaldir; burada
-- gereken tek şey sahiplik.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "crm files update" on storage.objects;

create policy "crm files update" on storage.objects
  for update
  using (
    bucket_id = any (array['documents','avatars'])
    and public.is_active_user()
    and owner = auth.uid()
  )
  with check (
    bucket_id = any (array['documents','avatars'])
    and public.is_active_user()
    and owner = auth.uid()
  );

comment on policy "crm files update" on storage.objects is
  'Yalnız dosyanın sahibi üzerine yazabilir. Sahiplik koşulu olmadan her aktif '
  'çalışan onaylı teklif/sipariş PDF''ini izsiz değiştirebiliyordu (SAST 1 Eyl 2026).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Bucket sınırları — boyut + MIME izin listesi
--
-- Bu iki alan, teklif dosyası / sipariş formu / avatar / intake indirmesi
-- yükleme bulgularının ortak zeminiydi: hiçbir katmanda içerik doğrulaması yoktu.
-- Bucket seviyesi tek doğru yer — istemci atlatamaz.
-- ─────────────────────────────────────────────────────────────────────────────

update storage.buckets
   set file_size_limit = 26214400,          -- 25 MiB
       allowed_mime_types = array[
         'application/pdf',
         'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',   -- xlsx
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document', -- docx
         'application/vnd.ms-excel',
         'text/csv','text/plain',
         'application/zip'
       ]
 where id = 'documents';

update storage.buckets
   set file_size_limit = 2097152,           -- 2 MiB
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'avatars';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Storage anahtar ad alanı — `..` ve ters bölü yasağı
--
-- scripts/yeni-katalog-gorsel-yukle.mjs ve import-catalog.mjs, DB'den okunan
-- kodu Storage anahtarına gömüyor. Anahtarın kendisini de savunuyoruz ki
-- ikinci mertebe yol kaçışı bucket seviyesinde de dursun.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.storage_key_guvenli(p_name text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select p_name is not null
     and p_name !~ '(^|/)\.\.(/|$)'   -- yol yukarı çıkma
     and p_name !~ '\\'               -- ters bölü
     and p_name !~ '^/'               -- mutlak yol
     and length(p_name) <= 1024;
$$;

drop policy if exists "crm files insert" on storage.objects;

create policy "crm files insert" on storage.objects
  for insert
  with check (
    bucket_id = any (array['documents','avatars'])
    and public.is_active_user()
    and public.storage_key_guvenli(name)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. catalog_products.code / source_code biçim kısıtı
--
-- Tek DDL iki bulguyu birden kapatır:
--   • path traversal  — `catalog/${code}/…` Storage anahtarı ve
--                        join(IMG_DIR, source_code) yerel dosya okuması
--   • SQL enjeksiyonu — import-catalog.mjs `psql -qtAc` içine kaçışsız gömüyor
--
-- Mevcut 672 satır temiz olduğu için kısıt doğrulaması sorunsuz geçer.
-- NOT VALID kullanılmıyor: veri zaten uygun, tam doğrulama isteniyor.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.catalog_products
  add constraint catalog_products_code_bicim
  check (code is null or code ~ '^[A-Za-z0-9._-]{1,64}$');

alter table public.catalog_products
  add constraint catalog_products_source_code_bicim
  check (source_code is null or source_code ~ '^[A-Za-z0-9._-]{1,64}$');

comment on constraint catalog_products_code_bicim on public.catalog_products is
  'Kod dosya yolu ve SQL''e gömüldüğü için biçim kısıtlı (SAST 1 Eyl 2026): '
  'yalnız harf/rakam/nokta/alt tire/tire. `..`, `/`, tırnak ve boşluk yasak.';

-- ============================================================================
-- GERİ ALMA:
--   alter table public.catalog_products drop constraint catalog_products_code_bicim;
--   alter table public.catalog_products drop constraint catalog_products_source_code_bicim;
--   update storage.buckets set file_size_limit=null, allowed_mime_types=null
--     where id in ('documents','avatars');
--   ...politikalar için ~/tekstil-crm-yedekler/geri_donus_acl_20260901.txt yanındaki
--      politika tanımlarına bakın (bu migration'dan önceki hâl git'te).
-- ============================================================================
