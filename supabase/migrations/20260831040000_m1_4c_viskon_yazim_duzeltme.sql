-- =====================================================================
-- M1.4c — DÜZELTME: sözlükte "Viscon" yazım hatası
--
-- M1.2'de katalog 4'ün composition metnindeki yazım ("Viscon") sözlüğe YENİ kayıt
-- olarak girmişti; oysa doğru yazımlı "Viskon" Studio'dan gelen sözlükte Dokuma
-- grubunda zaten vardı (0 ürünle). Sonuç: 12 ürün yanlış yazımlı kayda bağlıydı ve
-- site export'unda "Viskon" → "Viscon" gerilemesi görünüyordu.
--
-- Ürünler doğru kayda taşınır, yanlış yazımlı kayıt (yalnız boşsa) silinir.
-- Idempotent: tekrar çalıştırılabilir.
-- =====================================================================

update public.catalog_products p
   set fabric_type_id = dogru.id, fabric_group_id = dogru.group_id
  from public.fabric_types yanlis
  join public.fabric_groups yg on yg.id = yanlis.group_id and yg.key = 'dokuma'
  join public.fabric_types dogru on dogru.key = 'viskon' and dogru.group_id = yanlis.group_id
 where yanlis.key = 'viscon' and p.fabric_type_id = yanlis.id and p.deleted_at is null;

delete from public.fabric_types
 where key = 'viscon'
   and not exists (select 1 from public.catalog_products p where p.fabric_type_id = fabric_types.id);

-- Bileşik ad da doğru yazıma çekilir (etiket; anahtar korunur).
update public.fabric_types set label = 'Viskon + Terikoton' where key = 'viscon_terikoton';
