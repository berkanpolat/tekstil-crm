-- =====================================================================
-- Faz 3 yeniden yapılandırma — kategori ağacı genişler (Merhaba.docx 8).
-- Model (karar): Kategori = "Grup Dal" (2. seviye düğüm), Tür = ürün.
-- Eski basit ağaç deaktif; kapsamlı hazır giyim taksonomisi tohumlanır.
-- Seçicide arama var; listede olmayan tür yazınca otomatik eklenir (uygulama).
-- =====================================================================

-- Eski ağacı gizle (etiketler çözülmeye devam eder; mevcut op'lar bozulmaz)
update public.product_categories set is_active = false
  where key in ('kadin_giyim','erkek_giyim','cocuk_giyim','kurumsal_promosyon')
     or parent_id in (select id from public.product_categories where key in ('kadin_giyim','erkek_giyim','cocuk_giyim','kurumsal_promosyon'));

-- Seviye-1: Grup + Dal
insert into public.product_categories (key, label, sort_order, is_system) values
  ('cat_kadin_ust','Kadın Üst Giyim',10,true), ('cat_kadin_alt','Kadın Alt Giyim',11,true),
  ('cat_kadin_dis','Kadın Dış Giyim',12,true), ('cat_kadin_elbise','Kadın Elbise & Tulum',13,true),
  ('cat_kadin_ic','Kadın İç Giyim',14,true), ('cat_kadin_spor','Kadın Spor Giyim',15,true),
  ('cat_kadin_tesettur','Kadın Tesettür',16,true),
  ('cat_erkek_ust','Erkek Üst Giyim',20,true), ('cat_erkek_alt','Erkek Alt Giyim',21,true),
  ('cat_erkek_dis','Erkek Dış Giyim',22,true), ('cat_erkek_ic','Erkek İç Giyim',23,true),
  ('cat_erkek_spor','Erkek Spor Giyim',24,true),
  ('cat_cocuk_ust','Çocuk Üst Giyim',30,true), ('cat_cocuk_alt','Çocuk Alt Giyim',31,true),
  ('cat_cocuk_dis','Çocuk Dış Giyim',32,true), ('cat_cocuk_elbise','Çocuk Elbise & Tulum',33,true),
  ('cat_bebek','Bebek Giyim',40,true),
  ('cat_kurumsal','Kurumsal / Promosyon',50,true), ('cat_aksesuar','Aksesuar',60,true)
on conflict (key) do update set label = excluded.label, sort_order = excluded.sort_order, is_active = true;

-- Seviye-2: Türler (parent anahtarıyla)
insert into public.product_categories (key, label, parent_id, sort_order, is_system)
select 'typ_'||v.pkey||'_'||v.slug, v.label, p.id, v.so, true
from (values
  -- Kadın Üst
  ('kadin_ust','bluz','Bluz',1),('kadin_ust','gomlek','Gömlek',2),('kadin_ust','tshirt','Tişört',3),
  ('kadin_ust','body','Body',4),('kadin_ust','kazak','Kazak',5),('kadin_ust','hirka','Hırka',6),
  ('kadin_ust','sweatshirt','Sweatshirt',7),('kadin_ust','atlet','Atlet',8),('kadin_ust','crop','Crop Top',9),
  -- Kadın Alt
  ('kadin_alt','pantolon','Pantolon',1),('kadin_alt','etek','Etek',2),('kadin_alt','sort','Şort',3),
  ('kadin_alt','tayt','Tayt',4),('kadin_alt','kot','Kot Pantolon',5),
  -- Kadın Dış
  ('kadin_dis','ceket','Ceket',1),('kadin_dis','mont','Mont',2),('kadin_dis','kaban','Kaban',3),
  ('kadin_dis','trenckot','Trençkot',4),('kadin_dis','yelek','Yelek',5),
  -- Kadın Elbise
  ('kadin_elbise','elbise','Elbise',1),('kadin_elbise','tulum','Tulum',2),('kadin_elbise','abiye','Abiye',3),
  -- Kadın İç
  ('kadin_ic','sutyen','Sütyen',1),('kadin_ic','kulot','Külot',2),('kadin_ic','gecelik','Gecelik',3),('kadin_ic','pijama','Pijama Takımı',4),
  -- Kadın Spor
  ('kadin_spor','esofman','Eşofman',1),('kadin_spor','spor_tayt','Spor Tayt',2),('kadin_spor','spor_sutyen','Spor Sütyeni',3),('kadin_spor','spor_sort','Spor Şort',4),
  -- Kadın Tesettür
  ('kadin_tesettur','tunik','Tunik',1),('kadin_tesettur','ferace','Ferace',2),('kadin_tesettur','sal','Şal',3),('kadin_tesettur','esarp','Eşarp',4),('kadin_tesettur','pardosu','Pardösü',5),
  -- Erkek Üst
  ('erkek_ust','tshirt','Tişört',1),('erkek_ust','gomlek','Gömlek',2),('erkek_ust','polo','Polo Yaka',3),
  ('erkek_ust','sweatshirt','Sweatshirt',4),('erkek_ust','kazak','Kazak',5),('erkek_ust','hoodie','Hoodie',6),('erkek_ust','atlet','Atlet',7),
  -- Erkek Alt
  ('erkek_alt','pantolon','Pantolon',1),('erkek_alt','sort','Şort',2),('erkek_alt','kot','Kot Pantolon',3),('erkek_alt','esofman_alt','Eşofman Altı',4),
  -- Erkek Dış
  ('erkek_dis','ceket','Ceket',1),('erkek_dis','mont','Mont',2),('erkek_dis','kaban','Kaban',3),('erkek_dis','yelek','Yelek',4),('erkek_dis','blazer','Blazer',5),
  -- Erkek İç
  ('erkek_ic','boxer','Boxer',1),('erkek_ic','atlet','Atlet',2),('erkek_ic','pijama','Pijama Takımı',3),
  -- Erkek Spor
  ('erkek_spor','esofman','Eşofman',1),('erkek_spor','sort','Şort',2),('erkek_spor','forma','Forma',3),('erkek_spor','tshirt','Spor Tişört',4),
  -- Çocuk Üst / Alt / Dış / Elbise
  ('cocuk_ust','tshirt','Tişört',1),('cocuk_ust','sweatshirt','Sweatshirt',2),('cocuk_ust','gomlek','Gömlek',3),('cocuk_ust','kazak','Kazak',4),
  ('cocuk_alt','pantolon','Pantolon',1),('cocuk_alt','sort','Şort',2),('cocuk_alt','tayt','Tayt',3),('cocuk_alt','esofman_alt','Eşofman Altı',4),
  ('cocuk_dis','mont','Mont',1),('cocuk_dis','ceket','Ceket',2),('cocuk_dis','yelek','Yelek',3),
  ('cocuk_elbise','elbise','Elbise',1),('cocuk_elbise','tulum','Tulum',2),
  -- Bebek
  ('bebek','body','Body',1),('bebek','zibin','Zıbın',2),('bebek','tulum','Tulum',3),('bebek','patik','Patik',4),('bebek','sapka','Şapka',5),('bebek','alt_acma','Alt Açma',6),
  -- Kurumsal
  ('kurumsal','is_onlugu','İş Önlüğü',1),('kurumsal','forma','Forma',2),('kurumsal','yelek','Yelek',3),('kurumsal','sapka','Şapka',4),('kurumsal','polo','Polo Yaka',5),('kurumsal','tshirt','Tişört',6),
  -- Aksesuar
  ('aksesuar','canta','Çanta',1),('aksesuar','sapka','Şapka',2),('aksesuar','bere','Bere',3),('aksesuar','havlu','Havlu',4),('aksesuar','corap','Çorap',5),('aksesuar','atki','Atkı',6)
) as v(pkey, slug, label, so)
join public.product_categories p on p.key = 'cat_'||v.pkey
on conflict (key) do nothing;
