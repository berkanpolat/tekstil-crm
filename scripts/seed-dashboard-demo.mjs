// =====================================================================
// P7 — Gösterge paneli / rapor demo verisi (gerçekçi, dolu-durum testi için).
// İşaretler (temizleme): operations.client_reference='DEMO7', customers
// company_name 'D7 …', tasks title 'D7 …'. Tetikleyicilerle uyumlu
// (SLA=24s oto, open_files oto, quote_sync). Owner emp3 = Demo Yönetici
// (ui.test girişi) → çalışan paneli dolu görünür.
//   node scripts/seed-dashboard-demo.mjs         → üret
//   node scripts/seed-dashboard-demo.mjs --clean → temizle
// =====================================================================
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pass = process.env.PGPASSWORD ||
  readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith('SUPABASE_DB_PASSWORD='))?.split('=').slice(1).join('=').trim()
const ENV = { ...process.env, PGHOST: process.env.PGHOST || 'aws-0-eu-west-1.pooler.supabase.com',
  PGPORT: process.env.PGPORT || '5432', PGUSER: process.env.PGUSER || 'postgres.kkxvoxeqfsaqzklrtgrw',
  PGDATABASE: process.env.PGDATABASE || 'postgres', PGPASSWORD: pass }
const psql = (sql) => execFileSync('psql', ['-tA', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', env: ENV })

const EMP = ['5261d58d-52f5-4859-ba26-bcb0ace8f743', '5254676a-a748-47fc-8883-e941a1437735', '00000000-0000-0000-0000-0000000000f9']
const CAT = [132, 146, 156, 165]
const CH = [1, 2, 3, 4, 6]
const PROV = [34, 35, 6, 16, 42]
const LANDING = ['/kadin-tshirt', '/toptan-uretim', '/instagram-kampanya', null, null, '/fuar-2026']
const pick = (a, i) => a[i % a.length]

// ---------- CLEAN ----------
if (process.argv.includes('--clean')) {
  const sql = `
begin;
create temporary table _op on commit drop as select id from public.operations where client_reference like 'DEMO7-%';
delete from public.account_transactions where operation_id in (select id from _op);
delete from public.payments where operation_id in (select id from _op);
delete from public.order_items where order_id in (select id from public.orders where operation_id in (select id from _op));
delete from public.orders where operation_id in (select id from _op);
delete from public.quote_items where quote_id in (select id from public.quotes where operation_id in (select id from _op));
delete from public.quotes where operation_id in (select id from _op);
delete from public.samples where operation_id in (select id from _op);
delete from public.open_file_snoozes where open_file_id in (select id from public.open_files where operation_id in (select id from _op));
delete from public.open_files where operation_id in (select id from _op);
delete from public.operation_items where operation_id in (select id from _op);
delete from public.operation_catalog_items where operation_id in (select id from _op);
delete from public.documents where operation_id in (select id from _op);
delete from public.interactions where operation_id in (select id from _op);
delete from public.tasks where title like 'D7 %';
delete from public.event_log where entity_type='operation' and entity_id in (select id::text from _op);
delete from public.code_registry where entity_type='operation' and entity_id in (select id::text from _op);
delete from public.operations where client_reference like 'DEMO7-%';
delete from public.code_registry where entity_type='customer' and entity_id in (select id::text from public.customers where company_name like 'D7 %');
delete from public.customers where company_name like 'D7 %';
commit;
select 'temizlendi';`
  psql(sql)
  console.log('✅ DEMO7 verisi temizlendi.')
  process.exit(0)
}

// ---------- SEED ----------
const parts = ['begin;']
// 15 müşteri
const CUST = Array.from({ length: 15 }, (_, i) => `D7 ${['Aslan','Deniz','Ege','Ferah','Güneş','Hilal','Işık','Kaya','Lale','Mavi','Nar','Orkide','Pamuk','Rüzgar','Safir'][i]} Tekstil`)
parts.push(`insert into public.customers (status_id, company_name, city) values ${CUST.map((n, i) => `(1, '${n}', '${['İstanbul','İzmir','Ankara','Bursa','Antalya'][i % 5]}')`).join(',')};`)

// Operasyon profilleri
const ops = []
let n = 0
const add = (o) => { ops.push({ n: ++n, ...o }) }
// 8 sahipsiz (havuz) — SLA dolmuş (req 26-50s önce), teklif yok
for (let i = 0; i < 8; i++) add({ owner: null, reqH: 26 + i * 3, landing: pick(LANDING, i) })
// 5 cevap bekleyen 36s+ (owner emp, quote 40-55s önce, cevap yok)
for (let i = 0; i < 5; i++) add({ owner: pick(EMP, i), reqH: 60 + i * 4, quote: { ageH: 40 + i * 3, status: 'cevap_bekleniyor' } })
// 3 reddedilmiş, farklı sebep
for (let i = 0; i < 3; i++) add({ owner: pick(EMP, i), reqH: 120 + i * 24, quote: { ageH: 90, status: i === 2 ? 'olumsuz' : 'reddedildi', reason: i + 1 } })
// 2 kabul (numuneye geçildi)
for (let i = 0; i < 2; i++) add({ owner: EMP[0], reqH: 200 + i * 20, quote: { ageH: 150, status: 'numune_asamasina_gecildi' } })
// 3 numune (revizyon turları; sonuncu 3. tur) — siparis_onay + numune
add({ owner: EMP[0], reqH: 260, onay: true, sample: 1 })
add({ owner: EMP[1], reqH: 280, onay: true, sample: 1 })
add({ owner: EMP[2], reqH: 300, onay: true, sample: 3 })   // 3. tura kadar revize
// 2 sipariş — termine yaklaşmış, üretimde; biri geciken tahsilat
add({ owner: EMP[0], reqH: 400, onay: true, order: { promiseDays: 2, overdue: false } })
add({ owner: EMP[1], reqH: 500, onay: true, order: { promiseDays: 3, overdue: true } })
// 4 yaklaşan (sarı) — SLA ~2-4s kaldı, teklif yok
for (let i = 0; i < 4; i++) add({ owner: EMP[2], reqH: 20 + i, landing: pick(LANDING, i + 2) })
// 13 dağınık (30 güne yayılmış; emp'lere farklı dönüşümle)
for (let i = 0; i < 13; i++) {
  const owner = i < 6 ? EMP[0] : i < 10 ? EMP[1] : EMP[2]
  const reqH = Math.floor(Math.random() * 30 * 24) + 24
  // emp0 yüksek dönüşüm, emp2 düşük
  let quote = null
  if (i % 2 === 0) {
    const acc = owner === EMP[0] ? true : owner === EMP[1] ? i % 3 === 0 : false
    quote = { ageH: Math.floor(reqH / 2), status: acc ? 'numune_asamasina_gecildi' : 'reddedildi', reason: acc ? null : 1 }
  }
  add({ owner, reqH, quote, landing: pick(LANDING, i) })
}

// Operasyon insert'leri (title=DEMO7#n ile geri referans)
for (const o of ops) {
  const code = `TAS-D7${String(o.n).padStart(3, '0')}`
  const land = o.landing ? `'${o.landing}'` : 'null'
  parts.push(`insert into public.operations (code, client_reference, customer_id, owner_id, title, requested_at, category_id, channel_id, province_id, landing_source)
    select '${code}','DEMO7-${o.n}',(select id from public.customers where company_name='${pick(CUST, o.n)}'),${o.owner ? `'${o.owner}'` : 'null'},'DEMO7#${o.n}', now()-interval '${o.reqH} hours', ${pick(CAT, o.n)}, ${pick(CH, o.n)}, ${pick(PROV, o.n)}, ${land};`)
  if (o.onay) parts.push(`insert into public.documents (operation_id, document_type_id) select id,(select id from public.document_types where key='siparis_onay') from public.operations where title='DEMO7#${o.n}';`)
  if (o.quote) {
    const resp = o.quote.status === 'cevap_bekleniyor' ? 'null' : `now()-interval '${Math.max(1, o.quote.ageH - 20)} hours'`
    parts.push(`insert into public.quotes (operation_id, version, valid_until, tax_rate, currency, subtotal, total, status_id, created_by, created_at, responded_at, rejection_reason_id)
      select id, 1, now()+interval '7 days', 10, 'USD', ${1000 + o.n * 50}, ${(1000 + o.n * 50) * 1.1}, (select id from public.quote_statuses where key='${o.quote.status}'), ${o.owner ? `'${o.owner}'` : 'null'}, now()-interval '${o.quote.ageH} hours', ${resp}, ${o.quote.reason ?? 'null'} from public.operations where title='DEMO7#${o.n}';`)
  }
  if (o.sample) {
    // revision_round doğrudan set (seed hızı için; UI'de revise_sample turu artırır)
    const st = o.sample >= 3 ? 'revize_bekleniyor' : 'inceleniyor'
    parts.push(`insert into public.samples (operation_id, version, revision_round, status_id, created_at) select id, ${o.sample}, ${o.sample}, (select id from public.sample_statuses where key='${st}'), now()-interval '${o.reqH - 40} hours' from public.operations where title='DEMO7#${o.n}';`)
  }
  if (o.order) {
    parts.push(`insert into public.orders (operation_id, subtotal, tax_rate, total, currency, order_date, promised_delivery, status_id)
      select id, 8000, 0, 8000, 'USD', (now()-interval '${o.reqH - 48} hours')::date, (now()+interval '${o.order.promiseDays} days')::date, (select id from public.order_statuses where key='uretimde') from public.operations where title='DEMO7#${o.n}';`)
    // kısmi tahsilat → açık bakiye
    parts.push(`insert into public.payments (customer_id, operation_id, direction, kind, amount, currency, exchange_rate, usd_rate, paid_at)
      select customer_id, id, 'gelen','on_odeme', 3000, 'USD', 47, 47, now()-interval '20 days' from public.operations where title='DEMO7#${o.n}';`)
    if (o.order.overdue) {
      // Önce vade (trigger overdue'yu sıfırlar), sonra AYRI statement'te overdue işareti
      parts.push(`update public.orders set balance_due_date=(now()-interval '5 days')::date where operation_id=(select id from public.operations where title='DEMO7#${o.n}');`)
      parts.push(`update public.orders set balance_overdue_at=now()-interval '5 days', balance_due_warned_at=now()-interval '6 days' where operation_id=(select id from public.operations where title='DEMO7#${o.n}');`)
    }
  }
}

// Demo Yönetici (emp3) için: birkaç açık dosyayı ertele (süresi dolmuş) → "Ertelediklerim"
parts.push(`update public.open_files set snooze_until=now()-interval '2 hours', snooze_count=2
  where assigned_to='${EMP[2]}' and closed_at is null and operation_id in (select id from public.operations where client_reference like 'DEMO7-%' and owner_id='${EMP[2]}') and id in (
    select id from public.open_files where assigned_to='${EMP[2]}' and closed_at is null order by id desc limit 2);`)
// Demo Yönetici için bugünkü görevler
parts.push(`insert into public.tasks (title, assigned_to, created_by, status_id, priority_id, due_at) values
  ('D7 Aslan Tekstil ile fiyat görüş', '${EMP[2]}','${EMP[2]}',(select id from task_statuses where key='baslandi'),(select id from task_priorities order by weight desc limit 1), now()),
  ('D7 Numune kargo takibi', '${EMP[2]}','${EMP[2]}',(select id from task_statuses where key='olusturuldu'),(select id from task_priorities order by weight limit 1), now()-interval '3 hours'),
  ('D7 Gecikmiş tahsilat araması', '${EMP[2]}','${EMP[2]}',(select id from task_statuses where key='olusturuldu'),(select id from task_priorities order by weight desc limit 1), now()+interval '2 hours');`)
// Etkileşimler (etkileşim/eğilim metriği için) — son 30 güne yayılmış
parts.push(`insert into public.interactions (entity_type, entity_id, operation_id, channel_id, outcome_id, direction, occurred_at, created_by)
  select 'customer', o.customer_id, o.id, (select id from interaction_channels limit 1), (select id from interaction_outcomes order by random() limit 1), 'outbound', o.requested_at + interval '2 hours', o.owner_id
  from public.operations o where o.client_reference like 'DEMO7-%' and o.owner_id is not null;`)
parts.push('commit;')
parts.push(`select 'op:'||count(*) from public.operations where client_reference like 'DEMO7-%';`)

const out = psql(parts.join('\n'))
console.log('✅ DEMO7 verisi üretildi.', out.trim())
