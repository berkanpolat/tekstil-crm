// Tekstil A.Ş. — Belge Motoru PDF servisi (P4A.1/P4A.2).
// Orijinal studyo şablonlarını (studio.html) SARMALAR: aynı tarayıcıda, aynı
// fonksiyonlarla üretir → tasarım birebir. Tek Chromium örneği sıcak tutulur.
import express from 'express'
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { timingSafeEqual } from 'node:crypto'
import { renderDocument, renderPreview } from './render.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STUDIO = join(__dirname, 'templates', 'studio.html')
// file:// erişimi yalnız bu dizinle sınırlı (bkz. page.route).
const SABLON_DIZINI = join(__dirname, 'templates')
// Dış kaynak yalnız bu hostlardan — tam eşleşme, alt-dize DEĞİL.
const IZINLI_CDN_HOSTLARI = new Set(['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com'])
const SECRET = process.env.PDF_SECRET || ''

// GÜVENLİK (SAST 1 Eyl 2026 — Kritik): kimlik denetimi `if (SECRET && ...)`
// kalıbındaydı; PDF_SECRET tanımlı DEĞİLSE koruma SESSİZCE KAPANIYORDU ve /render
// internete kimliksiz açılıyordu. Güvenli varsayılan tam tersidir: sır yoksa
// servis iş görmez. (Önyüz zaten x-pdf-secret göndermiyordu — yani pratikte
// koruma hiç devrede değildi.)
function yetkiKontrol(req, res) {
  if (!SECRET) {
    res.status(503).json({
      error: 'yapilandirma_eksik',
      detail: 'PDF_SECRET tanımlı değil. Servis kimliksiz çalışmaz; ortam değişkenini ayarlayın.',
    })
    return false
  }
  const gelen = req.get('x-pdf-secret') || ''
  // Sabit süreli karşılaştırma (zamanlama sızıntısını önler).
  const a = Buffer.from(gelen), b = Buffer.from(SECRET)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'unauthorized' })
    return false
  }
  return true
}
const PORT = Number(process.env.PORT || 4046)

// Beş belgenin durum değişkenleri. Bir kısmı `let` ile tanımlı → window'a düşmez;
// render.mjs bunlara window.eval ile (lexical bağlama) yazar. KIRILGAN: şablon
// bu isimleri değiştirir/kaldırırsa sessizce boş belge üretilir. Açılışta doğrulanır.
const STATE_VARS = ['tkS', 'sip', 'soS', 'norder', 'order']

let browser = null
let warmPage = null // sıcak sayfa: studio.html bir kez yüklenir, örnek tekrar başlatılmaz

async function boot() {
  browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  warmPage = await newStudioPage()
  console.log('[pdf] Chromium sıcak, studio.html yüklendi.')
}

/** studio.html'i yükleyen bir sayfa: dış API'ler (Supabase/TCMB/fontlar CDN) kesilir,
 *  yalnızca yerel dosya + JsBarcode/supabase-js kütüphaneleri geçer. */
async function newStudioPage() {
  const page = await browser.newPage({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 2 })
  await page.route('**/*', (route) => {
    const url = route.request().url()

    // GÜVENLİK (SAST 1 Eyl 2026 — Kritik, yerelde kanıtlandı):
    //
    // (a) `url.startsWith('file:')` TÜM yerel dosyaları geçiriyordu. Sayfa file://
    //     origin'inde çalıştığı için şablona enjekte edilen
    //     `<iframe src="file:///proc/self/environ">` render hostundaki her dosyayı
    //     PDF'e bastırabiliyordu — tüm ortam değişkenleri, yani tüm sırlar dahil.
    //     Artık yalnız şablon dizinindeki dosyalar geçer.
    //
    // (b) İzin listesi ALT-DİZE eşleşmesiydi: `http://169.254.169.254/?x=jsbarcode`
    //     filtreyi geçiyordu (bulut metadata SSRF'i). Artık tam host eşleşmesi.
    let u
    try { u = new URL(url) } catch { return route.abort() }

    if (u.protocol === 'file:') {
      const yol = decodeURIComponent(u.pathname)
      return yol.startsWith(SABLON_DIZINI) ? route.continue() : route.abort()
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return route.abort()
    if (!IZINLI_CDN_HOSTLARI.has(u.hostname)) return route.abort()
    return route.continue()
  })
  page.on('pageerror', () => {}) // uygulama boot'undaki ağ hataları görmezden gelinir
  await page.goto('file://' + STUDIO, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForFunction('typeof tkQuoteDoc==="function" && typeof siparisDocHTML==="function" && typeof soDoc==="function" && typeof numuneHTML==="function" && typeof stickerHTML==="function"', { timeout: 30000 })
  await page.waitForFunction('typeof JsBarcode!=="undefined"', { timeout: 30000 }).catch(() => {})

  // KORUMA: durum değişkenleri lexical bağlamada gerçekten erişilebilir mi? (bare-referans
  // henüz hiçbir setVar çalışmadan çağrılır — undeclared/renamed ise ReferenceError fırlar.)
  const missing = await page.evaluate((names) => {
    const bad = []
    for (const n of names) { try { window.eval('void ' + n) } catch { bad.push(n) } }
    return bad
  }, STATE_VARS)
  if (missing.length) {
    throw new Error(`Şablon durum değişkenleri erişilemiyor: ${missing.join(', ')}. ` +
      'studio.html güncellenmiş ve bu isimler değişmiş olabilir; render.mjs (window.eval) sessizce boş belge üretir. ' +
      'Bkz. docs/specs/pdf-servisi-lexical-state.md')
  }
  return page
}

async function getPage() {
  if (!warmPage || warmPage.isClosed()) warmPage = await newStudioPage()
  return warmPage
}

/**
 * GÜVENLİK (SAST 1 Eyl 2026): `warmPage` TÜM istekler arasında paylaşılıyordu.
 * Şablona enjekte edilen bir betik sayfada KALICI oluyor ve sonraki isteklerin
 * belgelerini (başka müşterilerin fiyatları, cari ekstreleri) okuyup
 * değiştirebiliyordu — kiracılar arası belge sızıntısı.
 *
 * Artık her render kendi sayfasında çalışır ve sonunda kapatılır. Chromium
 * örneği sıcak kaldığı için maliyet yalnız sayfa açılışıdır (~yüz ms), belge
 * üretimi seyrek olduğundan kabul edilebilir.
 */
async function izoleSayfaIle(fn) {
  const page = await newStudioPage()
  try { return await fn(page) } finally { await page.close().catch(() => {}) }
}

const app = express()
app.use(express.json({ limit: '12mb' }))

// CORS — dev'de tarayıcı doğrudan çağırır. Üretimde generate-document edge function çağırır.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.PDF_CORS_ORIGIN || '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-pdf-secret')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.get('/health', (_req, res) => res.json({ ok: true, warm: !!warmPage && !warmPage.isClosed() }))

app.post('/render', async (req, res) => {
  if (!yetkiKontrol(req, res)) return
  const { template, data, language = 'tr' } = req.body || {}
  if (!template || !data) return res.status(400).json({ error: 'template ve data gerekli' })
  const t0 = Date.now()
  try {
    const pdf = await izoleSayfaIle((page) => renderDocument(page, { template, data, language }))
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('X-Render-Ms', String(Date.now() - t0))
    res.send(pdf)
  } catch (err) {
    console.error('[pdf] render hatası:', err)
    res.status(500).json({ error: 'render_failed', detail: String(err?.message || err) })
  }
})

// Canlı önizleme — HTML döndürür (PDF üretmeden, hızlı). Editör yazarken çağırır.
app.post('/preview', async (req, res) => {
  if (!yetkiKontrol(req, res)) return
  const { template, data, language = 'tr' } = req.body || {}
  if (!template || !data) return res.status(400).json({ error: 'template ve data gerekli' })
  try {
    const html = await izoleSayfaIle((page) => renderPreview(page, { template, data, language }))
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  } catch (err) {
    console.error('[pdf] preview hatası:', err)
    res.status(500).json({ error: 'preview_failed', detail: String(err?.message || err) })
  }
})

// B1 — Döviz kuru (TCMB Döviz Satış). Sunucu tarafında çekilir (tarayıcı CORS'una takılmaz).
// Gün içinde önbelleğe alınır. Editör para birimi TRY değilse bunu okuyup belgeye işler.
let ratesCache = null // { day, data }
app.get('/rates', async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10)
    if (ratesCache && ratesCache.day === today) return res.json(ratesCache.data)
    const r = await fetch('https://www.tcmb.gov.tr/kurlar/today.xml', { signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw new Error('tcmb ' + r.status)
    const xml = await r.text()
    const pick = (code) => {
      const m = xml.match(new RegExp('<Currency[^>]*CurrencyCode="' + code + '"[\\s\\S]*?<ForexSelling>([\\d.]+)</ForexSelling>'))
      return m ? Number(m[1]) : null
    }
    const dateM = xml.match(/Tarih="([^"]+)"/)
    const data = { USD: pick('USD'), EUR: pick('EUR'), GBP: pick('GBP'), date: dateM ? dateM[1] : today, source: 'TCMB' }
    ratesCache = { day: today, data }
    res.json(data)
  } catch (err) {
    console.error('[pdf] rates hatası:', err?.message || err)
    res.status(502).json({ error: 'rates_unavailable' })
  }
})

// P5 düzeltme — GEÇMİŞ TARİHLİ kur (TCMB tarihli bülten). Ödeme günü kuru için.
// TCMB URL: /kurlar/YYYYMM/DDMMYYYY.xml. Hafta sonu/tatil → o gün bülten yok (404);
// en yakın ÖNCEKİ iş gününe (en çok 10 gün) yürünür. Bulunursa bültenin GERÇEK tarihi
// döner ("25.07 için 24.07 yayını kullanıldı" notu istemcide kurulur).
const histCache = new Map() // 'YYYY-MM-DD' → data
app.get('/rate-on-date', async (req, res) => {
  const q = String(req.query.date || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q)) return res.status(400).json({ error: 'date=YYYY-MM-DD gerekli' })
  if (histCache.has(q)) return res.json(histCache.get(q))
  const pick = (xml, code) => {
    const m = xml.match(new RegExp('<Currency[^>]*CurrencyCode="' + code + '"[\\s\\S]*?<ForexSelling>([\\d.]+)</ForexSelling>'))
    return m ? Number(m[1]) : null
  }
  try {
    const base = new Date(q + 'T12:00:00Z')
    for (let back = 0; back <= 10; back++) {
      const d = new Date(base.getTime() - back * 864e5)
      const dd = String(d.getUTCDate()).padStart(2, '0')
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
      const yyyy = d.getUTCFullYear()
      const url = `https://www.tcmb.gov.tr/kurlar/${yyyy}${mm}/${dd}${mm}${yyyy}.xml`
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (r.status === 404) continue
      if (!r.ok) throw new Error('tcmb ' + r.status)
      const xml = await r.text()
      const usd = pick(xml, 'USD')
      if (usd == null) continue
      const bulletinDate = `${yyyy}-${mm}-${dd}`
      const data = { found: true, date: q, bulletinDate, USD: usd, EUR: pick(xml, 'EUR'), GBP: pick(xml, 'GBP'), source: 'TCMB' }
      histCache.set(q, data)
      return res.json(data)
    }
    const miss = { found: false, date: q }
    histCache.set(q, miss)
    res.json(miss)
  } catch (err) {
    console.error('[pdf] rate-on-date hatası:', err?.message || err)
    res.status(502).json({ error: 'rate_unavailable' })
  }
})

boot().then(() => app.listen(PORT, () => console.log(`[pdf] hazır → http://localhost:${PORT}`)))
  .catch((e) => { console.error('[pdf] boot hatası', e); process.exit(1) })
