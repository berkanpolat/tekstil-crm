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
import { cerezOku, cerezYaz } from './kimlik.js'

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
    return json(request, env, { hata: 'bulunamadı' }, 404)
  },
}
