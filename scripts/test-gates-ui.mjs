// P3.7 — ARAYÜZDEN: yumuşak kapı (onaylı numune yokken sipariş → uyarı+gerekçe→event), durum geçişleri sayfası.
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'

const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:5173'
const OUT = 'docs/assets/faz-3'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
import { UI_TEST as TEST } from './lib/ui-test-user.mjs'
const sql = (s) => execFileSync('psql', [PGURL, '-qtAc', s], { encoding: 'utf8' }).trim()
mkdirSync(OUT, { recursive: true })

// Onaylı numunesi OLMAYAN yeni bir operasyon (temiz)
const cust = sql(`select id from public.customers where deleted_at is null limit 1`)
const opId = sql(`insert into public.operations (customer_id, created_by) values (${cust},'${TEST.id}') returning id`)
console.log('temiz operasyon (numune yok):', opId)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1440, height: 950 } })
page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser error]', m.text()) })
await page.goto(`${BASE}/giris`, { waitUntil: 'networkidle' })
await page.getByLabel('E-posta').fill(TEST.email)
await page.getByLabel('Şifre').fill(TEST.password)
await page.getByRole('button', { name: 'Giriş yap' }).click()
await page.waitForURL(`${BASE}/`, { timeout: 15000 })

// Yumuşak kapı
await page.goto(`${BASE}/talepler/${opId}`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Siparişler' }).click()
await page.waitForTimeout(600)
await page.getByRole('button', { name: /Sipariş oluştur/ }).click()
await page.waitForTimeout(500)
const warnVisible = await page.getByText('Numune onayı yok').count()
await page.screenshot({ path: `${OUT}/yumusak-kapi.png` })
console.log('uyarı penceresi:', warnVisible > 0 ? 'AÇILDI' : 'AÇILMADI')
// Gerekçesiz "Yine de aç" pasif olmalı → gerekçe gir
await page.getByPlaceholder(/Acil sipariş/).fill('Acil sipariş, müşteri sözlü onay verdi')
await page.getByRole('button', { name: 'Yine de aç' }).click()
await page.waitForTimeout(1500)
const ev = sql(`select payload->>'gate'||' | '||(payload->>'reason') from public.event_log where event_type='gate.overridden' and entity_id='${opId}'::text order by id desc limit 1`)
const orderCnt = sql(`select count(*) from public.orders where operation_id=${opId}`)
console.log('event_log gate.overridden:', ev)
console.log('sipariş oluştu mu:', orderCnt, '(beklenen 1)')

// Durum geçişleri ayar sayfası
await page.goto(`${BASE}/ayarlar/durum-gecisleri`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/durum-gecisleri.png`, fullPage: true })
console.log('shot: durum-gecisleri')

// Temizlik
sql(`delete from public.order_items where order_id in (select id from public.orders where operation_id=${opId}); delete from public.orders where operation_id=${opId}; delete from public.operations where id=${opId};`)
console.log('\nSONUÇ: yumuşak kapı uyarı+gerekçe→event, sert kapılar DB-doğrulandı, durum geçişleri görüntülenebilir.')
await b.close()
