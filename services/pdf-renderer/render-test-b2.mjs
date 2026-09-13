// B2 doğrulama: OTOMATİK TEKLİF — ürün başına sayfa + marj kademeleri yan yana.
// Yerel render (DB YOK, sunucu YOK). 1/5/10 ürün → sayfa sayısı doğru mu, kırpma var mı?
// Ayrıca: bir kademeyi değiştirince belgeye yansıyor mu (marj_tiers CANLI, gömülü değil).
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { renderDocument, renderPreview } from './render.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STUDIO = join(__dirname, 'templates', 'studio.html')

// margin_tiers'ı temsil eden kademeler (Ayarlar → Fiyatlandırma'dan gelir).
const TIERS = [
  { min_quantity: 50, margin_percent: 40 },
  { min_quantity: 200, margin_percent: 30 },
  { min_quantity: 500, margin_percent: 25 },
]
const marginFor = (qty, tiers) => { let m = tiers[0].margin_percent; for (const t of [...tiers].sort((a, b) => a.min_quantity - b.min_quantity)) if (qty >= t.min_quantity) m = t.margin_percent; return m }

// buildQuoteProducts çıktısının JS aynası (şablon yalnız adet/birim/tutar okur).
function makeProduct(i, unitCostUsd, tiers) {
  const qtys = [...new Set(tiers.map((t) => t.min_quantity))].sort((a, b) => a - b)
  const missing = unitCostUsd == null
  const kademeler = qtys.map((adet) => {
    const marj = marginFor(adet, tiers)
    if (missing) return { adet, marj, birim: '', tutar: '', oner: false }
    const birim = unitCostUsd * (1 + marj / 100)
    return { adet, marj, birim: birim.toFixed(2), tutar: (birim * adet).toFixed(2), oner: adet === 200 }
  })
  return { urun: `Ürün ${i} — Klasik Gömlek`, kod: `GML-${String(i).padStart(3, '0')}`, kumas: 'Pera Keten', maliyetEksik: missing, kademeler }
}

function makeData(count, tiers, { withMissing = false } = {}) {
  const urunler = []
  for (let i = 1; i <= count; i++) {
    const cost = (withMissing && i === 2) ? null : 8 + i // 2. ürün maliyetsiz (kısmi eksik senaryosu)
    urunler.push(makeProduct(i, cost, tiers))
  }
  const tkS = {
    talep: '588892', musteri: 'Polat Çetiner Tekstil', grup: 'Kadın Giyim', tur: 'Gömlek',
    teslimat: '2026-10-01', para: 'USD', kdv: '10', indirim: '0', gecerli: '7 Gün',
    odeme: '%50 Peşin, %50 Sevk Öncesi', not: '', urunler,
  }
  return { tkS, rates: { USD: 41.5, EUR: null, GBP: null, date: '2026-09-13', source: 'TCMB', status: 'ok' } }
}

const pdfPageCount = (buf) => (Buffer.from(buf).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length
const sheetCount = (html) => (html.match(/class="qsheet"/g) || []).length

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 2 })
await page.route('**/*', (route) => {
  const u = route.request().url()
  if (u.startsWith('file:') || u.includes('jsbarcode') || u.includes('JsBarcode') || u.includes('supabase-js@2')) return route.continue()
  return route.abort()
})
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message))
await page.goto('file://' + STUDIO, { waitUntil: 'domcontentloaded' })
await page.waitForFunction('typeof tkQuoteDoc==="function"', { timeout: 30000 })

let ok = true
const check = (label, cond, extra = '') => { console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`); if (!cond) ok = false }

// 1) 1 / 5 / 10 ürün → sayfa sayısı = ürün sayısı, kırpma yok
for (const n of [1, 5, 10]) {
  const data = makeData(n, TIERS)
  const html = await renderPreview(page, { template: 'fiyat_teklifi', data, language: 'tr' })
  const pdf = await renderDocument(page, { template: 'fiyat_teklifi', data, language: 'tr' })
  writeFileSync(`/tmp/b2-teklif-${n}.pdf`, pdf)
  check(`${n} ürün → ${n} .qsheet`, sheetCount(html) === n, `sheet=${sheetCount(html)}`)
  check(`${n} ürün → PDF ${n} sayfa`, pdfPageCount(pdf) === n, `pdf sayfa=${pdfPageCount(pdf)}, ${pdf.length} bayt`)
}

// 2) Kısmi eksik maliyet → görünür "Maliyet girilmedi" + uyarı bandı, sessiz boşluk yok
{
  const data = makeData(3, TIERS, { withMissing: true })
  const html = await renderPreview(page, { template: 'fiyat_teklifi', data, language: 'tr' })
  check('kısmi eksik → "Maliyet girilmedi" görünür', html.includes('Maliyet girilmedi'))
  check('kısmi eksik → uyarı bandı (qwarn) var', html.includes('qwarn'))
}

// 3) margin_tiers CANLI: bir kademeyi değiştir → belgedeki fiyat değişir (gömülü değil)
{
  const tiersB = [
    { min_quantity: 50, margin_percent: 40 },
    { min_quantity: 200, margin_percent: 60 }, // 200 kademesi %30 → %60
    { min_quantity: 500, margin_percent: 25 },
  ]
  const htmlA = await renderPreview(page, { template: 'fiyat_teklifi', data: makeData(1, TIERS), language: 'tr' })
  const htmlB = await renderPreview(page, { template: 'fiyat_teklifi', data: makeData(1, tiersB), language: 'tr' })
  // ürün 1 maliyeti 9 USD → 200 adet: A %30 → 11.70 ; B %60 → 14.40
  check('kademe değişince 200-adet fiyatı yansır (A=11,70)', htmlA.includes('11,70'), 'A')
  check('kademe değişince 200-adet fiyatı yansır (B=14,40)', htmlB.includes('14,40'), 'B')
  const html4 = await renderPreview(page, { template: 'fiyat_teklifi', data: makeData(1, [...TIERS, { min_quantity: 1000, margin_percent: 20 }]), language: 'tr' })
  const tierCols = (html4.match(/class="qtier[ "]/g) || []).length
  check('4 kademe eklenince belge 4 kademe basar (dinamik)', tierCols === 4 && sheetCount(html4) === 1, `kademe=${tierCols}, sheet=${sheetCount(html4)}`)
}

await browser.close()
console.log(ok ? '\nTÜM KONTROLLER GEÇTİ' : '\nBAZI KONTROLLER BAŞARISIZ')
process.exit(ok ? 0 : 1)
