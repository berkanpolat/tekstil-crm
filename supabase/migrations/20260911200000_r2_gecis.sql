-- R2 geçişi — dosyalar artık Cloudflare R2'de, Supabase Storage'da değil.
--
-- storage_path DEĞİŞMEZ: R2 anahtar şeması Supabase yollarıyla birebir aynı
-- tutuldu, böylece bu tek güncelleme geçişi tamamlar.
--
-- KAPSAM: YALNIZ bucket='documents'. 'intake-pending' kayıtlarına DOKUNULMAZ.
-- Neden: o 27 kayıt scripts/paket-leads-aktar.sql:92'de üretilmiş YER TUTUCULAR
-- ("Landing görseli — dosya henüz yüklenmedi"). Hiç dosyaları olmamış, R2'ye
-- taşınacak bir nesneleri yok, bugünkü halleriyle kalmalılar.
--
-- GEÇİŞ ÖNCESİ DOĞRULAMA (11 Eyl 2026):
--   3794 nesne R2'ye yüklendi (orijinal) + 6798 küçük resim = 10592
--   20 rastgele yolun 20'si gerçek R2 kovasında doğrulandı
--   Worker kural reddi: 0
--   Yedek: ~/tekstil-crm-yedekler/files-r2-gecis-oncesi-2026-09-11.json
--
-- GERİ DÖNÜŞ: update public.files set bucket='documents' where bucket='r2';
-- Supabase nesneleri iki hafta yerinde duruyor. DİKKAT: geçişten SONRA
-- yüklenen dosyalar yalnız R2'de olur, geri dönüşte elle kurtarma gerekir
-- (bkz. tasarım belgesi §8).

update public.files
   set bucket = 'r2'
 where bucket = 'documents';
