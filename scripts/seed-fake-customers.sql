-- =====================================================================
-- HIZLI test verisi: 600 sahte müşteri (P1.11'in tam üreteci DEĞİL).
-- customer_code BEFORE INSERT trigger ile MUS-xxxx üretilir; status trigger
-- varsayılanı (aktif). Ticari bilgiler (vergi/iban) kısmen dolu.
-- Temizlik: delete from public.customers where external_source='seed';
--           (code_registry orphan'ları: delete from code_registry where entity_type='customer'
--            and entity_id not in (select id::text from customers);)
-- =====================================================================
insert into public.customers
  (full_name, company_name, sector, customer_type_id, country, city, district,
   tax_office, tax_number, iban, bank_name, account_holder,
   assigned_to, next_action_at, last_interaction_at, external_source, external_id, created_by, created_at)
select
  case when random() < 0.5 then null
       else fn[1 + floor(random()*array_length(fn,1))::int] || ' ' ||
            ln[1 + floor(random()*array_length(ln,1))::int] end,
  pre[1 + floor(random()*array_length(pre,1))::int] || ' ' ||
  base[1 + floor(random()*array_length(base,1))::int] || ' ' ||
  kind[1 + floor(random()*array_length(kind,1))::int] || ' ' ||
  legal[1 + floor(random()*array_length(legal,1))::int],
  sect[1 + floor(random()*array_length(sect,1))::int],
  -- dizi-indeks (satır başına volatile); korelasyonsuz alt sorgu sorgu başına 1 kez çalışırdı.
  tids[1 + floor(random()*array_length(tids,1))::int],
  'Türkiye',
  city[1 + floor(random()*array_length(city,1))::int],
  null,
  -- ~%70 vergi bilgisi dolu (bilinçli olarak hepsi değil — "eksik bilgiyle de çalışır")
  case when random() < 0.7 then (city[1 + floor(random()*array_length(city,1))::int] || ' VD') else null end,
  case when random() < 0.7 then lpad((floor(random()*9000000000)+1000000000)::bigint::text, 10, '0') else null end,
  case when random() < 0.5 then 'TR' || lpad((floor(random()*90)+10)::int::text,2,'0') || ' ' ||
       lpad((floor(random()*9999))::int::text,4,'0') || ' ' || lpad((floor(random()*9999))::int::text,4,'0') else null end,
  case when random() < 0.5 then bank[1 + floor(random()*array_length(bank,1))::int] else null end,
  null,
  case when random() < 0.35 or array_length(usr,1) is null then null
       else usr[1 + floor(random()*array_length(usr,1))::int] end,
  case when random() < 0.35 then now() + (floor(random()*40)-15) * interval '1 day' else null end,
  case when random() < 0.6 then now() - floor(random()*120) * interval '1 day' else null end,
  'seed',
  'seed-c-' || g::text,
  case when array_length(usr,1) is null then null else usr[1 + floor(random()*array_length(usr,1))::int] end,
  now() - floor(random()*300) * interval '1 day'
from generate_series(1, 600) g
cross join (select array['Ahmet','Mehmet','Ayşe','Fatma','Mustafa','Ali','Hüseyin','Zeynep','Elif','Osman','Merve','Kadir','Selin','Burak','Deniz'] fn) f
cross join (select array['Yılmaz','Kaya','Demir','Şahin','Çelik','Yıldız','Öztürk','Arslan','Doğan','Kılıç','Aydın','Koç','Polat','Çetin','Güneş'] ln) l
cross join (select array['Anadolu','Marmara','Ege','Yıldız','Güneş','Öztaş','Şık','Star','Bereket','Nova','Zirve','Doruk','Pamuk','İpek','Elit','Prestij','Bengi','Çınar','Modatex','Şıktaş'] base) b
cross join (select array['Öz','Yeni','Güven','Mega','Grup','Anka','Ada','Deka','Truva','Efe','Akar','Berk','Can','Duru','Hira','Kaya','Lider','Mert','Nur','Orkun','Pınar','Rüya','Sena','Tuna','Uğur','Vera','Yaman','Sıla','Toros','Fırat'] pre) pr
cross join (select array['Tekstil','Örme','Konfeksiyon','Boya','İplik','Kumaş','Dokuma','Moda','Triko','Denim'] kind) k
cross join (select array['A.Ş.','Ltd. Şti.','San. Tic. Ltd. Şti.','Tekstil San. A.Ş.'] legal) lg
cross join (select array['Örme Kumaş','Dokuma Kumaş','Hazır Giyim','İç Giyim','Denim','Ev Tekstili','Triko','Çorap','Baskı & Boya','İplik'] sect) sc
cross join (select array['İstanbul','Bursa','İzmir','Denizli','Gaziantep','Tekirdağ','Kayseri','Adana','Kahramanmaraş','Uşak','Ankara','Konya','Manisa','Çorlu'] city) ci
cross join (select array['Ziraat','İş Bankası','Garanti','Akbank','Yapı Kredi','QNB','Vakıfbank'] bank) bk
cross join (select array_agg(id) tids from public.customer_types) ct2
cross join (select coalesce(array_agg(id), array[]::uuid[]) usr from public.users where deleted_at is null) u;
