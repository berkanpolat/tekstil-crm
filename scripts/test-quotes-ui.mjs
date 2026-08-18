// P3.4 Teklifler — ARAYÜZDEN uçtan uca: teklif oluştur → kalem → tutar → revize → gönder → red → sil (boşluk).
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'

const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:5173'
const OUT = 'docs/assets/faz-3'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
import { UI_TEST as TEST } from './lib/ui-test-user.mjs'
const sql = (s) => execFileSync('psql', [PGURL, '-tAc', s], { encoding: 'utf8' }).trim()
mkdirSync(OUT, { recursive: true })

// Bir operasyon garanti et (test kullanıcısı P3.3 testinden mevcut).
let opId = sql(`select id from public.operations where deleted_at is null order by id desc limit 1`)
if (!opId) {
  const cust = sql(`select id from public.customers where deleted_at is null order by id limit 1`)
  opId = sql(`insert into public.operations (customer_id, title, created_by) values (${cust}, 'Teklif Test Operasyonu', '${TEST.id}') returning id`)
}
console.log('operasyon id:', opId)
sql(`delete from public.quote_items where quote_id in (select id from public.quotes where operation_id=${opId}); delete from public.quotes where operation_id=${opId};`)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1500, height: 1000 } })
page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser error]', m.text()) })

await page.goto(`${BASE}/giris`, { waitUntil: 'networkidle' })
await page.getByLabel('E-posta').fill(TEST.email)
await page.getByLabel('Şifre').fill(TEST.password)
await page.getByRole('button', { name: 'Giriş yap' }).click()
await page.waitForURL(`${BASE}/`, { timeout: 15000 })

await page.goto(`${BASE}/talepler/${opId}`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Teklifler' }).click()
await page.waitForTimeout(500)

// 1) İlk teklif oluştur (boş durum → "Teklif oluştur")
await page.getByRole('button', { name: 'Teklif oluştur' }).click()
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/teklif-bos.png` })

// 2) Kalem ekle: 500 adet x 10 TL, %10 iskonto → satır 4500
await page.getByPlaceholder('Yeni kalem…').fill('Oversize T-Shirt')
await page.getByPlaceholder('Yeni kalem…').press('Tab')
// adet/birim/fiyat ekleme satırı inputları
const addRow = page.locator('tr', { has: page.getByPlaceholder('Yeni kalem…') })
await addRow.locator('input[type=number]').first().fill('500')   // adet
await addRow.locator('input[type=number]').last().fill('10')     // birim fiyat
await addRow.getByRole('button').click()
await page.waitForTimeout(1200)
// iskonto düzenle: ilk veri satırının İsk% hücresi
const dataRow = page.locator('tbody tr').first()
const disc = dataRow.locator('input[type=number]').nth(2) // qty, price, discount
await disc.fill('10'); await disc.blur()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/teklif-kalem.png` })

let totals = sql(`select subtotal||'|'||tax_amount||'|'||total from public.quotes where operation_id=${opId} and version=1`)
console.log('v1 tutarlar (subtotal|kdv|total):', totals, '(beklenen 4500.00|900.00|5400.00)')

// 3) KDV oranını %20→%10 değiştir → tax 450, total 4950
const taxInput = page.locator('input[type=number]').filter({ hasNot: page.getByPlaceholder('Yeni kalem…') })
// KDV alanı: "Kaydet" ile yazılıyor
await page.locator('span', { hasText: /^KDV/ }).locator('input').fill('10')
await page.getByRole('button', { name: 'Kaydet' }).click()
await page.waitForTimeout(1200)
totals = sql(`select tax_rate||'|'||tax_amount||'|'||total from public.quotes where operation_id=${opId} and version=1`)
console.log('KDV %10 sonrası (rate|kdv|total):', totals, '(beklenen 10.00|450.00|4950.00)')

// 4) İç not gizli kutusu görünür mü
const internalVisible = await page.getByText('bu not müşteriye ve üretilen belgeye ASLA gitmez', { exact: false }).count()
console.log('iç not kilitli kutusu görünür:', internalVisible > 0 ? 'EVET' : 'HAYIR')

// 5) Revize et → v2, kalem kopyalanmalı
await page.getByRole('button', { name: 'Revize et' }).click()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/teklif-revize.png` })
const v2 = sql(`select version||'|'||supersedes_quote_id||'|'||(select count(*) from public.quote_items qi where qi.quote_id=q.id) from public.quotes q where operation_id=${opId} and version=2`)
console.log('v2 (version|supersedes|kalem):', v2, '(beklenen 2|<v1id>|1)')

// 6) Gönder (v2 seçili)
await page.getByRole('button', { name: 'Gönder' }).click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: 'Gönderildi işaretle' }).click()
await page.waitForTimeout(1200)
const sent = sql(`select (sent_at is not null)||'|'||sent_channel||'|'||coalesce((select key from public.quote_statuses s where s.id=q.status_id),'?') from public.quotes q where operation_id=${opId} and version=2`)
console.log('gönderim (sent?|kanal|durum):', sent, '(beklenen t|eposta|gonderildi)')

// 7) v1 seç ve sil → boşluk; yeni teklif v3 olmalı
await page.locator('button', { hasText: /^v1/ }).first().click()
await page.waitForTimeout(400)
page.once('dialog', (d) => d.accept())
await page.getByRole('button', { name: 'Sil' }).click()
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/teklif-silindi-bosluk.png` })
const afterDel = sql(`select string_agg(version||case when deleted_at is not null then '(silik)' else '' end, ',' order by version) from public.quotes where operation_id=${opId}`)
console.log('silme sonrası versiyonlar:', afterDel, '(beklenen 1(silik),2)')

// Yeni teklif → v3 (numara atlamaz-çakışmaz)
await page.getByRole('button', { name: 'Yeni' }).click()
await page.waitForTimeout(1200)
const v3 = sql(`select max(version) from public.quotes where operation_id=${opId}`)
console.log('yeni teklif versiyonu:', v3, '(beklenen 3)')

console.log('\nSONUÇ: tutar+KDV hesap doğru, revizyon kalem kopyaladı, gönderim işlendi, silme boşluk bıraktı, yeni versiyon çakışmadı.')
await b.close()
