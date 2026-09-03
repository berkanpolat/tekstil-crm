// Tekstil A.Ş. — Belge Motoru (Cloudflare Worker + Browser Run).
//
// services/pdf-renderer/ (Node + Playwright) ile AYNI işi yapar; fark barındırmada:
// kendi sunucumuz yerine Cloudflare'in yönettiği Chromium. Belge kurma mantığı
// (belge.js) satır satır aynıdır — orijinal studyo fonksiyonları çağrılır, tasarım birebir.
//
// UÇLAR
//   POST /render         {template, data, language} → PDF bayt
//   GET  /rates          TCMB günlük döviz satış (gün boyu önbellekli)
//   GET  /rate-on-date   ?date=YYYY-MM-DD — geçmiş tarihli kur (en yakın önceki bülten)
//   GET  /health         durum
//
// ÖNİZLEME BİLEREK YOK. Editör her tuş vuruşunda önizleme ister; bunu Browser Run'a
// bağlamak günlük tarayıcı bütçesini (ücretsiz planda 10 dk) dakikalar içinde bitirirdi.
// Önizleme istemcide, sandbox'lı iframe'de üretilir — aynı şablon, ağ maliyeti sıfır.
//
// KİMLİK. Paylaşılan sır (x-pdf-secret) yerine kullanıcının Supabase oturumu doğrulanır:
// belgeyi kimin ürettiği belli olur, çıkarılan kullanıcı anında erişimini kaybeder ve
// önyüz derlemesine gömülecek bir sır kalmaz.
import puppeteer from '@cloudflare/puppeteer'
import { renderDocument } from './belge.js'
import STUDIO from '../public/studio.html'

// Beş belgenin durum değişkenleri. Bir kısmı `let` ile tanımlı → window'a düşmez;
// belge.js bunlara window.eval ile yazar. Şablon bu isimleri değiştirirse belge
// SESSİZCE boş üretilir — bu yüzden her render öncesi doğrulanır.
// Bkz. docs/specs/pdf-servisi-lexical-state.md
const STATE_VARS = ['tkS', 'sip', 'soS', 'norder', 'order']

const BELGE_FONKSIYONLARI =
  'typeof tkQuoteDoc==="function" && typeof siparisDocHTML==="function" && ' +
  'typeof soDoc==="function" && typeof numuneHTML==="function" && ' +
  'typeof stickerHTML==="function" && typeof JsBarcode!=="undefined"'

const gecerliSablon = (t) => typeof t === 'string' && /^[a-z_]{3,30}$/.test(t)

// ---------------------------------------------------------------- CORS

function corsBasliklari(env) {
  return {
    'access-control-allow-origin': env.CORS_ORIGIN || 'https://crm.tekstilas.com',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'origin',
  }
}

const json = (env, gövde, status = 200) =>
  new Response(JSON.stringify(gövde), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsBasliklari(env) },
  })

// ---------------------------------------------------------------- Kimlik

/**
 * Supabase erişim jetonunu doğrular. Jetonu yerelde çözmek yerine Supabase'e
 * soruyoruz: imza, süre ve İPTAL durumu tek adımda doğrulanır (yerel doğrulama
 * çıkarılmış kullanıcıyı jeton süresi dolana dek geçirmeye devam ederdi).
 */
async function kullaniciDogrula(request, env) {
  const auth = request.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) return null
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY tanımlı değil — servis kimliksiz çalışmaz.')
  }
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: auth, apikey: env.SUPABASE_ANON_KEY },
  })
  if (!r.ok) return null
  const u = await r.json()
  return u?.id ? u : null
}

// ---------------------------------------------------------------- TCMB kurları

const kurSec = (xml, code) => {
  const m = xml.match(
    new RegExp('<Currency[^>]*CurrencyCode="' + code + '"[\\s\\S]*?<ForexSelling>([\\d.]+)</ForexSelling>'),
  )
  return m ? Number(m[1]) : null
}

/** Günlük kur. Önbellek Cache API'de: Worker izolatları kısa ömürlü, bellekteki
 *  değişken sonraki isteğe kalmaz; TCMB'yi her belgede dövmemek için kalıcı olmalı. */
async function kurlar(env, ctx) {
  const bugun = new Date().toISOString().slice(0, 10)
  const anahtar = new Request(`https://kur.local/rates/${bugun}`)
  const onbellek = caches.default

  const vurus = await onbellek.match(anahtar)
  if (vurus) return new Response(vurus.body, { headers: { ...Object.fromEntries(vurus.headers), ...corsBasliklari(env) } })

  const r = await fetch('https://www.tcmb.gov.tr/kurlar/today.xml', { signal: AbortSignal.timeout(5000) })
  if (!r.ok) throw new Error('tcmb ' + r.status)
  const xml = await r.text()
  const dateM = xml.match(/Tarih="([^"]+)"/)
  const veri = {
    USD: kurSec(xml, 'USD'), EUR: kurSec(xml, 'EUR'), GBP: kurSec(xml, 'GBP'),
    date: dateM ? dateM[1] : bugun, source: 'TCMB',
  }
  // Gün sonuna kadar sakla (TCMB bülteni gün içinde değişmez).
  const saklanan = new Response(JSON.stringify(veri), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'max-age=86400' },
  })
  ctx.waitUntil(onbellek.put(anahtar, saklanan.clone()))
  return new Response(saklanan.body, {
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsBasliklari(env) },
  })
}

/** Geçmiş tarihli kur — ödeme günü kuru için. Hafta sonu/tatilde bülten yoktur (404);
 *  en yakın ÖNCEKİ iş gününe (en çok 10 gün) yürünür, bulunan bültenin gerçek tarihi döner. */
async function kurTarihli(env, ctx, q) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q)) return json(env, { error: 'date=YYYY-MM-DD gerekli' }, 400)

  const anahtar = new Request(`https://kur.local/rate-on-date/${q}`)
  const onbellek = caches.default
  const vurus = await onbellek.match(anahtar)
  if (vurus) return new Response(vurus.body, { headers: { 'content-type': 'application/json; charset=utf-8', ...corsBasliklari(env) } })

  const base = new Date(q + 'T12:00:00Z')
  let veri = { found: false, date: q }
  for (let back = 0; back <= 10; back++) {
    const d = new Date(base.getTime() - back * 864e5)
    const dd = String(d.getUTCDate()).padStart(2, '0')
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const yyyy = d.getUTCFullYear()
    const r = await fetch(`https://www.tcmb.gov.tr/kurlar/${yyyy}${mm}/${dd}${mm}${yyyy}.xml`, {
      signal: AbortSignal.timeout(5000),
    })
    if (r.status === 404) continue
    if (!r.ok) throw new Error('tcmb ' + r.status)
    const xml = await r.text()
    const usd = kurSec(xml, 'USD')
    if (usd == null) continue
    veri = {
      found: true, date: q, bulletinDate: `${yyyy}-${mm}-${dd}`,
      USD: usd, EUR: kurSec(xml, 'EUR'), GBP: kurSec(xml, 'GBP'), source: 'TCMB',
    }
    break
  }
  const saklanan = new Response(JSON.stringify(veri), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'max-age=604800' },
  })
  ctx.waitUntil(onbellek.put(anahtar, saklanan.clone()))
  return new Response(saklanan.body, {
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsBasliklari(env) },
  })
}

// ---------------------------------------------------------------- Render

async function belgeUret(env, { template, data, language }) {
  // Her istek KENDİ tarayıcısında çalışır ve sonunda kapatılır. Node servisinde
  // sıcak sayfa tüm istekler arasında paylaşılıyordu ve şablona enjekte edilen bir
  // betik sonraki belgeleri (başka müşterilerin fiyatları) okuyabiliyordu — SAST
  // 1 Eyl 2026 bulgusu. Burada izolasyon mimarinin kendisinden geliyor.
  const browser = await puppeteer.launch(env.BROWSER)
  try {
    const page = await browser.newPage()
    page.on('pageerror', () => {}) // studyo uygulamasının boot hataları belgeyi ilgilendirmez
    await page.setViewport({ width: 900, height: 1300, deviceScaleFactor: 2 })

    // Şablon HERMETİK (bkz. scripts/sablon-hazirla.mjs): JsBarcode gömülü, dış
    // <script>/<link> sökülü, CSP default-src 'none'. setContent ile veriliyor —
    // sayfa hiçbir ağ isteği yapamaz, bu yüzden istek kesmeye gerek kalmıyor.
    await page.setContent(STUDIO, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForFunction(BELGE_FONKSIYONLARI, { timeout: 30000 })

    // KORUMA: durum değişkenleri lexical bağlamada erişilebilir mi? Bare-referans
    // ile, hiçbir setVar çalışmadan ÖNCE sorulmalı — setVar bir kez çalışınca eksik
    // değişken için window global'i oluşur ve kontrol yanıltıcı biçimde geçer.
    const eksik = await page.evaluate((names) => {
      const bad = []
      for (const n of names) { try { window.eval('void ' + n) } catch { bad.push(n) } }
      return bad
    }, STATE_VARS)
    if (eksik.length) {
      throw new Error(
        `Şablon durum değişkenleri erişilemiyor: ${eksik.join(', ')}. ` +
        'studio.html güncellenmiş ve bu isimler değişmiş olabilir; belge.js (window.eval) ' +
        'sessizce BOŞ belge üretir. Bkz. docs/specs/pdf-servisi-lexical-state.md',
      )
    }

    return await renderDocument(page, { template, data, language })
  } finally {
    // Kapatılmayan oturum zaman aşımına (60 sn) kadar bütçe yakar — Cloudflare'in
    // kendi dokümanı bunu "beklenenden yüksek kullanımın en yaygın sebebi" sayıyor.
    await browser.close().catch(() => {})
  }
}

// ---------------------------------------------------------------- Yönlendirme

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const yol = url.pathname

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsBasliklari(env) })

    if (yol === '/health') {
      return json(env, { ok: true, servis: 'belge-motoru', calisma: 'cloudflare-browser-run' })
    }

    try {
      if (yol === '/rates' && request.method === 'GET') return await kurlar(env, ctx)
      if (yol === '/rate-on-date' && request.method === 'GET') {
        return await kurTarihli(env, ctx, String(url.searchParams.get('date') || ''))
      }

      if (yol === '/render' && request.method === 'POST') {
        const kullanici = await kullaniciDogrula(request, env)
        if (!kullanici) return json(env, { error: 'unauthorized' }, 401)

        const gövde = await request.json().catch(() => null)
        const { template, data, language = 'tr' } = gövde || {}
        if (!gecerliSablon(template) || !data || typeof data !== 'object') {
          return json(env, { error: 'template ve data gerekli' }, 400)
        }

        const t0 = Date.now()
        const pdf = await belgeUret(env, { template, data, language: language === 'en' ? 'en' : 'tr' })
        return new Response(pdf, {
          headers: {
            'content-type': 'application/pdf',
            'x-render-ms': String(Date.now() - t0),
            ...corsBasliklari(env),
          },
        })
      }

      return json(env, { error: 'not_found' }, 404)
    } catch (err) {
      const mesaj = String(err?.message || err)
      console.error('[belge] hata:', mesaj)

      // Günlük tarayıcı bütçesi dolduğunda Browser Run 429 döndürür. Bunu genel
      // 500'ün içinde kaybetmek yerine ayırıyoruz: arayüz kullanıcıya "yarın tekrar
      // deneyin ya da planı yükseltin" diyebilsin, biz de sebebi loglarda görelim.
      if (/429|browser time limit|too many requests/i.test(mesaj)) {
        return json(env, { error: 'kota_doldu', detail: 'Günlük belge üretim kotası doldu.' }, 429)
      }
      return json(env, { error: 'render_failed', detail: mesaj }, 500)
    }
  },
}
