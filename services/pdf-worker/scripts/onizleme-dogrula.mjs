// Tarayıcıdaki önizleme köprüsü, sunucudaki renderPreview ile AYNI HTML'i mi üretiyor?
//
// Önizleme artık istemcide (public/belge-sablonu.html + lib/belgeOnizleme.ts) üretiliyor.
// Bu betik köprüyü gerçek Chromium'da, CRM'deki gibi sandbox="allow-scripts" iframe'inde
// çalıştırır ve çıktıyı orijinal şablonun sunucu tarafı çıktısıyla karşılaştırır.
// Eşleşme, "önizlemede gördüğün = PDF'te çıkan" güvencesinin testidir.
//
// Çalıştırma: node scripts/onizleme-dogrula.mjs
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { renderPreview } from '../../pdf-renderer/render.mjs'
import { SENARYOLAR, sayfaAc } from './senaryolar.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KOK = join(__dirname, '..')
const ORIJINAL = join(KOK, '..', 'pdf-renderer', 'templates', 'studio.html')
const ONIZLEME_SABLONU = join(KOK, '..', '..', 'public', 'belge-sablonu.html')

const { chromium } = await import(
  pathToFileURL(join(KOK, '..', 'pdf-renderer', 'node_modules', 'playwright', 'index.mjs')).href
)

// CRM'i taklit eden asgari sunucu: ana sayfa + şablon aynı origin'den servis edilir.
const sablonHtml = readFileSync(ONIZLEME_SABLONU, 'utf8')
const ANA_SAYFA = `<!doctype html><meta charset="utf-8"><title>önizleme testi</title>
<script>
  // lib/belgeOnizleme.ts ile AYNI protokol: gizli sandbox'lı iframe + postMessage.
  window.__yanitlar = {};
  const el = document.createElement('iframe');
  el.setAttribute('sandbox', 'allow-scripts');   // allow-same-origin YOK
  el.style.cssText = 'position:fixed;left:-10000px;width:900px;height:1300px;border:0';
  window.__hazir = new Promise((çöz) => {
    addEventListener('message', (ev) => {
      const m = ev.data || {};
      if (m.__belgeSablonuHazir) çöz(true);
      if (m.__belgeOnizlemeYanit) window.__yanitlar[m.id] = m;
    });
  });
  el.src = '/belge-sablonu.html';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(el));
  window.__iste = (id, template, data, language) => {
    el.contentWindow.postMessage({ __belgeOnizleme: true, id, template, data, language }, '*');
  };
</script>`

const sunucu = createServer((req, res) => {
  if (req.url === '/belge-sablonu.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    return res.end(sablonHtml)
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(ANA_SAYFA)
})
await new Promise((r) => sunucu.listen(0, '127.0.0.1', r))
const port = sunucu.address().port

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })

// Referans: orijinal şablon, sunucu tarafı renderPreview.
const sayfaOrijinal = await sayfaAc(browser, ORIJINAL, false)

// Deney: CRM'deki gibi tarayıcı köprüsü.
const sayfa = await browser.newPage()
const konsolHatalari = []
sayfa.on('pageerror', (e) => konsolHatalari.push(String(e.message || e)))
await sayfa.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' })
await sayfa.waitForFunction('window.__hazir !== undefined')
await sayfa.evaluate('window.__hazir')
console.log('Önizleme şablonu sandbox\'lı iframe\'de yüklendi (opak origin).\n')

let hata = 0
for (const [i, s] of SENARYOLAR.entries()) {
  const beklenen = await renderPreview(sayfaOrijinal, s)
  const gelen = await sayfa.evaluate(
    async ([id, template, data, language]) => {
      window.__iste(id, template, data, language)
      for (let bekle = 0; bekle < 300; bekle++) {
        if (window.__yanitlar[id]) return window.__yanitlar[id]
        await new Promise((r) => setTimeout(r, 50))
      }
      return { hata: 'zaman aşımı' }
    },
    [i + 1, s.template, s.data, s.language],
  )

  if (gelen.hata) {
    hata++
    console.log(`  ✗ ${s.ad.padEnd(20)} köprü hatası: ${gelen.hata}`)
  } else if (gelen.html === beklenen) {
    console.log(`  ✓ ${s.ad.padEnd(20)} sunucuyla birebir aynı (${gelen.html.length.toLocaleString('tr')} karakter)`)
  } else {
    hata++
    let k = 0
    while (k < gelen.html.length && k < beklenen.length && gelen.html[k] === beklenen[k]) k++
    console.log(`  ✗ ${s.ad.padEnd(20)} FARKLI (sunucu ${beklenen.length}, tarayıcı ${gelen.html.length})`)
    console.log(`      ilk fark ${k}. karakterde:`)
    console.log(`      sunucu  : ${JSON.stringify(beklenen.slice(Math.max(0, k - 40), k + 60))}`)
    console.log(`      tarayıcı: ${JSON.stringify(gelen.html.slice(Math.max(0, k - 40), k + 60))}`)
  }
}

if (konsolHatalari.length) {
  console.log('\n  ⚠ sayfa hataları:', konsolHatalari.slice(0, 3).join(' | '))
}

await browser.close()
sunucu.close()
console.log(hata === 0
  ? '\nSONUÇ: tarayıcıdaki önizleme sunucudakiyle AYNI — "gördüğün = çıkan" korunuyor.'
  : `\nSONUÇ: ${hata} senaryo uyuşmadı.`)
process.exit(hata === 0 ? 0 : 1)
