// P3.9-P3.11 — ARAYÜZDEN: operasyon ekranı (9 soru), iç/dış not, projeye özel iletişim, revizyon geçmişi.
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:5173'
const OUT = 'docs/assets/faz-3'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
import { UI_TEST as TEST } from './lib/ui-test-user.mjs'
const sql = (s) => execFileSync('psql', [PGURL, '-qtAc', s], { encoding: 'utf8' }).trim()
mkdirSync(OUT, { recursive: true })

// Zengin geçmişi olan bir operasyon: bir ürün kalemi ekle (revizyon için sonra değiştireceğiz)
const opId = sql(`select id from public.operations where deleted_at is null order by id desc limit 1`)
const custId = sql(`select customer_id from public.operations where id=${opId}`)
const itemId = sql(`insert into public.operation_items (operation_id, name, quantity) values (${opId},'Test Ürün',500) returning id`)
// Bir değişiklik yap → revizyon geçmişinde "adet 500 → 750" çıkmalı
sql(`update public.operation_items set quantity=750 where id=${itemId}`)
console.log('operasyon:', opId, '| müşteri:', custId, '| kalem:', itemId)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1500, height: 1000 } })
page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser error]', m.text()) })
await page.goto(`${BASE}/giris`, { waitUntil: 'networkidle' })
await page.getByLabel('E-posta').fill(TEST.email)
await page.getByLabel('Şifre').fill(TEST.password)
await page.getByRole('button', { name: 'Giriş yap' }).click()
await page.waitForURL(`${BASE}/`, { timeout: 15000 })

await page.goto(`${BASE}/talepler/${opId}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/operasyon-ekrani.png`, fullPage: true })
console.log('shot: operasyon-ekrani (özet paneli + risk + tıklanabilir aşama)')

// İç not
await page.getByRole('button', { name: 'Notlar' }).click()
await page.waitForTimeout(400)
await page.getByPlaceholder('Not ekle…').fill('Maliyet marjı %18 — pazarlıkta buradan in.')
// iç not varsayılan işaretli
await page.getByRole('button', { name: 'Ekle' }).click()
await page.waitForTimeout(1000)
const noteChk = sql(`select body||'|'||is_internal from public.notes where entity_type='operation' and entity_id=${opId} and deleted_at is null order by id desc limit 1`)
console.log('iç not (body|is_internal):', noteChk.slice(0,30)+'...', '(beklenen …|t)')

// Projeye özel iletişim
await page.getByRole('button', { name: 'İletişim' }).click()
await page.waitForTimeout(500)
await page.getByRole('combobox').first().click(); await page.waitForTimeout(300)
await page.getByRole('option').first().click()
await page.getByPlaceholder('Ne konuşuldu?').fill('Müşteri numuneyi beğendi, sipariş onayı verecek')
await page.getByRole('button', { name: 'Görüşme ekle' }).click()
await page.waitForTimeout(1200)
const intChk = sql(`select (operation_id=${opId})||'|'||(entity_type='customer') from public.interactions where operation_id=${opId} order by id desc limit 1`)
console.log('iletişim (op_bağlı?|müşteriye?):', intChk, '(beklenen t|t)')

// Revizyon geçmişi
await page.getByRole('button', { name: 'Değişiklik Geçmişi' }).click()
await page.waitForTimeout(1000)
await page.screenshot({ path: `${OUT}/revizyon-gecmisi.png` })
const revShown = await page.getByText(/adet:/).count()
console.log('revizyon "adet 500 → 750" görünür:', revShown > 0 ? 'EVET' : 'HAYIR')

// Zaman çizelgesi (operasyon olayları)
await page.getByRole('button', { name: 'Zaman Çizelgesi' }).click()
await page.waitForTimeout(1000)
await page.screenshot({ path: `${OUT}/operasyon-zaman.png` })
const tlShown = await page.getByText(/Talep oluşturuldu|Teklif|Sipariş|Numune/).count()
console.log('zaman çizelgesi operasyon olayları:', tlShown > 0 ? 'EVET' : 'HAYIR')

console.log('\nSONUÇ: operasyon ekranı (özet+risk+aşama), iç not, projeye özel iletişim, revizyon geçmişi, timeline.')
await b.close()
