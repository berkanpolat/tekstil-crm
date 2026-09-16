// #2 doğrulama: Sipariş Onay Formu (soDoc) sayfalaması — kırpma olmamalı.
// soDoc sabit-alanlı bir formdur (değişken kalem listesi yok); bu yüzden içerik
// HACMİNİ değiştiren 3 senaryo (az / normal / çok-uzun) ile taşma testi yapılır.
// Her .so-sheet için: qxFitSheet sonrası .so-fit'in alt kenarı sayfayı aşıyor mu?
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STUDIO = join(__dirname, 'templates', 'studio.html')

const LONG = 'Karışım kumaş: %60 pamuk, %35 polyester, %5 elastan; yüksek gramaj, enzim yıkamalı, ön-çekmez apre, dijital baskı uyumlu, OEKO-TEX sertifikalı, çift dikiş, ribana yaka. '.repeat(6)

const scenarios = [
  { name: 'az (minimal)', soS: { kod: '123456', dtarih: '2026-09-16', musteri: 'Ada Tekstil', ftarih: '2026-09-16', grup: 'Kadın Giyim', tur: 'Bluz', adet: '500', birim: '12,50 USD', termin: '20' } },
  { name: 'normal (dolu)', soS: { kod: '223344', dtarih: '2026-09-16', musteri: 'Ness Casual A.Ş.', yetkili: 'Ayşe Yılmaz', ftarih: '2026-09-16', grup: 'Kadın Giyim', tur: 'Elbise', kumas: 'Keten %100', renk: 'Ekru / #F2E9DC', beden: 'S-M-L-XL (2-3-3-2)', adet: '1200', birim: '18,00 USD', termin: '25', sgAd: 'Mehmet Demir', sgUnvan: 'Üretim Md.', mgAd: 'Ayşe Yılmaz', mgUnvan: 'Satın Alma' } },
  { name: 'cok-uzun (stres)', soS: { kod: '999999', dtarih: '2026-09-16', musteri: 'Uzun İçerikli Marka Uluslararası Tekstil ve Konfeksiyon Ticaret Limited Şirketi', yetkili: 'Çok Uzun Yetkili Kişi Adı Soyadı', ftarih: '2026-09-16', grup: 'Kadın Giyim', tur: 'Kombinli Takım', kumas: LONG, renk: LONG, beden: 'XS-S-M-L-XL-XXL (1-2-3-3-2-1) dağılımı ' + LONG, adet: '15000', birim: '22,75 USD', termin: '35', sgAd: 'Mehmet Demir', sgUnvan: 'Üretim Müdürü', mgAd: 'Ayşe Yılmaz', mgUnvan: 'Satın Alma Direktörü' } },
]

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 2 })
await page.route('**/*', (route) => {
  const u = route.request().url()
  if (u.startsWith('file:') || u.includes('jsbarcode') || u.includes('JsBarcode') || u.includes('supabase-js@2')) return route.continue()
  return route.abort()
})
page.on('pageerror', (e) => { console.error('PAGEERROR:', e.message) })
await page.goto('file://' + STUDIO, { waitUntil: 'domcontentloaded' })
await page.waitForFunction('typeof soDoc==="function" && typeof qxFitSheet==="function"', { timeout: 30000 })

let failed = 0
for (const sc of scenarios) {
  const res = await page.evaluate((soSData) => {
    window.eval('soS = ' + JSON.stringify(soSData) + ';')
    // #print-root ekranda display:none → clientHeight 0. Görünür bir kaba bas ki
    // .so-sheet (height:1122px) gerçek yerleşim alsın.
    const host = document.createElement('div')
    host.style.cssText = 'position:absolute;left:0;top:0;width:794px'
    document.body.appendChild(host)
    host.innerHTML = window.soDoc()
    const sheets = [].slice.call(host.querySelectorAll('.so-sheet'))
    // Kırpma testi: qxFitSheet ile AYNI mantık. Transform'suz doğal içerik yüksekliği
    // (need) sayfanın iç yüksekliğini (avail) aşarsa, qxFitSheet en fazla 0.9'a küçültür;
    // need > avail/0.9 ise geri kalan KIRPILIR (overflow:hidden). Kırpılan px = need-avail/0.9.
    const report = sheets.map((sh, i) => {
      const fit = sh.querySelector('.so-fit')
      fit.style.transform = ''; fit.style.width = '' // doğal ölçü
      const cs = getComputedStyle(sh)
      const avail = sh.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0)
      const need = fit.scrollHeight
      const cropPx = Math.max(0, Math.round(need - avail / 0.9)) // 0.9 tabanlı ölçeklemeden sonra kalan taşma
      return { page: i + 1, need, avail, cropPx }
    })
    document.body.removeChild(host)
    return { pages: sheets.length, report }
  }, sc.soS)

  const worst = Math.max(...res.report.map((r) => r.cropPx))
  const ok = worst <= 2 // 2px tolerans (sub-piksel yuvarlama)
  if (!ok) failed++
  console.log(`${ok ? '✅' : '❌'} ${sc.name.padEnd(18)} → ${res.pages} sayfa · en kötü kırpma: ${worst}px`)
  res.report.forEach((r) => console.log(`     sayfa ${r.page}: need ${r.need} / avail ${r.avail}${r.cropPx > 2 ? ' → KIRPMA +' + r.cropPx + 'px' : ' ✓'}`))
}

// Görsel doğrulama için stres senaryosunun PDF'ini de üret.
const { renderDocument } = await import('./render.mjs')
const pdf = await renderDocument(page, { template: 'siparis_onay', data: { soS: scenarios[2].soS }, language: 'tr' })
writeFileSync('/tmp/soDoc-stres.pdf', pdf)
console.log('PDF (stres):', '/tmp/soDoc-stres.pdf', pdf.length, 'bayt')

await browser.close()
console.log(failed === 0 ? '\nTÜM SENARYOLAR GEÇTİ — kırpma yok.' : `\n${failed} senaryo BAŞARISIZ.`)
process.exit(failed === 0 ? 0 : 1)
