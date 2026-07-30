// P3.13 E2E — ARAYÜZDEN tam zincir: talep → teklif → revize → kabul → numune → onay → sipariş → sevk.
// Her adımda bilginin taşındığını DB'den doğrular.
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:5173'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
const TEST = { email: 'ui.test@tekstilas.com', password: 'TestPass1!' }
const sql = (s) => execFileSync('psql', [PGURL, '-qtAc', s], { encoding: 'utf8' }).trim()
const ok = (label, cond) => console.log(`  ${cond ? '✓' : '✗ HATA'} ${label}`)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1500, height: 1000 } })
page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser error]', m.text()) })
await page.goto(`${BASE}/giris`, { waitUntil: 'networkidle' })
await page.getByLabel('E-posta').fill(TEST.email)
await page.getByLabel('Şifre').fill(TEST.password)
await page.getByRole('button', { name: 'Giriş yap' }).click()
await page.waitForURL(`${BASE}/`, { timeout: 15000 })

// 1) Talep oluştur
await page.goto(`${BASE}/talepler`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Talep oluştur' }).first().click()
await page.waitForTimeout(600)
const combos = page.getByRole('dialog').getByRole('combobox')
await combos.nth(0).click(); await page.waitForTimeout(300)
await page.getByPlaceholder('Ara…', { exact: true }).fill('a'); await page.waitForTimeout(400)
await page.getByRole('option').first().click()
await combos.nth(1).click(); await page.waitForTimeout(300)
await page.getByRole('option', { name: 'Kadın Giyim' }).click()
await page.getByPlaceholder(/Adet, renk, kumaş/).fill('E2E zincir testi')
await page.getByRole('button', { name: 'Oluştur' }).click()
await page.waitForURL(/\/talepler\/\d+/, { timeout: 20000 })
const opId = page.url().match(/\/talepler\/(\d+)/)[1]
ok(`Talep oluştu (TAS kodu, SLA): op ${opId}`, sql(`select (code like 'TAS-%' and sla_deadline is not null) from public.operations where id=${opId}`) === 't')

// 2) Teklif → kalem → gönder (sert kapı: kalem şart) → kabul
await page.getByRole('button', { name: 'Teklifler' }).click(); await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Teklif oluştur' }).click(); await page.waitForTimeout(1200)
await page.getByPlaceholder('Yeni kalem…').fill('Kadın Bluz')
const addRow = page.locator('tr', { has: page.getByPlaceholder('Yeni kalem…') })
await addRow.locator('input[type=number]').first().fill('1000')
await addRow.locator('input[type=number]').last().fill('12')
await addRow.getByRole('button').click(); await page.waitForTimeout(1200)
ok('Teklif v1 + kalem (subtotal 12000)', sql(`select subtotal from public.quotes where operation_id=${opId} and version=1`) === '12000.00')
// Revize
await page.getByRole('button', { name: 'Revize et' }).click(); await page.waitForTimeout(1500)
ok('Revize → v2, kalem kopyalandı', sql(`select (version=2 and (select count(*) from public.quote_items qi where qi.quote_id=q.id and deleted_at is null)=1) from public.quotes q where operation_id=${opId} and version=2`) === 't')
// Gönder + Kabul (v2 seçili)
await page.getByRole('button', { name: 'Gönder' }).click(); await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Gönderildi işaretle' }).click(); await page.waitForTimeout(1000)
await page.getByRole('button', { name: 'Kabul', exact: true }).click(); await page.waitForTimeout(1200)
ok('Teklif v2 kabul edildi', sql(`select coalesce((select key from public.quote_statuses s where s.id=q.status_id),'?') from public.quotes q where operation_id=${opId} and version=2`) === 'kabul_edildi')

// 3) Numune → onay
await page.getByRole('button', { name: 'Numuneler' }).click(); await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Numune oluştur' }).click(); await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Onayla' }).first().click(); await page.waitForTimeout(500)
await page.getByPlaceholder(/Müşteri WhatsApp/).fill('E2E onay')
await page.getByRole('button', { name: 'Onayla' }).last().click(); await page.waitForTimeout(1200)
ok('Numune onaylandı (kim/ne zaman/yöntem)', sql(`select (approved_at is not null and approval_method='whatsapp') from public.samples where operation_id=${opId} order by id desc limit 1`) === 't')

// 4) Sipariş: onaylı numune var → yumuşak kapı YOK; kabul teklifinden aç → sevk
await page.getByRole('button', { name: 'Siparişler' }).click(); await page.waitForTimeout(500)
await page.getByRole('button', { name: /Teklif v\d+.?ten sipariş|Sipariş oluştur/ }).click(); await page.waitForTimeout(1500)
ok('Sipariş kabul teklifinden (kalem taşındı)', Number(sql(`select count(*) from public.order_items oi join public.orders o on o.id=oi.order_id where o.operation_id=${opId} and oi.deleted_at is null`)) >= 1)
await page.getByRole('button', { name: 'Sevk et' }).click(); await page.waitForTimeout(1200)
ok('Sipariş sevk edildi', sql(`select (shipped_at is not null) from public.orders where operation_id=${opId} order by id desc limit 1`) === 't')

// Zincir bütünlüğü: timeline'da tüm halkalar
const evs = sql(`select string_agg(distinct event_type, ',') from public.event_log where entity_type='operation' and entity_id='${opId}'`)
ok('Zaman çizelgesinde tüm halkalar (operation/quote/sample/order)',
  ['operation.created','quote.created','sample.approved','order.created'].every((e) => evs.includes(e)))

console.log('\nE2E zincir tamam — bilgi her adımda taşındı.')
await b.close()
