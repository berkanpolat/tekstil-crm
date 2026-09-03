// studio.html → HERMETİK şablon (Cloudflare Worker statik varlığı).
//
// Kaynak şablon (services/pdf-renderer/templates/studio.html) orijinal studyo
// uygulamasıdır ve dış kaynaklara bağlıdır: JsBarcode (cdnjs), supabase-js
// (jsdelivr), Google Fonts. Node servisinde bunlar `page.route()` ile filtreleniyordu.
//
// Worker'da istek kesme yerine ŞABLONU HERMETİK YAPIYORUZ:
//   1. JsBarcode gömülür (vendor/ — sürüm sabitli, çevrimdışı, yeniden üretilebilir).
//   2. supabase-js ve Google Fonts etiketleri silinir. Fontlar zaten @font-face ile
//      base64 gömülü; supabase yalnız sbBoot() içinde kullanılır, biz onu çağırmayız.
//   3. Sıkı CSP eklenir: default-src 'none' → belge oluştururken HİÇBİR ağ isteği
//      çıkamaz (TCMB proxy'leri, studyo Supabase projesi, metadata adresleri dahil).
//      script-src'de 'unsafe-eval' ZORUNLU: durum değişkenleri window.eval ile
//      yazılıyor (bkz. docs/specs/pdf-servisi-lexical-state.md).
//
// Çalıştırma: node scripts/sablon-hazirla.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KOK = join(__dirname, '..')
const KAYNAK = join(KOK, '..', 'pdf-renderer', 'templates', 'studio.html')
const HEDEF = join(KOK, 'public', 'studio.html')
const JSBARCODE = join(KOK, 'vendor', 'JsBarcode.all.min.js')

// Belge fonksiyonları + durum değişkenleri: hazırlama sonrası hâlâ var olmalı.
const BEKLENEN = ['tkQuoteDoc', 'siparisDocHTML', 'soDoc', 'numuneHTML', 'stickerHTML', 'reportDoc']

const CSP = "default-src 'none'; " +
  "script-src 'unsafe-inline' 'unsafe-eval'; " +   // gömülü betikler + window.eval
  "style-src 'unsafe-inline'; " +
  "font-src data:; " +                             // Inter/Sacramento base64 gömülü
  "img-src data: https:; " +                       // maliyet_belgesi görseli (data: veya https)
  "connect-src 'none'"                             // fetch/XHR tamamen kapalı

let html = readFileSync(KAYNAK, 'utf8')
const girisBoyut = html.length

// 1. Dış <script> ve <link> etiketlerini sök.
const sokulen = []
html = html.replace(/[ \t]*<script[^>]*\ssrc="https?:\/\/[^"]*"[^>]*>\s*<\/script>\s*\n?/gi, (m) => {
  sokulen.push(m.trim().slice(0, 90)); return ''
})
html = html.replace(/[ \t]*<link[^>]*href="https?:\/\/[^"]*"[^>]*>\s*\n?/gi, (m) => {
  sokulen.push(m.trim().slice(0, 90)); return ''
})

// 2. JsBarcode'u <head>'e göm + CSP'yi en başa koy.
const jsbarcode = readFileSync(JSBARCODE, 'utf8')
const enjekte = `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n` +
  `<script>/* JsBarcode 3.11.6 — gömülü (vendor/JsBarcode.all.min.js) */\n${jsbarcode}\n</script>\n`

// Şablonda <html>/<head> YOK — çıplak fragman, tarayıcı head'i kendisi kurar.
// Bu yüzden çıpa <meta charset>: karakter kümesi ilk sırada kalmalı, CSP hemen ardından
// gelmeli (CSP meta'sı ilk kaynak yüklemesinden ÖNCE ayrıştırılmazsa etkisiz olur).
const CHARSET = /<meta\s+charset=["']?utf-8["']?\s*>/i
if (!CHARSET.test(html)) throw new Error('<meta charset> bulunamadı — şablon yapısı beklenmedik.')
html = html.replace(CHARSET, (m) => m + '\n' + enjekte)

// 3. Doğrulama: belge fonksiyonları duruyor mu, dış kaynak kalmış mı?
const eksik = BEKLENEN.filter((f) => !new RegExp(`function\\s+${f}\\b|${f}\\s*=\\s*function|window\\.${f}\\s*=`).test(html))
if (eksik.length) throw new Error(`Belge fonksiyonları kayboldu: ${eksik.join(', ')}`)

const kalanDis = [...html.matchAll(/<(?:script|link)[^>]*(?:src|href)="(https?:\/\/[^"]*)"/gi)].map((m) => m[1])
if (kalanDis.length) throw new Error(`Hâlâ dış kaynak var:\n  ${kalanDis.join('\n  ')}`)

writeFileSync(HEDEF, html)

console.log('Hermetik şablon hazır:', HEDEF)
console.log(`  giriş  ${(girisBoyut / 1024).toFixed(0)} KB → çıkış ${(html.length / 1024).toFixed(0)} KB`)
console.log(`  sökülen dış kaynak (${sokulen.length}):`)
for (const s of sokulen) console.log('    -', s)
console.log('  JsBarcode gömüldü, CSP eklendi, belge fonksiyonları doğrulandı.')

// ==========================================================================
// 4. ÖNİZLEME ŞABLONU — CRM'in public/ dizinine (tarayıcıda çalışan sürüm).
//
// Canlı önizleme Worker'a GİTMEZ: editör her tuş vuruşunda önizleme ister ve
// bunu Browser Run'a bağlamak günlük tarayıcı bütçesini dakikalar içinde bitirirdi.
// Önizleme kullanıcının kendi tarayıcısında, sandbox'lı bir iframe'de üretilir —
// ağ maliyeti sıfır, gecikme sıfır.
//
// Belge kurma mantığı KOPYALANMAZ: render.mjs'teki sayfa fonksiyonları (buildDoc ve
// renderPreview'ın evaluate gövdesi) buradan çıkarılıp gömülür. Böylece PDF ile
// önizleme aynı kaynaktan beslenir; biri güncellenip diğeri unutulamaz.
// ==========================================================================
const ONIZLEME_HEDEF = join(KOK, '..', '..', 'public', 'belge-sablonu.html')
const render = readFileSync(join(KOK, '..', 'pdf-renderer', 'render.mjs'), 'utf8')

/** render.mjs'ten iki çıpa arasındaki kaynağı aynen alır. */
function kesitAl(kaynak, basla, bitir, ad) {
  const i = kaynak.indexOf(basla)
  if (i < 0) throw new Error(`${ad}: başlangıç çıpası bulunamadı (${basla})`)
  const j = kaynak.indexOf(bitir, i)
  if (j < 0) throw new Error(`${ad}: bitiş çıpası bulunamadı (${bitir})`)
  return kaynak.slice(i + basla.length, j)
}

// buildDoc'un evaluate geri çağrısı — parametre listesiyle birlikte tam ok fonksiyonu.
const belgeKurKaynak = kesitAl(
  render,
  'await page.evaluate(',
  ', { template, data, language, enPairs: EN_PAIRS })',
  'buildDoc',
).trim()

// renderPreview'ın evaluate geri çağrısı — stil + gövdeyi bağımsız HTML'e sarar.
const onizlemeKaynak = kesitAl(render, 'return page.evaluate(', '\n  })', 'renderPreview').trim() + '\n  }'

// EN_PAIRS derleme anında çözülür (i18n.mjs tek kaynak).
const { EN_PAIRS } = await import(pathToFileURL(join(KOK, '..', 'pdf-renderer', 'i18n.mjs')).href)

const ONIZLEME_EK = `
<script>
/* ==========================================================================
   ÖNİZLEME KÖPRÜSÜ — derleme anında üretildi (scripts/sablon-hazirla.mjs).
   ELLE DÜZENLEMEYİN; kaynak services/pdf-renderer/render.mjs.

   Bu sayfa CRM'de sandbox="allow-scripts" iframe'inde açılır. allow-same-origin
   VERİLMEZ → opak origin: şablona enjekte edilen bir betik CRM'in localStorage'ına
   (Supabase JWT'si) erişemez. İletişim yalnız postMessage ile.
   ========================================================================== */
(function () {
  var EN_PAIRS = ${JSON.stringify(EN_PAIRS)};
  var belgeKur = ${belgeKurKaynak};
  var onizlemeAl = ${onizlemeKaynak};

  addEventListener('message', function (ev) {
    var istek = ev.data || {};
    if (istek.__belgeOnizleme !== true) return;
    var yanit = { __belgeOnizlemeYanit: true, id: istek.id };
    try {
      belgeKur({ template: istek.template, data: istek.data, language: istek.language, enPairs: EN_PAIRS });
      yanit.html = onizlemeAl();
    } catch (e) {
      yanit.hata = String((e && e.message) || e);
    }
    // Opak origin'den ebeveyne dönüş: hedef '*' olmak zorunda (origin 'null').
    (ev.source || parent).postMessage(yanit, '*');
  });

  parent.postMessage({ __belgeSablonuHazir: true }, '*');
})();
</script>
`

writeFileSync(ONIZLEME_HEDEF, html + ONIZLEME_EK)
console.log('\nÖnizleme şablonu hazır:', ONIZLEME_HEDEF)
console.log(`  ${((html.length + ONIZLEME_EK.length) / 1024).toFixed(0)} KB · buildDoc ve renderPreview render.mjs'ten çıkarıldı`)
console.log(`  EN_PAIRS: ${EN_PAIRS.length} çeviri çifti gömüldü`)
