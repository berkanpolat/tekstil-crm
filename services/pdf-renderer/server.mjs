// Tekstil A.Ş. — Belge Motoru PDF servisi (P4A.1/P4A.2).
// Orijinal studyo şablonlarını (studio.html) SARMALAR: aynı tarayıcıda, aynı
// fonksiyonlarla üretir → tasarım birebir. Tek Chromium örneği sıcak tutulur.
import express from 'express'
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { renderDocument, renderPreview } from './render.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STUDIO = join(__dirname, 'templates', 'studio.html')
const SECRET = process.env.PDF_SECRET || ''
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
    if (url.startsWith('file:')) return route.continue()
    // Barkod ve supabase-js kütüphaneleri lazım (boot çökmesin); API/analitik çağrıları kesilir.
    if (url.includes('JsBarcode') || url.includes('jsbarcode') || url.includes('supabase-js@2')) return route.continue()
    return route.abort()
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
  if (SECRET && req.get('x-pdf-secret') !== SECRET) return res.status(401).json({ error: 'unauthorized' })
  const { template, data, language = 'tr' } = req.body || {}
  if (!template || !data) return res.status(400).json({ error: 'template ve data gerekli' })
  const t0 = Date.now()
  try {
    const page = await getPage()
    const pdf = await renderDocument(page, { template, data, language })
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
  if (SECRET && req.get('x-pdf-secret') !== SECRET) return res.status(401).json({ error: 'unauthorized' })
  const { template, data, language = 'tr' } = req.body || {}
  if (!template || !data) return res.status(400).json({ error: 'template ve data gerekli' })
  try {
    const html = await renderPreview(await getPage(), { template, data, language })
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
