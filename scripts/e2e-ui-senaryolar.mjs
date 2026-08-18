// =====================================================================
// Bölüm 2 — Arayüz uçtan-uca (Playwright). Gerçek tarayıcı + gerçek giriş.
//   • Tüm ana rotaların gerçek oturumla render'ı + konsol hata avı
//   • Gerçek "Talep oluştur" akışı (E2E-UI müşterisini seçer, kayıt doğrular)
// Ön koşul: dev server (5173) çalışıyor + E2E-UI müşterisi seed'li.
// Çalıştırma: node scripts/e2e-ui-senaryolar.mjs
// =====================================================================
import { chromium } from '@playwright/test'

const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:5173'
import { UI_TEST as TEST } from './lib/ui-test-user.mjs'
const ROUTES = [
  ['/', 'Gösterge Paneli'], ['/musteriler', 'Müşteriler'], ['/potansiyeller', 'Potansiyeller'],
  ['/talepler', 'Talepler'], ['/teklifler', 'Teklifler'], ['/numuneler', 'Numuneler'],
  ['/siparisler', 'Siparişler'], ['/katalog', 'Katalog'], ['/belgeler', 'Belgeler'],
  ['/finans', 'Finans'], ['/gorevler', 'Görevler'], ['/hedefler', 'Hedefler'], ['/raporlar', 'Raporlar'],
]

let fail = 0
const log = (ok, msg, extra = '') => { if (!ok) fail++; console.log(`  ${ok ? '✅' : '❌'} ${msg}${extra ? ' → ' + extra : ''}`) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message))

try {
  // ---- Giriş ----
  console.log('\n▸ Giriş')
  await page.goto(`${BASE}/giris`, { waitUntil: 'networkidle' })
  await page.getByLabel('E-posta').fill(TEST.email)
  await page.getByLabel('Şifre').fill(TEST.password)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await page.waitForURL(`${BASE}/`, { timeout: 20000 })
  log(true, 'gerçek kullanıcıyla giriş başarılı')

  // ---- Senaryo I (arayüz) — tüm rotalar render + konsol hata avı ----
  console.log('\n▸ Rota smoke (render + konsol hatası)')
  for (const [path, heading] of ROUTES) {
    consoleErrors.length = 0
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    const hasHeading = await page.getByRole('heading', { name: heading, exact: false }).first().isVisible().catch(() => false)
    const bodyText = (await page.locator('body').innerText().catch(() => '')) || ''
    const crashed = bodyText.includes('Bir hata oluştu') || bodyText.trim().length < 5
    const errs = consoleErrors.filter((e) => !/favicon|manifest|Download the React DevTools|ResizeObserver/i.test(e))
    log(hasHeading && !crashed && errs.length === 0, `${path} (${heading})`, errs.length ? `${errs.length} konsol hatası: ${errs[0].slice(0, 80)}` : (hasHeading ? 'render ✓' : 'başlık yok'))
  }

  // ---- Senaryo A(arayüz) — gerçek Talep oluştur ----
  console.log('\n▸ Talep oluştur (gerçek akış)')
  const title = 'E2E-UI Talep ' + Date.now().toString().slice(-6)
  await page.goto(`${BASE}/talepler`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Talep oluştur' }).first().click()
  await page.waitForTimeout(600)
  const dialog = page.getByRole('dialog')
  // müşteri seç (ilk combobox)
  await dialog.getByRole('combobox').first().click()
  await page.waitForTimeout(400)
  await page.getByPlaceholder('Ara…', { exact: true }).fill('E2E-UI')
  await page.waitForTimeout(600)
  await page.getByRole('option').first().click()
  // kanal seç (ikinci combobox — raporlar için zorunlu)
  await dialog.getByRole('combobox').nth(1).click()
  await page.waitForTimeout(300)
  await page.getByRole('option').first().click()
  await dialog.getByLabel('Proje başlığı').fill(title).catch(() => {})
  await dialog.getByRole('button', { name: 'Oluştur' }).click()
  const ok = await page.waitForURL(/\/talepler\/\d+/, { timeout: 20000 }).then(() => true).catch(() => false)
  log(ok, 'talep oluşturuldu → operasyon kartına yönlendi', ok ? page.url().split('/').pop() : 'yönlenmedi')
  // TAS kodu görünür mü
  if (ok) {
    const code = await page.getByText(/TAS-/).first().innerText().catch(() => '')
    log(/TAS-/.test(code), 'operasyon TAS kodu üretildi', code)
  }
} catch (e) {
  log(false, 'beklenmeyen hata', String(e).split('\n')[0])
} finally {
  await browser.close()
}

console.log(`\n${fail === 0 ? '✅' : '❌'} Arayüz senaryoları: ${fail} başarısız.`)
process.exit(fail === 0 ? 0 : 1)
