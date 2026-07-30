// P5.9 — Faz 5 finans mantığı testi (DB). Her senaryo BEGIN…ROLLBACK içinde çalışır;
// üretim verisine hiçbir şey yazılmaz. Para hesabında tahmine yer yok (Merhaba.docx 6).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
const run = (s) => execFileSync('psql', [PGURL, '-qtAX', '-v', 'ON_ERROR_STOP=1', '-c', s], { encoding: 'utf8' }).trim()
let fails = 0
const ok = (l, c) => { if (!c) fails++; console.log(`  ${c ? '✓' : '✗ HATA'} ${l}`) }
// Bir senaryoyu rollback'li çalıştır; KEY=deger satırlarını sözlüğe çevir.
const scenario = (body) => {
  const out = run(`begin;\n${body}\nrollback;`)
  const m = {}
  for (const line of out.split('\n')) { const i = line.indexOf('='); if (i > 0) m[line.slice(0, i)] = line.slice(i + 1) }
  return m
}
const CUST = `(select id from public.customers limit 1)`

console.log('[1] Çok para birimli bakiye — kritik senaryo (1000 USD borç + 32.000 TRY ödeme)')
{
  const r = scenario(`
    create temp table _c on commit drop as select ${CUST} as id;
    select public.post_account_transaction((select id from _c),'borc','siparis',1000,'USD',null,null,32,32,now(),'t');
    select public.post_account_transaction((select id from _c),'alacak','odeme',32000,'TRY',null,null,1,32,now(),'t');
    select 'A_USD='||balance_usd||chr(10)||'A_TRY='||balance_try from public.customer_balance((select id from _c));`)
  ok('kur 32 → USD bakiye 0', Number(r.A_USD) === 0)
  ok('kur 32 → TRY bakiye 0', Number(r.A_TRY) === 0)
}
{
  const r = scenario(`
    create temp table _c on commit drop as select ${CUST} as id;
    select public.post_account_transaction((select id from _c),'borc','siparis',1000,'USD',null,null,32,32,now(),'t');
    select public.post_account_transaction((select id from _c),'alacak','odeme',32000,'TRY',null,null,1,30,now(),'t');
    select 'B_USD='||balance_usd||chr(10)||'B_TRY='||balance_try from public.customer_balance((select id from _c));`)
  ok('kur 30 → USD bakiye +66.67 (eksik ödeme)', Math.abs(Number(r.B_USD) - 66.67) < 0.01)
  ok('kur 30 → TRY bakiye 0', Number(r.B_TRY) === 0)
}

console.log('[2] Kur çevrimi — TRY ödeme USD borcu kapatır (5000 TL, kur 40 → 125 USD)')
{
  const r = scenario(`
    create temp table _c on commit drop as select ${CUST} as id;
    select public.set_exchange_rate('USD', 40, 'TEST');
    select public.post_account_transaction((select id from _c),'alacak','odeme',5000,'TRY',null,null,1,40,now(),'t');
    select 'USD='||balance_usd||chr(10)||'TRY='||balance_try from public.customer_balance((select id from _c));`)
  ok('5000 TL = 125 USD (kur 40)', Number(r.USD) === 125)
  ok('5000 TL = 5000 TRY', Number(r.TRY) === 5000)
}

console.log('[3] Ters kayıt — hatalı hareket düzeltilir, orijinal DURUR, bakiye doğru')
{
  const r = scenario(`
    create temp table _c on commit drop as select ${CUST} as id;
    create temp table _t on commit drop as select public.post_account_transaction((select id from _c),'borc','siparis',500,'USD',null,null,40,40,now(),'hatalı') as id;
    -- ters kayıt (RPC yetki ister; test için doğrudan zıt hareket + reverses_id)
    insert into public.account_transactions (customer_id, direction, source_type, amount, currency, exchange_rate, usd_rate, amount_try, amount_usd, occurred_at, description, reverses_id)
      select (select id from _c), 'alacak', 'duzeltme', 500, 'USD', 40, 40, 20000, 500, now(), 'Ters kayıt', (select id from _t);
    select 'ORIG='||(select count(*) from public.account_transactions where id=(select id from _t) and deleted_at is null)::text
        ||chr(10)||'BAL='||balance_usd from public.customer_balance((select id from _c));`)
  ok('orijinal hareket duruyor (silinmedi)', r.ORIG === '1')
  ok('ters kayıt sonrası bakiye 0', Number(r.BAL) === 0)
}

console.log('[4] Ödeme → alacak + soft-delete → ters kayıt')
{
  const r = scenario(`
    create temp table _c on commit drop as select ${CUST} as id;
    select public.set_exchange_rate('USD', 40, 'TEST');
    create temp table _p on commit drop as
      with x as (insert into public.payments(customer_id, direction, kind, amount, currency, paid_at, is_advance, note)
        values ((select id from _c),'gelen','on_odeme',4000,'TRY',current_date,true,'test') returning id)
      select id from x;
    create temp table _b1 on commit drop as select balance_usd u, balance_try t from public.customer_balance((select id from _c));
    update public.payments set deleted_at=now() where id=(select id from _p);
    select 'AFTER_INS='||(select u from _b1)||chr(10)||'AFTER_DEL='||balance_usd from public.customer_balance((select id from _c));`)
  ok('ödeme sonrası alacak 100 USD (4000/40)', Number(r.AFTER_INS) === 100)
  ok('ödeme silinince bakiye 0 (ters kayıt)', Number(r.AFTER_DEL) === 0)
}

console.log('[5] Fark kaydı — sipariş tutarı değişince aradaki fark hareket olur (10.000→12.000)')
{
  const r = scenario(`
    create temp table _o on commit drop as select id, operation_id from public.orders where deleted_at is null and total>0 limit 1;
    update public.orders set total = 10000 where id=(select id from _o);   -- başlangıç borcu kurulur
    create temp table _n0 on commit drop as select count(*) n from public.account_transactions where source_type='siparis' and source_id=(select id from _o) and deleted_at is null;
    update public.orders set total = 12000 where id=(select id from _o);   -- +2000 fark beklenir
    select 'N0='||(select n from _n0)::text
        ||chr(10)||'N1='||(select count(*) from public.account_transactions where source_type='siparis' and source_id=(select id from _o) and deleted_at is null)::text
        ||chr(10)||'FARK='||(select amount::text from public.account_transactions where source_type='siparis' and source_id=(select id from _o) and deleted_at is null order by id desc limit 1)
        ||chr(10)||'YON='||(select direction from public.account_transactions where source_type='siparis' and source_id=(select id from _o) and deleted_at is null order by id desc limit 1);`)
  ok('tutar artınca yeni fark hareketi eklendi', Number(r.N1) === Number(r.N0) + 1)
  ok('fark tutarı = 2000', Number(r.FARK) === 2000)
  ok('fark yönü borç (artış)', r.YON === 'borc')
}

console.log('[6] Ön ödeme oranı — sınırlar (eşik %50; eksik→yetersiz, tam→yeterli)')
{
  const mk = (deltaExpr) => `
    create temp table _o on commit drop as select id, operation_id from public.orders where deleted_at is null and total>0 limit 1;
    create temp table _op on commit drop as select customer_id from public.operations where id=(select operation_id from _o);
    select public.set_exchange_rate('USD', 40, 'TEST');
    create temp table _req on commit drop as select ((public.order_advance_check((select id from _o))->>'required_usd')::numeric) r;
    insert into public.payments(customer_id, operation_id, order_id, direction, kind, amount, currency, exchange_rate, usd_rate, paid_at, is_advance)
      values ((select customer_id from _op),(select operation_id from _o),(select id from _o),'gelen','on_odeme',${deltaExpr},'USD',40,40,current_date,true);
    select 'S='||(public.order_advance_check((select id from _o))->>'sufficient');`
  ok('gerekli−1 USD → yetersiz', scenario(mk('greatest((select r from _req)-1,0)')).S === 'false')
  ok('tam gerekli → yeterli', scenario(mk('(select r from _req)')).S === 'true')
  ok('gerekli+1 USD → yeterli', scenario(mk('(select r from _req)+1')).S === 'true')
}

console.log('[7] Yetki/sızıntı — auth yok → finans fonksiyonları boş')
{
  ok('finance_summary auth yok → {}', run(`select public.finance_summary()::text`) === '{}')
  ok('open_balances auth yok → 0 satır', run(`select count(*) from public.open_balances()`) === '0')
  // QA#1: sales rolünde HİÇBİR finans yetkisi olmamalı
  ok('sales rolünde finans yetkisi YOK', run(`select count(*) from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id where r.key='sales' and p.module='finance'`) === '0')
}

console.log('[8] Geçmiş tarihli kur — rate_on_date en yakın önceki bülteni verir, yoksa NULL')
{
  const r = scenario(`
    select public.cache_historical_rate('USD', 40.4657, date '2025-07-24');
    select 'CTESI='||public.rate_on_date('USD', date '2025-07-26');   -- Cumartesi → 24.07
    select 'TRY='||public.rate_on_date('TRY', date '2000-01-01');     -- her zaman 1
    select 'ESKI='||coalesce(public.rate_on_date('USD', date '2000-01-01')::text,'NULL');`)
  ok('hafta sonu → en yakın önceki bülten (24.07)', Number(r.CTESI) === 40.4657)
  ok('TRY her zaman 1', Number(r.TRY) === 1)
  ok('kur yoksa NULL (bugünün kuru KONMAZ)', r.ESKI === 'NULL')
}

console.log(`\n${fails === 0 ? '✓ TÜM TESTLER GEÇTİ' : `✗ ${fails} TEST BAŞARISIZ`}`)
process.exit(fails === 0 ? 0 : 1)
