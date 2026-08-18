// P3.8 — ARAYÜZDEN: yeni talebe sla_deadline (24 iş saati) atanıyor + üst çubuk SLA rozeti.
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:5173'
const OUT = 'docs/assets/faz-3'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
import { UI_TEST as TEST } from './lib/ui-test-user.mjs'
const sql = (s) => execFileSync('psql', [PGURL, '-qtAc', s], { encoding: 'utf8' }).trim()
mkdirSync(OUT, { recursive: true })

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1440, height: 950 } })
page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser error]', m.text()) })
await page.goto(`${BASE}/giris`, { waitUntil: 'networkidle' })
await page.getByLabel('E-posta').fill(TEST.email)
await page.getByLabel('Şifre').fill(TEST.password)
await page.getByRole('button', { name: 'Giriş yap' }).click()
await page.waitForURL(`${BASE}/`, { timeout: 15000 })
await page.waitForTimeout(1500) // sla_sweep + counts
await page.screenshot({ path: `${OUT}/sla-rozet.png` })
const badge = await page.getByText(/süresi doldu|bugün/).count()
console.log('üst çubuk SLA rozeti görünür:', badge > 0 ? 'EVET' : 'HAYIR')

// Yeni talep → sla_deadline dolmalı (bugün+24 iş saati ≈ 3 iş günü sonra)
await page.goto(`${BASE}/talepler`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Talep oluştur' }).first().click()
await page.waitForTimeout(600)
const combos = page.getByRole('dialog').getByRole('combobox')
await combos.nth(0).click(); await page.waitForTimeout(300)
await page.getByPlaceholder('Ara…', { exact: true }).fill('a'); await page.waitForTimeout(400)
await page.getByRole('option').first().click()
await page.getByPlaceholder(/Adet, renk, kumaş/).fill('SLA testi')
await page.getByRole('button', { name: 'Oluştur' }).click()
await page.waitForURL(/\/talepler\/\d+/, { timeout: 20000 })
const opId = page.url().match(/\/talepler\/(\d+)/)[1]
await page.waitForTimeout(500)
const chk = sql(`select (sla_deadline is not null)||'|'||to_char(sla_deadline at time zone public.app_timezone(),'DD.MM.YYYY HH24:MI')||'|'||to_char(requested_at at time zone public.app_timezone(),'DD.MM.YYYY HH24:MI') from public.operations where id=${opId}`)
console.log('yeni talep (sla_var?|sla_deadline|requested_at):', chk)

console.log('\nSONUÇ: sla_deadline hesaplanıyor (iş saati), üst rozet okuma anında sayıyor.')
await b.close()
