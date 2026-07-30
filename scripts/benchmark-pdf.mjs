// P4A.6 — Belge motoru performans ölçümü. Beş belge tipi için soğuk/sıcak süre,
// fotolu/fotosuz (fiyat teklifi), 10 tekrar ort + en kötü. Hedef: 2 sn altı.
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { renderDocument } from '../services/pdf-renderer/render.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STUDIO = join(__dirname, '..', 'services', 'pdf-renderer', 'templates', 'studio.html')
const N = 10

// ~90 KB'lık gerçekçi ürün fotoğrafı temsili (geçerli JPEG data URL, tekrarlı gövde)
const PHOTO = 'data:image/jpeg;base64,' + Buffer.concat([
  Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCABkAGQBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6','base64'),
  Buffer.alloc(65000, 0x20),
]).toString('base64')

const CASES = [
  { key: 'fiyat_teklifi', label: 'Fiyat Teklifi (fotosuz)', data: () => ({ tkS: TK() }) },
  { key: 'fiyat_teklifi', label: 'Fiyat Teklifi (fotolu)', data: () => ({ tkS: { ...TK(), foto: PHOTO, fotoAR: 0.75 } }) },
  { key: 'siparis_onay', label: 'Sipariş Onay', data: () => ({ soS: SO() }) },
  { key: 'numune_etiketi', label: 'Numune Etiketi (4 adet)', data: () => ({ norder: { musteri: 'Deneme', urunkodu: 'TAS-A7K2M9' }, numuneler: [{ beden: 'S', renk: 'Lacivert' }, { beden: 'M', renk: 'Gri' }, { beden: 'L', renk: 'Siyah' }, { beden: 'XL', renk: 'Bej' }] }) },
  { key: 'siparis_formu', label: 'Sipariş Formu (3 sayfa)', data: () => ({ sip: SIP() }) },
  { key: 'koli_ustu', label: 'Koli Üstü (2 koli)', data: () => ({ order: { musteri: 'JOOQ', icerik: 'TAS-645312', adres: 'Kayseri', toplam: 2 }, koliler: [{ musteri: 'JOOQ', icerik: 'TAS-645312', adres: 'Kayseri', renk: 'Gri', beden: 'S-M-XL', adet: '9-10-5', agirlik: '10' }, { musteri: 'JOOQ', icerik: 'TAS-645312', adres: 'Kayseri', renk: 'Gri', beden: 'L-XL', adet: '11-10', agirlik: '10' }] }) },
]
const TK = () => ({ talep: 'PSCQWT', musteri: 'Nur Yıldız Tekstil A.Ş.', grup: 'Erkek Spor', tur: 'Eşofman', teslimat: '2026-08-03', para: 'TRY', kdv: '20', indirim: '0', gecerli: '7 Gün', odeme: '%50 Peşin', opts: [{ detay: 'Takım 200 Adet', kumas: 'İki İplik', adet: '200', birim: '250', oner: true }] })
const SO = () => ({ kod: 'PSCQWT', dtarih: '2026-07-27', musteri: 'Modaco', yetkili: 'İsmail', ftarih: '2026-07-27', grup: 'Unisex', tur: 'Eşofman', kumas: '%50 Pamuk', renk: 'Lacivert', beden: 'S:50 M:50', adet: '600', birim: '17 TL', termin: '10' })
const SIP = () => ({ no6: '343243', urunkodu: 'TAS-343243', tarih: '2026-07-27', toplam: '300', alici: { unvan: 'Modaco', vno: '321', vd: 'Yenibosna', adres: 'Bilge sk' }, grup: 'Bebek', tur: 'Takım', bsistem: 'Alfa', bedenler: ['XS', 'S', 'M', 'L', 'XL'], renkler: [{ ad: 'Beyaz', hex: '#fff', q: { S: 40, M: 60, L: 50 } }, { ad: 'Krem', hex: '#eed', q: { S: 30, M: 40, L: 30 } }], kompozisyon: '%50 Pamuk', bakim: ['wash30'], para: 'TRY' })

function stat(arr) { const s = [...arr].sort((a, b) => a - b); return { avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length), worst: Math.max(...arr), p50: s[Math.floor(s.length / 2)] } }

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 2 })
await page.route('**/*', (r) => { const u = r.request().url(); return (u.startsWith('file:') || u.includes('jsbarcode') || u.includes('JsBarcode') || u.includes('supabase-js@2')) ? r.continue() : r.abort() })
page.on('pageerror', () => {})
await page.goto('file://' + STUDIO, { waitUntil: 'domcontentloaded' })
await page.waitForFunction('typeof tkQuoteDoc==="function" && typeof JsBarcode!=="undefined"', { timeout: 30000 })

const rows = []
let firstCold = null
for (const c of CASES) {
  const times = []
  for (let i = 0; i < N + 1; i++) {
    const t0 = performance.now()
    const pdf = await renderDocument(page, { template: c.key, data: c.data(), language: 'tr' })
    const ms = performance.now() - t0
    if (i === 0) { if (firstCold === null) firstCold = ms; rows.push({ label: c.label, cold: Math.round(ms) }) }
    else times.push(ms)
    if (!pdf || pdf.length < 1000) throw new Error('boş PDF: ' + c.label)
  }
  const s = stat(times)
  rows[rows.length - 1].warmAvg = s.avg
  rows[rows.length - 1].worst = Math.round(s.worst)
}
await browser.close()

console.log('\n=== PDF üretim süreleri (ms) ===')
console.log('Belge'.padEnd(28) + 'İlk'.padStart(8) + 'Sıcak Ort'.padStart(12) + 'En Kötü'.padStart(10) + '   Hedef(2000)')
for (const r of rows) {
  const ok = r.worst <= 2000 && r.cold <= 2500
  console.log(r.label.padEnd(28) + String(r.cold).padStart(8) + String(r.warmAvg).padStart(12) + String(r.worst).padStart(10) + '   ' + (ok ? '✓' : '✗ AŞILDI'))
}
const anyOver = rows.some((r) => r.worst > 2000)
console.log('\nİlk render (servis açılışı, gerçek soğuk):', Math.round(firstCold), 'ms')
console.log(anyOver ? '⚠ 2 sn AŞAN VAR — tasarım gözden geçirilmeli.' : '✓ Tüm sıcak süreler 2 sn altında.')
