// P3.3 Talepler — gözden geçirme ekran görüntüleri: dolu liste, form, kart, mobil.
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'

const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:5173'
const OUT = 'docs/assets/faz-3/p3-3-review'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
import { UI_TEST as TEST } from './lib/ui-test-user.mjs'
const sql = (s) => execFileSync('psql', [PGURL, '-tAc', s], { encoding: 'utf8' }).trim()
mkdirSync(OUT, { recursive: true })

const b = await chromium.launch()

async function login(page) {
  await page.goto(`${BASE}/giris`, { waitUntil: 'networkidle' })
  await page.getByLabel('E-posta').fill(TEST.email)
  await page.getByLabel('Şifre').fill(TEST.password)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await page.waitForURL(`${BASE}/`, { timeout: 15000 })
}

// --- Masaüstü ---
const page = await b.newPage({ viewport: { width: 1440, height: 900 } })
await login(page)

// 1) Dolu liste
await page.goto(`${BASE}/talepler`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/01-liste-dolu.png`, fullPage: true })
console.log('shot: 01-liste-dolu')

// 2) Oluşturma formu (müşteri seçili, alanlar dolu)
await page.getByRole('button', { name: 'Talep oluştur' }).first().click()
await page.waitForTimeout(500)
const dialog = page.getByRole('dialog')
await dialog.getByRole('combobox').first().click()
await page.waitForTimeout(300)
await page.getByPlaceholder('Ara…', { exact: true }).fill('a')
await page.waitForTimeout(400)
await page.getByRole('option').first().click()
await page.getByLabel('Proje başlığı').fill('Kadın Trençkot Koleksiyonu 800 adet')
await page.getByLabel('Açıklama').fill('Bej + siyah, su itici kumaş, kemer detaylı.')
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/02-olusturma-formu.png` })
console.log('shot: 02-olusturma-formu')
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// 3) Kart detay — dolu bir talebi aç (id 4 = üretim aşaması, acil)
const opId = sql(`select id from public.operations where title like 'Kurumsal%' order by id desc limit 1`)
await page.goto(`${BASE}/talepler/${opId}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
await page.screenshot({ path: `${OUT}/03-kart-genel.png`, fullPage: true })
console.log('shot: 03-kart-genel (op', opId, ')')

// --- Mobil ---
const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await login(m)
await m.goto(`${BASE}/talepler`, { waitUntil: 'networkidle' })
await m.waitForTimeout(1000)
await m.screenshot({ path: `${OUT}/04-mobil-liste.png`, fullPage: true })
console.log('shot: 04-mobil-liste')
await m.goto(`${BASE}/talepler/${opId}`, { waitUntil: 'networkidle' })
await m.waitForTimeout(1000)
await m.screenshot({ path: `${OUT}/05-mobil-kart.png`, fullPage: true })
console.log('shot: 05-mobil-kart')

await b.close()
console.log('\nTüm görüntüler:', OUT)
