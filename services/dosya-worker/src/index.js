// Tekstil A.Ş. — Dosya Servisi (Cloudflare Worker + R2).
//
// UÇLAR
//   POST /oturum      Bearer jetonu doğrular → oturum çerezi bırakır
//   GET  /d/<yol>     Dosyayı verir. ?w=160|480 küçük resim, ?indir=<ad> indirme
//   PUT  /y?yol=<yol> Dosya yükler (çerez VEYA servis sırrı)
//   POST /s           Nesneleri siler (orijinal + iki küçük)
//
// Kova DIŞARIYA KAPALI: tek giriş burasıdır. Listeleme ucu BİLEREK YOKTUR.
import { jetonCoz } from './jwt.js'
import { cerezOku, cerezYaz, dosyaKaydiniAl } from './kimlik.js'

const IZINLI_MIME = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'text/csv', 'text/plain', 'application/zip',
])
const AZAMI_BAYT = 25 * 1024 * 1024
const BOYUTLAR = new Set(['160', '480'])

/**
 * İstemciden gelen yolun biçimi. `k/` öneki BİLEREK dışlanır: küçük resim
 * anahtarını yalnız Worker kurar, istemci doğrudan isteyemez.
 */
export function yolGecerli(yol) {
  if (typeof yol !== 'string' || !yol || yol.length > 200) return false
  if (yol.includes('..') || yol.includes('\\')) return false
  if (yol.startsWith('/') || yol.startsWith('k/')) return false
  return /^[a-zA-Z0-9_\-./]+$/.test(yol)
}

export function r2Anahtar(yol, genislik) {
  return BOYUTLAR.has(genislik) ? `k/${genislik}/${yol}.webp` : yol
}

/** Çerezden kimlik. Servis sırrı BURADA kabul edilmez — okuma insana özeldir. */
async function okuyucuDogrula(request, env) {
  const jeton = cerezOku(request)
  if (!jeton) return null
  const govde = await jetonCoz(jeton, env)
  return govde ? { jeton, kullaniciId: govde.sub } : null
}

async function dosyaVer(request, env, yol, url) {
  if (!yolGecerli(yol)) return json(request, env, { hata: 'yol geçersiz' }, 400)

  const kimlik = await okuyucuDogrula(request, env)
  if (!kimlik) return json(request, env, { hata: 'oturum yok' }, 401)

  const kayit = await dosyaKaydiniAl(kimlik.jeton, kimlik.kullaniciId, yol, env)
  if (!kayit) return json(request, env, { hata: 'bulunamadı' }, 404)

  const genislik = url.searchParams.get('w')
  let nesne
  try {
    nesne = await env.KOVA.get(r2Anahtar(yol, genislik), { onlyIf: request.headers })
    // Küçük resim yoksa orijinale düş: sayfa asla boş kalmasın.
    if (!nesne && BOYUTLAR.has(genislik)) {
      nesne = await env.KOVA.get(yol, { onlyIf: request.headers })
    }
  } catch {
    // R2 okuma arızası — saldırgan denetimli girdiyle (onlyIf başlıkları vb.)
    // tetiklenebilir; 500 yerine denetimli hata döneriz.
    return json(request, env, { hata: 'okuma başarısız' }, 502)
  }
  if (!nesne) return json(request, env, { hata: 'nesne yok' }, 404)

  const basliklar = new Headers(corsBasliklari(request, env))
  nesne.writeHttpMetadata(basliklar)
  basliklar.set('etag', nesne.httpEtag)
  // İçerik bu yolda ASLA değişmez (yol UUID taşır) → uzun ve değişmez önbellek.
  basliklar.set('cache-control', 'private, max-age=31536000, immutable')
  if (BOYUTLAR.has(genislik)) basliklar.set('content-type', 'image/webp')
  else if (kayit.mime_type) basliklar.set('content-type', kayit.mime_type)

  const indir = url.searchParams.get('indir')
  if (indir) {
    const ad = encodeURIComponent(indir).replace(/['()]/g, escape)
    basliklar.set('content-disposition', `attachment; filename*=UTF-8''${ad}`)
  }

  // onlyIf eşleşirse gövde yoktur → 304.
  if (!nesne.body) return new Response(null, { status: 304, headers: basliklar })
  return new Response(nesne.body, { status: 200, headers: basliklar })
}

const sirGecerli = (request, env) =>
  Boolean(env.SERVIS_SIRRI) && request.headers.get('x-servis-sirri') === env.SERVIS_SIRRI

async function dosyaYukle(request, env, url) {
  const yol = url.searchParams.get('yol') || ''
  if (!yolGecerli(yol) && !yol.startsWith('k/')) {
    return json(request, env, { hata: 'yol geçersiz' }, 400)
  }
  // Küçük resim anahtarı yalnız k/160/ veya k/480/ önekiyle ve geçerli bir
  // orijinal yolla yazılabilir.
  if (yol.startsWith('k/')) {
    const m = yol.match(/^k\/(160|480)\/(.+)\.webp$/)
    if (!m || !yolGecerli(m[2])) return json(request, env, { hata: 'yol geçersiz' }, 400)
  }

  const yetkili = sirGecerli(request, env) || (await okuyucuDogrula(request, env))
  if (!yetkili) return json(request, env, { hata: 'yetki yok' }, 401)

  const tip = (request.headers.get('content-type') || '').split(';')[0].trim()
  if (!IZINLI_MIME.has(tip)) return json(request, env, { hata: 'tip kabul edilmiyor' }, 415)

  const uzunluk = Number(request.headers.get('content-length') || 0)
  if (uzunluk > AZAMI_BAYT) return json(request, env, { hata: 'dosya çok büyük' }, 413)

  try {
    // request.body'yi (akış) doğrudan R2'ye vermek yerine arabelleğe alırız:
    // 25 MiB sınırı zaten üstte uygulandı, akışı test ortamında izole
    // depolama sınırları arasında taşımak kararsız davranışa yol açıyor.
    const govde = await request.arrayBuffer()
    await env.KOVA.put(yol, govde, { httpMetadata: { contentType: tip } })
  } catch {
    // R2 yazma arızası (ağ, kota, vb.) — saldırgan denetimli girdiyle
    // tetiklenebilir; 500 yerine denetimli hata döneriz.
    return json(request, env, { hata: 'yükleme başarısız' }, 502)
  }
  return json(request, env, { ok: true, yol }, 201)
}

async function dosyaSil(request, env) {
  if (!sirGecerli(request, env)) return json(request, env, { hata: 'yetki yok' }, 401)
  let govde
  try {
    govde = await request.json()
  } catch {
    return json(request, env, { hata: 'gövde okunamadı' }, 400)
  }
  const yollar = Array.isArray(govde?.yollar) ? govde.yollar.filter(yolGecerli) : []
  const anahtarlar = yollar.flatMap((y) => [y, `k/160/${y}.webp`, `k/480/${y}.webp`])
  if (anahtarlar.length) {
    try {
      await env.KOVA.delete(anahtarlar)
    } catch {
      // R2 silme arızası — saldırgan denetimli girdiyle tetiklenebilir,
      // 500 yerine denetimli hata döneriz.
      return json(request, env, { hata: 'silme başarısız' }, 502)
    }
  }
  return json(request, env, { ok: true, silinen: yollar.length })
}

function kokenler(env) {
  return [env.CORS_ORIGIN || 'https://crm.tekstilas.com', 'http://localhost:5173']
}

// Kimlik bilgisi taşıyan isteklerde joker köken YASAKTIR; kökeni yansıtırız.
function corsBasliklari(request, env) {
  const koken = request.headers.get('origin') || ''
  const izinli = kokenler(env).includes(koken)
  return {
    ...(izinli ? { 'access-control-allow-origin': koken } : {}),
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'authorization, content-type, x-servis-sirri',
    'access-control-allow-methods': 'GET, HEAD, PUT, POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'origin',
  }
}

const json = (request, env, govde, status = 200) =>
  new Response(JSON.stringify(govde), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsBasliklari(request, env) },
  })

async function oturumAc(request, env) {
  const auth = request.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) return json(request, env, { hata: 'jeton yok' }, 401)
  const govde = await jetonCoz(auth.slice(7), env)
  if (!govde) return json(request, env, { hata: 'jeton geçersiz' }, 401)
  const yanit = json(request, env, { ok: true, sonGecerlilik: govde.exp })
  yanit.headers.set('set-cookie', cerezYaz(auth.slice(7), govde.exp))
  return yanit
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsBasliklari(request, env) })
    }
    if (url.pathname === '/oturum' && request.method === 'POST') {
      return oturumAc(request, env)
    }
    if (url.pathname.startsWith('/d/') && (request.method === 'GET' || request.method === 'HEAD')) {
      let yol
      try {
        // Bozuk yüzde kodlaması (örn. %zz) decodeURIComponent'te URIError
        // fırlatır — saldırgan denetimli girdi, 500 yerine 400'e çeviririz.
        yol = decodeURIComponent(url.pathname.slice(3))
      } catch {
        return json(request, env, { hata: 'yol geçersiz' }, 400)
      }
      return dosyaVer(request, env, yol, url)
    }
    if (url.pathname === '/y' && request.method === 'PUT') {
      return dosyaYukle(request, env, url)
    }
    if (url.pathname === '/s' && request.method === 'POST') {
      return dosyaSil(request, env)
    }
    return json(request, env, { hata: 'bulunamadı' }, 404)
  },
}
