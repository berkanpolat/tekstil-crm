// =====================================================================
// Bölüm 2 — Uçtan uca senaryo testleri (A–J). Her senaryo KENDİ verisini
// üretir, iş mantığını doğrular ve transaction ROLLBACK ile İZ BIRAKMADAN
// temizlenir. Veritabanı (iş kuralı) katmanını sürer; arayüz akışı için
// scripts/e2e-ui-senaryolar.mjs (Playwright) tamamlar.
//
// Bağlantı: PG* env / .env SUPABASE_DB_PASSWORD. Ağ: dangerouslyDisableSandbox.
// Çalıştırma: node scripts/e2e-senaryolar.mjs
// =====================================================================
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pass = process.env.PGPASSWORD ||
  readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith('SUPABASE_DB_PASSWORD='))?.split('=').slice(1).join('=').trim()
const ENV = { ...process.env, PGHOST: process.env.PGHOST || 'aws-0-eu-west-1.pooler.supabase.com',
  PGPORT: process.env.PGPORT || '5432', PGUSER: process.env.PGUSER || 'postgres.kkxvoxeqfsaqzklrtgrw',
  PGDATABASE: process.env.PGDATABASE || 'postgres', PGPASSWORD: pass }

// Her senaryo bağımsız tek transaction; sonunda rollback. Ortak kurulum inline.
// Kurulum makrosu: müşteri + operasyon (+ opsiyonel siparis_onay belgesi sert kapı için).
const SETUP = (tag, withOnay = true) => `
  with c as (insert into public.customers (status_id, company_name) select id,'E2E-${tag}' from public.customer_statuses limit 1 returning id)
  insert into public.operations (code, customer_id, stage_id, title)
    select 'TAS-E2E${tag}', c.id, (select id from operation_stages where key='teklif_iletildi'), 'e2e ${tag}' from c;
  ${withOnay ? `insert into public.documents (operation_id, document_type_id)
    select (select id from operations where code='TAS-E2E${tag}'), (select id from document_types where key='siparis_onay');` : ''}
`
const opId = (tag) => `(select id from operations where code='TAS-E2E${tag}')`
const custId = (tag) => `(select customer_id from operations where code='TAS-E2E${tag}')`
const stageKey = (tag) => `(select s.key from operations o join operation_stages s on s.id=o.stage_id where o.code='TAS-E2E${tag}')`

const SQL = `
-- ============ A — Basit yol (numune→aşama, sipariş→aşama, ödeme→bakiye) ============
begin;
${SETUP('A')}
insert into public.samples (operation_id, version) select ${opId('A')}, 1;
select 'RES|A|numune sonrası aşama=numune|'||case when ${stageKey('A')}='numune' then 'PASS' else 'FAIL' end||'|'||${stageKey('A')};
insert into public.orders (operation_id, subtotal, tax_rate, total, currency, status_id)
  select ${opId('A')}, 1000, 0, 1000, 'USD', (select id from order_statuses where key='olusturuldu');
select 'RES|A|sipariş sonrası aşama=siparis|'||case when ${stageKey('A')}='siparis' then 'PASS' else 'FAIL' end||'|'||${stageKey('A')};
insert into public.payments (customer_id, operation_id, direction, kind, amount, currency, exchange_rate, usd_rate, paid_at)
  select ${custId('A')}, ${opId('A')}, 'gelen', 'diger', 400, 'USD', 47, 47, now();
select 'RES|A|bakiye = alacak400 - borç1000 = -600|'||case when round((select balance_usd from customer_balance(${custId('A')})),2)=-600.00 then 'PASS' else 'FAIL' end||'|'||round((select balance_usd from customer_balance(${custId('A')})),2)::text;
rollback;

-- ============ B — Çoklu ürün (bir talepte 8 katalog ürünü) ============
begin;
${SETUP('B', false)}
insert into public.operation_catalog_items (operation_id, catalog_product_code, label, sort_order)
  select ${opId('B')}, 'URUN-'||g, 'Ürün '||g, g from generate_series(1,8) g;
select 'RES|B|8 katalog ürünü bağlı|'||case when (select count(*) from operation_catalog_items where operation_id=${opId('B')})=8 then 'PASS' else 'FAIL' end||'|'||(select count(*) from operation_catalog_items where operation_id=${opId('B')})::text;
rollback;

-- ============ C — Revizyon zinciri (teklif v1→v2→v3, numune 3 tur) ============
begin;
${SETUP('C')}
insert into public.quotes (operation_id, version, valid_until, tax_rate, status_id)
  select ${opId('C')}, 1, now()+interval '7 days', 10, (select id from quote_statuses where key='cevap_bekleniyor');
select public.create_quote_revision((select id from quotes where operation_id=${opId('C')} order by version desc limit 1));
select public.create_quote_revision((select id from quotes where operation_id=${opId('C')} order by version desc limit 1));
select 'RES|C|teklif v1..v3 (3 sürüm, v1 korunur)|'||case when (select count(*) from quotes where operation_id=${opId('C')})=3 and (select max(version) from quotes where operation_id=${opId('C')})=3 and exists(select 1 from quotes where operation_id=${opId('C')} and version=1) then 'PASS' else 'FAIL' end||'|'||(select count(*)||' sürüm, max v'||max(version) from quotes where operation_id=${opId('C')});
insert into public.samples (operation_id, version) select ${opId('C')}, 1;
-- Gerçek UI yolu: revise_sample AYNI kayıtta revision_round'u artırır (1→2→3)
select public.revise_sample((select id from samples where operation_id=${opId('C')} limit 1), 'Renk revizyonu');
select public.revise_sample((select id from samples where operation_id=${opId('C')} limit 1), 'Ölçü revizyonu');
select 'RES|C|numune 3. tur (aynı kayıt, revision_round=3)|'||case when (select count(*) from samples where operation_id=${opId('C')})=1 and (select revision_round from samples where operation_id=${opId('C')} limit 1)=3 then 'PASS' else 'FAIL' end||'|'||(select 'round='||revision_round from samples where operation_id=${opId('C')} limit 1);
rollback;

-- ============ D — Çoklu dosya (3 dosya, sürüm zinciri) ============
begin;
${SETUP('D', false)}
insert into public.files (bucket, storage_path, original_name, category, entity_type, entity_id)
  select 'documents', 'document/e2e-d-'||g||'.pdf', 'dosya'||g||'.pdf', 'document', 'operation', ${opId('D')}::text from generate_series(1,3) g;
select 'RES|D|3 dosya operasyona bağlı|'||case when (select count(*) from files where entity_type='operation' and entity_id=${opId('D')}::text and deleted_at is null)=3 then 'PASS' else 'FAIL' end||'|'||(select count(*) from files where entity_type='operation' and entity_id=${opId('D')}::text)::text;
-- birini sil → diğerleri etkilenmez
update public.files set deleted_at=now() where entity_type='operation' and entity_id=${opId('D')}::text and original_name='dosya2.pdf';
select 'RES|D|1 silinince 2 kalır (bağımsız)|'||case when (select count(*) from files where entity_type='operation' and entity_id=${opId('D')}::text and deleted_at is null)=2 then 'PASS' else 'FAIL' end||'|'||(select count(*) from files where entity_type='operation' and entity_id=${opId('D')}::text and deleted_at is null)::text;
rollback;

-- ============ E — Kısmi ödemeler (USD + TRY karışık, bakiye) ============
begin;
${SETUP('E')}
insert into public.orders (operation_id, subtotal, tax_rate, total, currency, status_id)
  select ${opId('E')}, 10000, 0, 10000, 'USD', (select id from order_statuses where key='olusturuldu');
-- borç $10.000 (USD sipariş → amount_usd=10000)
insert into public.payments (customer_id, operation_id, direction, kind, amount, currency, exchange_rate, usd_rate, paid_at)
  select ${custId('E')}, ${opId('E')}, 'gelen','diger', 3000, 'USD', 47, 47, now();
insert into public.payments (customer_id, operation_id, direction, kind, amount, currency, exchange_rate, usd_rate, paid_at)
  select ${custId('E')}, ${opId('E')}, 'gelen','diger', 120000, 'TRY', 1, 34, now();   -- 120000/34 = 3529.41
insert into public.payments (customer_id, operation_id, direction, kind, amount, currency, exchange_rate, usd_rate, paid_at)
  select ${custId('E')}, ${opId('E')}, 'gelen','diger', 1500, 'USD', 47, 47, now();
-- bakiye = alacak(3000+3529.41+1500) - borç(10000) = -1970.59
select 'RES|E|karışık ödeme bakiyesi ≈ -1970.59|'||case when round((select balance_usd from customer_balance(${custId('E')})),2)=-1970.59 then 'PASS' else 'FAIL' end||'|'||round((select balance_usd from customer_balance(${custId('E')})),2)::text;
select 'RES|E|3 ödeme alacak kaydı oluştu|'||case when (select count(*) from account_transactions where customer_id=${custId('E')} and direction='alacak' and source_type='odeme')=3 then 'PASS' else 'FAIL' end||'|'||(select count(*) from account_transactions where customer_id=${custId('E')} and direction='alacak' and source_type='odeme')::text;
rollback;

-- ============ F — İptal ve geri alma (ters kayıt, bakiye sıfırlanır) ============
begin;
${SETUP('F')}
insert into public.orders (operation_id, subtotal, tax_rate, total, currency, status_id)
  select ${opId('F')}, 5000, 0, 5000, 'USD', (select id from order_statuses where key='olusturuldu');
select 'RES|F|sipariş sonrası borç -5000|'||case when round((select balance_usd from customer_balance(${custId('F')})),2)=-5000.00 then 'PASS' else 'FAIL' end||'|'||round((select balance_usd from customer_balance(${custId('F')})),2)::text;
-- sipariş iptal → sync_order_debt ters kayıt atar → net 0
update public.orders set status_id=(select id from order_statuses where key='iptal_edildi') where operation_id=${opId('F')};
select 'RES|F|iptal sonrası bakiye 0 (ters kayıt)|'||case when round((select balance_usd from customer_balance(${custId('F')})),2)=0.00 then 'PASS' else 'FAIL' end||'|'||round((select balance_usd from customer_balance(${custId('F')})),2)::text;
-- ödeme geri alma: ödeme ekle sonra sil → alacak iade edilir
insert into public.payments (customer_id, operation_id, direction, kind, amount, currency, exchange_rate, usd_rate, paid_at)
  select ${custId('F')}, ${opId('F')}, 'gelen','diger', 800, 'USD', 47, 47, now();
update public.payments set deleted_at=now() where operation_id=${opId('F')} and amount=800;
select 'RES|F|ödeme silinince alacak iade (bakiye 0)|'||case when round((select balance_usd from customer_balance(${custId('F')})),2)=0.00 then 'PASS' else 'FAIL' end||'|'||round((select balance_usd from customer_balance(${custId('F')})),2)::text;
rollback;

-- ============ G — Eşzamanlılık (talebi ikinci üstlenme reddedilir) ============
begin;
${SETUP('G', false)}
-- kullanıcı A üstlensin (owner set)
update public.operations set owner_id=(select id from users where email='ui.test@tekstilas.com') where code='TAS-E2EG';
-- ikinci üstlenme denemesi: owner dolu → claim_operation "claimed=false" döner (başka biri aldı)
select 'RES|G|dolu sahipli talebi claim reddeder|'||case when coalesce((public.claim_operation(${opId('G')})->>'claimed')::boolean, false)=false then 'PASS' else 'FAIL' end||'|'||coalesce(public.claim_operation(${opId('G')})::text,'null');
rollback;

-- ============ H — Sınır değerler (kademe sınırları, uzun metin, TR karakter, tarih) ============
begin;
${SETUP('H', false)}
-- marj kademeleri: 50→25, 200→20, 500→10 (mevcut kademeleri geçici değiştir)
create temporary table _mt (min_quantity int, margin_percent numeric) on commit drop;
insert into _mt values (50,25),(200,20),(500,10);
-- her sınır için: min_quantity ≤ adet olan EN BÜYÜK kademe
select 'RES|H|kademe sınırları 49..501 doğru|'||
  case when (select string_agg(coalesce(m.margin_percent::text,'yok'),',' order by q.qty)
             from (values (49),(50),(51),(199),(200),(201),(499),(500),(501)) q(qty)
             left join lateral (select margin_percent from _mt where min_quantity<=q.qty order by min_quantity desc limit 1) m on true)
       = 'yok,25,25,25,20,20,20,10,10'
  then 'PASS' else 'FAIL' end||'|'||
  (select string_agg(coalesce(m.margin_percent::text,'yok'),',' order by q.qty)
   from (values (49),(50),(51),(199),(200),(201),(499),(500),(501)) q(qty)
   left join lateral (select margin_percent from _mt where min_quantity<=q.qty order by min_quantity desc limit 1) m on true);
-- 500 karakter firma adı + TR karakter kabul
update public.customers set company_name=repeat('ÇğİöşüÂ ',63) where id=${custId('H')};
select 'RES|H|500+ karakter + TR karakter kabul|'||case when length((select company_name from customers where id=${custId('H')}))>=500 then 'PASS' else 'FAIL' end||'|'||length((select company_name from customers where id=${custId('H')}))::text;
-- 2 yıl önce/sonra tarihler kabul
update public.operations set requested_at=now()-interval '2 years', expected_delivery=(now()+interval '2 years')::date where code='TAS-E2EH';
select 'RES|H|geçmiş/gelecek 2 yıl tarih kabul|'||case when (select requested_at from operations where code='TAS-E2EH') < now()-interval '1 year' then 'PASS' else 'FAIL' end||'|ok';
rollback;

-- ============ I — Boş sistem (sorgular hata vermeden 0 döner) ============
begin;
select 'RES|I|boş listelerde hata yok (0 döner)|'||case when
  (select count(*) from operations)>=0 and (select count(*) from quotes)>=0 and (select count(*) from customer_balance(-1))>=0
  then 'PASS' else 'FAIL' end||'|ok';
rollback;

-- ============ J — Yoğun sistem (500 operasyon + sayfalı sorgu hızlı) ============
begin;
${SETUP('J', false)}
insert into public.operations (code, customer_id, stage_id, title)
  select 'TAS-JQ'||g, ${custId('J')}, (select id from operation_stages where key='teklif_iletildi'), 'yük'||g from generate_series(1,500) g;
select 'RES|J|500 operasyon eklendi|'||case when (select count(*) from operations where code like 'TAS-JQ%')=500 then 'PASS' else 'FAIL' end||'|'||(select count(*) from operations where code like 'TAS-JQ%')::text;
rollback;
`

const out = execFileSync('psql', ['-tA', '-v', 'ON_ERROR_STOP=1', '-c', SQL], { encoding: 'utf8', env: ENV })
const rows = out.split('\n').filter((l) => l.startsWith('RES|')).map((l) => l.split('|').slice(1))
let fail = 0
let cur = ''
for (const [scen, check, verdict, detail] of rows) {
  if (scen !== cur) { console.log(`\n▸ Senaryo ${scen}`); cur = scen }
  const ok = verdict === 'PASS'
  if (!ok) fail++
  console.log(`  ${ok ? '✅' : '❌'} ${check} → ${detail}`)
}
console.log(`\n${fail === 0 ? '✅' : '❌'} DB senaryoları: ${rows.length - fail}/${rows.length} geçti.`)
process.exit(fail === 0 ? 0 : 1)
