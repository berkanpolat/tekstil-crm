// Hermetik şablon (public/studio.html) ORİJİNALLE aynı belgeyi üretiyor mu?
//
// sablon-hazirla.mjs dış kaynakları söküp JsBarcode'u gömüyor ve CSP ekliyor.
// Bu betik ikisini de yerel Chromium'da yükleyip AYNI veriyle üretilen HTML'i
// karakter karakter karşılaştırır. Barkodlar JsBarcode ile SVG'ye çizildiği için
// HTML'in eşleşmesi gömülü kütüphanenin de çalıştığını kanıtlar.
//
// Çalıştırma: services/pdf-renderer içinden (playwright orada kurulu)
//   node ../pdf-worker/scripts/sablon-dogrula.mjs
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { renderPreview, renderDocument } from '../../pdf-renderer/render.mjs'
import { SENARYOLAR, sayfaAc } from './senaryolar.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

// playwright pdf-renderer'ın bağımlılığı; bu betik pdf-worker'da durduğu için
// normal çözümleme onu bulamaz → mutlak yolla alınır (pdf-worker'a playwright
// kurmamak bilinçli: Worker'ın üretim bağımlılığı değil, yalnız doğrulama aracı).
const { chromium } = await import(
  pathToFileURL(join(__dirname, '..', '..', 'pdf-renderer', 'node_modules', 'playwright', 'index.mjs')).href
)
const ORIJINAL = join(__dirname, '..', '..', 'pdf-renderer', 'templates', 'studio.html')
const HERMETIK = join(__dirname, '..', 'public', 'studio.html')

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })

console.log('Orijinal şablon yükleniyor (ağ: CDN açık)…')
const sayfaOrijinal = await sayfaAc(browser, ORIJINAL, false)
console.log('Hermetik şablon yükleniyor (ağ: TAMAMEN KAPALI)…')
const sayfaHermetik = await sayfaAc(browser, HERMETIK, true)
console.log('  → hermetik şablon ağsız açıldı, JsBarcode ve tüm belge fonksiyonları mevcut.\n')

let hata = 0
for (const s of SENARYOLAR) {
  const a = await renderPreview(sayfaOrijinal, s)
  const b = await renderPreview(sayfaHermetik, s)

  if (a === b) {
    console.log(`  ✓ ${s.ad.padEnd(20)} birebir aynı (${a.length.toLocaleString('tr')} karakter)`)
  } else {
    hata++
    // İlk farkın yerini göster — sessiz bozulmayı ayıklamak için.
    let i = 0
    while (i < a.length && i < b.length && a[i] === b[i]) i++
    console.log(`  ✗ ${s.ad.padEnd(20)} FARKLI (orijinal ${a.length}, hermetik ${b.length} karakter)`)
    console.log(`      ilk fark ${i}. karakterde:`)
    console.log(`      orijinal: …${JSON.stringify(a.slice(Math.max(0, i - 40), i + 60))}`)
    console.log(`      hermetik: …${JSON.stringify(b.slice(Math.max(0, i - 40), i + 60))}`)
  }
}

// PDF de gerçekten üretiliyor mu (yalnız hermetik taraf; boyut makul mü)?
const pdf = await renderDocument(sayfaHermetik, SENARYOLAR[0])
writeFileSync('/tmp/hermetik-teklif.pdf', pdf)
const pdfTamam = pdf.length > 50_000 && pdf.subarray(0, 5).toString() === '%PDF-'
console.log(`\n  ${pdfTamam ? '✓' : '✗'} hermetik PDF üretimi: ${(pdf.length / 1024).toFixed(0)} KB → /tmp/hermetik-teklif.pdf`)
if (!pdfTamam) hata++

await browser.close()
console.log(hata === 0 ? '\nSONUÇ: hermetik şablon orijinalle AYNI çıktıyı veriyor.' : `\nSONUÇ: ${hata} sorun var.`)
process.exit(hata === 0 ? 0 : 1)
