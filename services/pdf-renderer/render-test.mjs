// P4A.2 doğrulama: fiyat teklifini örnek veriyle üret, /tmp'e yaz.
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { renderDocument } from './render.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STUDIO = join(__dirname, 'templates', 'studio.html')

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 2 })
await page.route('**/*', (route) => {
  const u = route.request().url()
  if (u.startsWith('file:') || u.includes('jsbarcode') || u.includes('JsBarcode') || u.includes('supabase-js@2')) return route.continue()
  return route.abort()
})
page.on('pageerror', () => {})
await page.goto('file://' + STUDIO, { waitUntil: 'domcontentloaded' })
await page.waitForFunction('typeof tkQuoteDoc==="function"', { timeout: 30000 })

// Örnek fiyat teklifi verisi (ornekfiyatteklifi.pdf ile aynı içerik)
const tkS = {
  talep: '588892', musteri: 'Ness Casual', grup: 'Kadın Giyim', tur: 'Bluz',
  teslimat: '2026-08-01', para: 'USD', kdv: '10', indirim: '0', gecerli: '7 Gün',
  odeme: '%50 Peşin, %50 Sevk Öncesi', foto: '', fotoAR: 0,
  not: 'Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry’s standard dummy text ever since 1966, when designers at Letraset and James Mosley, the librarian at St Bride Printing Library in London, took a 1914 Cicero translation and scrambled it to make dummy text for Letraset’s Body Type sheets.',
  opts: [
    { detay: 'Takım 50 Adet', kumas: 'Keten', adet: '50', birim: '15', oner: false },
    { detay: 'Takım 200 Adet', kumas: 'keten', adet: '200', birim: '16', oner: true },
  ],
}
const rates = { USD: 47.5, EUR: null, GBP: null, date: '', source: 'manual', status: 'ok' }

const pdf = await renderDocument(page, { template: 'fiyat_teklifi', data: { tkS, rates }, language: 'tr' })
writeFileSync('/tmp/out-teklif.pdf', pdf)
console.log('yazıldı: /tmp/out-teklif.pdf', pdf.length, 'bayt')
await browser.close()
