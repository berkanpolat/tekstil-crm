// Faz 3 yeniden yapılandırma — ARAYÜZDEN: yeni form (kanal/il/ilçe/ürün-geliş), teklif dosya→durum,
// sert kapı (elle teklif_iletildi engeli), kategori "yazınca eklenir".
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:5173'
const OUT = 'docs/assets/faz-3/rework'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
const TEST = { email: 'ui.test@tekstilas.com', password: 'TestPass1!', id: '00000000-0000-0000-0000-0000000000f9' }
const sql = (s) => execFileSync('psql', [PGURL, '-qtAc', s], { encoding: 'utf8' }).trim()
const ok = (l, c) => console.log(`  ${c ? '✓' : '✗ HATA'} ${l}`)
mkdirSync(OUT, { recursive: true })

// Sert kapı DB testi: dosyasız elle teklif_iletildi → engel
const cust = sql(`select id from public.customers where deleted_at is null limit 1`)
const gateOp = sql(`insert into public.operations (customer_id, created_by) values (${cust},'${TEST.id}') returning id`)
let gateBlocked = false
try { execFileSync('psql', [PGURL, '-qtAc', `update public.operations set request_status_id=(select id from public.request_statuses where key='teklif_iletildi') where id=${gateOp}`], { encoding: 'utf8', stdio: 'pipe' }) }
catch { gateBlocked = true }
ok('Sert kapı: dosyasız elle teklif_iletildi engellendi', gateBlocked)
sql(`delete from public.operations where id=${gateOp}`)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1440, height: 980 } })
page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser error]', m.text()) })
await page.goto(`${BASE}/giris`, { waitUntil: 'networkidle' })
await page.getByLabel('E-posta').fill(TEST.email)
await page.getByLabel('Şifre').fill(TEST.password)
await page.getByRole('button', { name: 'Giriş yap' }).click()
await page.waitForURL(`${BASE}/`, { timeout: 15000 })

// 1) Yeni talep formu
await page.goto(`${BASE}/talepler`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Talep oluştur' }).first().click()
await page.waitForTimeout(600)
const combos = () => page.getByRole('dialog').getByRole('combobox')
// Müşteri
await combos().nth(0).click(); await page.waitForTimeout(300)
await page.getByPlaceholder('Ara…', { exact: true }).fill('a'); await page.waitForTimeout(400)
await page.getByRole('option').first().click()
// Kanal (nth1)
await combos().nth(1).click(); await page.waitForTimeout(300)
await page.getByRole('option', { name: 'WhatsApp' }).click()
// İl (nth2)
await combos().nth(2).click(); await page.waitForTimeout(300)
await page.getByPlaceholder('Ara…', { exact: true }).fill('İstan'); await page.waitForTimeout(300)
await page.getByRole('option').first().click()
// İlçe serbest
await page.getByPlaceholder('İlçe (serbest)').fill('Bağcılar')
// Kategori (nth3) → Tür (nth4)
await combos().nth(3).click(); await page.waitForTimeout(300)
await page.getByRole('option', { name: 'Kadın Üst Giyim' }).click()
await combos().nth(4).click(); await page.waitForTimeout(300)
await page.getByRole('option', { name: 'Bluz' }).click()
await page.getByPlaceholder(/Adet, renk, kumaş/).fill('500 adet, ekru')
await page.screenshot({ path: `${OUT}/yeni-form.png` })
await page.getByRole('button', { name: 'Oluştur' }).click()
await page.waitForURL(/\/talepler\/\d+/, { timeout: 20000 })
const opId = page.url().match(/\/talepler\/(\d+)/)[1]
await page.waitForTimeout(1000)
const row = sql(`select
  (select key from public.request_channels where id=o.channel_id)||'|'||
  (select name from public.provinces where id=o.province_id)||'|'||o.district_normalized||'|'||o.product_source||'|'||
  (select key from public.request_statuses where id=o.request_status_id)||'|'||
  (select key from public.operation_stages where id=o.stage_id)
  from public.operations o where id=${opId}`)
console.log('DB talep:', row, '(beklenen whatsapp|İstanbul|bagcilar|gorsel_yukleme|teklif_bekliyor|teklif_bekliyor)')

// 2) Teklif dosyası yükle → durum teklif_iletildi (trigger)
await page.getByRole('button', { name: 'Teklif', exact: true }).click(); await page.waitForTimeout(500)
await page.locator('input[type=file]').first().setInputFiles({ name: 'teklif.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') })
await page.waitForTimeout(2000)
await page.screenshot({ path: `${OUT}/teklif-yuklendi.png` })
const afterUpload = sql(`select (select key from public.request_statuses where id=request_status_id)||'|'||(select key from public.operation_stages where id=stage_id) from public.operations where id=${opId}`)
ok('Teklif dosyası → durum teklif_iletildi + aşama ilerledi', afterUpload === 'teklif_iletildi|teklif_iletildi')
const qcount = sql(`select count(*) from public.quotes where operation_id=${opId} and quote_file_id is not null`)
ok('Teklif kaydı dosyayla oluştu', qcount === '1')

// 3) Kategori "yazınca eklenir" — ayrı bir talep formunda
await page.goto(`${BASE}/talepler`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Talep oluştur' }).first().click(); await page.waitForTimeout(600)
await combos().nth(3).click(); await page.waitForTimeout(300)
await page.getByRole('option', { name: 'Erkek Üst Giyim' }).click()
await page.getByPlaceholder(/Listede yok mu/).fill('Bisiklet Yaka Tişört')
await page.getByRole('button', { name: 'Ekle' }).click(); await page.waitForTimeout(1000)
const added = sql(`select count(*) from public.product_categories where label='Bisiklet Yaka Tişört'`)
ok('Yeni tür yazınca eklendi', added === '1')
await page.keyboard.press('Escape')

console.log('\nSONUÇ: yeni form alanları, teklif dosya→durum otomasyonu, sert kapı, kategori ekleme.')
await b.close()
