// P3.3 revizyon — ARAYÜZDEN: sade form (foto + yeni müşteri + kategori/tür + not + TR tarih + oto sorumlu),
// auto-title, Atanmamış görünümü, mobil kart, kategori/tür ayarları.
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'

const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:5173'
const OUT = 'docs/assets/faz-3/p3-3-revamp'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
const TEST = { email: 'ui.test@tekstilas.com', password: 'TestPass1!', id: '00000000-0000-0000-0000-0000000000f9' }
const sql = (s) => execFileSync('psql', [PGURL, '-tAc', s], { encoding: 'utf8' }).trim()
mkdirSync(OUT, { recursive: true })

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1440, height: 950 } })
page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser error]', m.text()) })

await page.goto(`${BASE}/giris`, { waitUntil: 'networkidle' })
await page.getByLabel('E-posta').fill(TEST.email)
await page.getByLabel('Şifre').fill(TEST.password)
await page.getByRole('button', { name: 'Giriş yap' }).click()
await page.waitForURL(`${BASE}/`, { timeout: 15000 })

// === A) Kategori/Tür ayar sayfası — yeni tür ekle ===
await page.goto(`${BASE}/ayarlar/kategori-tur`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/A-ayarlar-kategori.png`, fullPage: true })
console.log('shot: A-ayarlar-kategori')

// === B) Sade talep formu ===
const uniqPhone = '0532' + String(Date.now()).slice(-7)
const newCompany = 'Revamp Test Tekstil ' + String(Date.now()).slice(-4)
await page.goto(`${BASE}/talepler`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Talep oluştur' }).first().click()
await page.waitForTimeout(600)

// Foto ekle (dropzone gizli input)
await page.locator('input[type=file]').first().setInputFiles({
  name: 'numune-foto.png', mimeType: 'image/png',
  buffer: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f8f0000000049454e44ae426082', 'hex'),
})
await page.waitForTimeout(400)

// Yeni müşteri
await page.getByRole('button', { name: 'Yeni', exact: true }).click()
await page.waitForTimeout(500)
await page.getByPlaceholder(/Ada Tekstil/).fill(newCompany)
await page.getByPlaceholder(/05xx/).fill(uniqPhone)
await page.getByRole('button', { name: 'Kaydet ve seç' }).click()
await page.waitForTimeout(1500)

// Kategori → Tür (dialog comboboxları: 0=müşteri,1=kategori,2=tür,3=sorumlu)
const combos = page.getByRole('dialog').getByRole('combobox')
await combos.nth(1).click()
await page.waitForTimeout(300)
await page.getByRole('option', { name: 'Kadın Giyim' }).click()
await page.waitForTimeout(300)
await combos.nth(2).click()
await page.waitForTimeout(300)
await page.getByRole('option', { name: 'Bluz' }).click()

// Not
await page.getByPlaceholder(/Adet, renk, kumaş/).fill('300 adet, ekru, %100 pamuk, ön baskı')
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/B-sade-form.png` })
console.log('shot: B-sade-form')

// Oluştur
await page.getByRole('button', { name: 'Oluştur' }).click()
await page.waitForURL(/\/talepler\/\d+/, { timeout: 20000 })
const opId = page.url().match(/\/talepler\/(\d+)/)[1]
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/C-kart-genel.png`, fullPage: true })

// DB doğrulama
const row = sql(`select o.title, (o.category_id is not null)||'|'||(o.type_id is not null) as cat_type,
  (o.owner_id='${TEST.id}') as owner_me,
  (select label from public.product_categories where id=o.category_id)||' / '||(select label from public.product_categories where id=o.type_id) as kt,
  (select count(*) from public.files where entity_type='operation' and entity_id=o.id::text) as dosya,
  (select company_name from public.customers where id=o.customer_id) as musteri
  from public.operations o where o.id=${opId}`)
console.log('DB talep:', row)
console.log('  (beklenen: "Kadın Giyim Bluz — <bugün>" | t|t | t(owner=ben) | Kadın Giyim / Bluz | dosya>=1 | ' + newCompany + ')')

// === C) Atanmamış hızlı görünüm ===
await page.goto(`${BASE}/talepler`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Atanmamış' }).click()
await page.waitForTimeout(1000)
const unassignedCount = sql(`select count(*) from public.operations where owner_id is null and deleted_at is null`)
await page.screenshot({ path: `${OUT}/D-atanmamis.png` })
console.log('shot: D-atanmamis | DB atanmamış sayısı:', unassignedCount)

// === D) Mobil kart düzeni (yatay kaydırma yok) ===
const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await m.goto(`${BASE}/giris`, { waitUntil: 'networkidle' })
await m.getByLabel('E-posta').fill(TEST.email)
await m.getByLabel('Şifre').fill(TEST.password)
await m.getByRole('button', { name: 'Giriş yap' }).click()
await m.waitForURL(`${BASE}/`, { timeout: 15000 })
await m.goto(`${BASE}/talepler`, { waitUntil: 'networkidle' })
await m.waitForTimeout(1000)
await m.screenshot({ path: `${OUT}/E-mobil-kart.png`, fullPage: true })
// yatay taşma kontrolü
const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
console.log('shot: E-mobil-kart | yatay taşma px:', overflow, '(0 olmalı)')

console.log('\nSONUÇ: sade form + yeni müşteri + kategori/tür + auto-title + oto sorumlu + foto; Atanmamış görünüm; mobil kart.')
await b.close()
