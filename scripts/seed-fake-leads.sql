-- =====================================================================
-- HIZLI test verisi: 3000 sahte lead (P1.11'in tam üreteci DEĞİL).
-- Amaç: liste ekranında sunucu-tarafı arama/filtre/sıralama/sayfalamayı
-- gerçek hacimle (10.000+ hedefi için 3.000 örnek) görebilmek.
-- Gerçekçilik: çoğu web_scraper kaynaklı, ~%45 kişi adı YOK (sadece firma),
-- durumlar 'yeni'/'temas' ağırlıklı, bir bölümü teklead external_id'li.
-- Çalıştırma (psql, PG* env ile): psql -f scripts/seed-fake-leads.sql
-- Geri alma:  delete from public.leads where external_source = 'seed';
-- =====================================================================
insert into public.leads
  (full_name, company_name, sector, country, city, district,
   source_id, status_id, assigned_to, next_action_at, last_interaction_at,
   external_source, external_id, created_by, created_at)
select
  -- ~%45 kişi adı yok (scraper firma listeler); CHECK company_name ile sağlanır
  case when random() < 0.45 then null
       else fn[1 + floor(random() * array_length(fn, 1))::int] || ' ' ||
            ln[1 + floor(random() * array_length(ln, 1))::int] end,
  -- firma adı: her zaman dolu (önek havuzu ile tekillik artırıldı — gerçekçi mükerrer)
  pre[1 + floor(random() * array_length(pre, 1))::int] || ' ' ||
  base[1 + floor(random() * array_length(base, 1))::int] || ' ' ||
  kind[1 + floor(random() * array_length(kind, 1))::int] || ' ' ||
  legal[1 + floor(random() * array_length(legal, 1))::int],
  sect[1 + floor(random() * array_length(sect, 1))::int],
  'Türkiye',
  city[1 + floor(random() * array_length(city, 1))::int],
  null,
  -- kaynak ağırlıklı web_scraper (id 1)
  srcpool[1 + floor(random() * array_length(srcpool, 1))::int],
  -- durum ağırlıklı yeni/temas
  statpool[1 + floor(random() * array_length(statpool, 1))::int],
  -- ~%30 atanmamış
  case when random() < 0.30 or array_length(usr,1) is null then null
       else usr[1 + floor(random() * array_length(usr, 1))::int] end,
  -- sonraki aksiyon: ~%40 planlı (geçmiş/gelecek karışık)
  case when random() < 0.40 then now() + (floor(random()*40) - 15) * interval '1 day' else null end,
  -- son etkileşim: ~%55 var
  case when random() < 0.55 then now() - floor(random()*120) * interval '1 day' else null end,
  -- hepsi external_source='seed' (temizlik: delete where external_source='seed').
  -- Her 5. satırda external_id dolu → kısmi unique index testi (deterministik/unique).
  'seed',
  case when g % 5 = 0 then 'tl-' || g::text else null end,
  case when array_length(usr,1) is null then null
       else usr[1 + floor(random() * array_length(usr, 1))::int] end,
  now() - floor(random()*240) * interval '1 day'
from generate_series(1, 3000) g
cross join (select array[
  'Ahmet','Mehmet','Ayşe','Fatma','Mustafa','Emine','Ali','Hüseyin','Hatice','İbrahim',
  'Zeynep','Hasan','Elif','Osman','Merve','Kadir','Selin','Burak','Deniz','Gökhan'] fn) f
cross join (select array[
  'Yılmaz','Kaya','Demir','Şahin','Çelik','Yıldız','Öztürk','Arslan','Doğan','Kılıç',
  'Aydın','Koç','Kurt','Özdemir','Şimşek','Polat','Korkmaz','Çetin','Güneş','Aksoy'] ln) l
cross join (select array[
  'Anadolu','Marmara','Ege','Yıldız','Güneş','Öztaş','Şık','Star','Bereket','Nova',
  'Akın','Umut','Zirve','Doruk','Pamuk','İpek','Deniz','Altın','Elit','Prestij',
  'Bengi','Çınar','Ege Star','Modatex','Şıktaş'] base) b
cross join (select array[
  'Öz','Yeni','Güven','Mega','Grup','Anka','Ada','Deka','Truva','Efe',
  'Akar','Berk','Can','Duru','Hira','Kaya','Lider','Mert','Nur','Orkun',
  'Pınar','Rüya','Sena','Tuna','Uğur','Vera','Yaman','Sıla','Toros','Fırat'] pre) pr
cross join (select array[
  'Tekstil','Örme','Konfeksiyon','Boya','İplik','Kumaş','Dokuma','Moda','Triko','Denim'] kind) k
cross join (select array[
  'A.Ş.','Ltd. Şti.','San. Tic. Ltd. Şti.','Tekstil San. A.Ş.'] legal) lg
cross join (select array[
  'Örme Kumaş','Dokuma Kumaş','Hazır Giyim','İç Giyim','Denim','Ev Tekstili',
  'Triko','Çorap','Baskı & Boya','İplik'] sect) sc
cross join (select array[
  'İstanbul','Bursa','İzmir','Denizli','Gaziantep','Tekirdağ','Kayseri','Adana',
  'Kahramanmaraş','Uşak','Ankara','Konya','Malatya','Çorlu','Manisa'] city) ci
-- ağırlıklı havuzlar (tekrar = daha sık)
cross join (select array[1,1,1,1,1,1,2,2,3,4,5,6,7,8] srcpool) sp
cross join (select array[1,1,1,1,1,2,2,2,3,3,3,4,4,5,6] statpool) st
cross join (select coalesce(array_agg(id), array[]::uuid[]) usr
            from public.users where deleted_at is null) u;
