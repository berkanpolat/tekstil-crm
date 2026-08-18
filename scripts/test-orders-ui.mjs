// P3.6 Siparişler — ARAYÜZDEN: kabul teklifinden sipariş (kalem kopya) → termin riski → askı → sevk → teslim.
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'

const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:5173'
const OUT = 'docs/assets/faz-3'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
import { UI_TEST as TEST } from './lib/ui-test-user.mjs'
const sql = (s) => execFileSync('psql', [PGURL, '-qtAc', s], { encoding: 'utf8' }).trim()
mkdirSync(OUT, { recursive: true })

const opId = sql(`select id from public.operations where deleted_at is null order by id desc limit 1`)
sql(`delete from public.order_items where order_id in (select id from public.orders where operation_id=${opId}); delete from public.orders where operation_id=${opId};`)
sql(`delete from public.quote_items where quote_id in (select id from public.quotes where operation_id=${opId}); delete from public.quotes where operation_id=${opId};`)
// Kabul edilmiş teklif + 2 kalem hazırla (sipariş bundan doğacak)
const qid = sql(`insert into public.quotes (operation_id, status_id, created_by) values (${opId}, (select id from public.quote_statuses where key='kabul_edildi'), '${TEST.id}') returning id`)
sql(`insert into public.quote_items (quote_id, name, quantity, unit_price) values (${qid}, 'Oversize T-Shirt', 1000, 8), (${qid}, 'Baskı', 1000, 2)`)
console.log('operasyon:', opId, '| kabul teklifi:', qid)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1500, height: 1000 } })
page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser error]', m.text()) })
await page.goto(`${BASE}/giris`, { waitUntil: 'networkidle' })
await page.getByLabel('E-posta').fill(TEST.email)
await page.getByLabel('Şifre').fill(TEST.password)
await page.getByRole('button', { name: 'Giriş yap' }).click()
await page.waitForURL(`${BASE}/`, { timeout: 15000 })

await page.goto(`${BASE}/talepler/${opId}`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Siparişler' }).click()
await page.waitForTimeout(600)

// 1) Kabul teklifinden sipariş oluştur → kalemler kopyalanır
await page.getByRole('button', { name: /Teklif v\d+.?ten sipariş/ }).click()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/siparis-genel.png` })
let chk = sql(`select (select count(*) from public.order_items oi join public.orders o on o.id=oi.order_id where o.operation_id=${opId})||'|'||(select total from public.orders where operation_id=${opId} limit 1)`)
console.log('kalem sayısı|total:', chk, '(beklenen 2|12000.00 → 10000 + KDV %20)')

// 2) Termin riski: söz verilen bugün+3, iç plan bugün+10 (plan > söz → uyarı)
const p1 = new Date(Date.now() + 3*86400000).toISOString().slice(0,10)
const p2 = new Date(Date.now() + 10*86400000).toISOString().slice(0,10)
// Termin tarihlerini DB'den set et, UI'nın risk uyarısını doğrula (söz+3 < plan+10).
sql(`update public.orders set promised_delivery='${p1}', planned_delivery='${p2}' where operation_id=${opId}`)
await page.reload({ waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Siparişler' }).click()
await page.waitForTimeout(1000)
await page.screenshot({ path: `${OUT}/siparis-termin-riski.png` })
const riskShown = await page.getByText(/gecikme riski|İç plan.*sonra/).count()
console.log('termin riski uyarısı görünür:', riskShown > 0 ? 'EVET' : 'HAYIR')

// 3) Askıya al
await page.getByRole('button', { name: 'Askıya al' }).click()
await page.waitForTimeout(400)
await page.getByPlaceholder(/Müşteri onayı/).fill('Kumaş tedariki gecikti')
await page.getByRole('button', { name: 'Askıya al' }).last().click()
await page.waitForTimeout(1200)
let st = sql(`select (held_at is not null)||'|'||coalesce((select key from public.order_statuses s where s.id=o.status_id),'?') from public.orders o where operation_id=${opId} limit 1`)
console.log('askı (held?|durum):', st, '(beklenen t|askiya_alindi)')

// 4) Askıdan al → sevk → teslim
await page.getByRole('button', { name: 'Askıdan al' }).click()
await page.waitForTimeout(1000)
await page.getByRole('button', { name: 'Sevk et' }).click()
await page.waitForTimeout(1000)
await page.getByRole('button', { name: 'Teslim edildi' }).click()
await page.waitForTimeout(1200)
st = sql(`select (shipped_at is not null)||'|'||(actual_delivery is not null)||'|'||coalesce((select key from public.order_statuses s where s.id=o.status_id),'?') from public.orders o where operation_id=${opId} limit 1`)
console.log('sevk/teslim (shipped?|delivered?|durum):', st, '(beklenen t|t|tamamlandi)')
await page.screenshot({ path: `${OUT}/siparis-teslim.png` })

console.log('\nSONUÇ: kabul teklifinden sipariş+kalem kopya, termin riski, askı→sevk→teslim akışı.')
await b.close()
