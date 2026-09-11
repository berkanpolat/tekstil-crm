import { describe, it, expect, beforeAll } from 'vitest'
import { SELF, env } from 'cloudflare:test'
import { CEREZ_ADI } from '../src/kimlik.js'
import { yolGecerli, r2Anahtar, AZAMI_BAYT } from '../src/index.js'

// --- çerez tabanlı testler için sahte kimlik ---------------------------
// jwt.js JWKS'i env.SUPABASE_URL'den, kimlik.js dosya kaydını
// env.SUPABASE_URL + '/rest/v1/files'den çeker. İkisini de sahteleyip gerçek
// ağa hiç çıkmadan geçerli bir çerez üretiyoruz (bkz. test/jwt.test.js'teki
// aynı desen).
const b64url = (bayt) =>
  btoa(String.fromCharCode(...new Uint8Array(bayt)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

let ozelAnahtar, jwk
const KID = 'dosya-test-kid'
let filesKaydi = null // dosyaKaydiniAl'ın döneceği satır; test başına ayarlanır

async function jetonUret(govde) {
  const basChunk = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'ES256', kid: KID, typ: 'JWT' })))
  const govChunk = b64url(new TextEncoder().encode(JSON.stringify(govde)))
  const veri = new TextEncoder().encode(`${basChunk}.${govChunk}`)
  const imza = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, ozelAnahtar, veri)
  return `${basChunk}.${govChunk}.${b64url(imza)}`
}

async function gecerliCerez(sub = 'kullanici-1') {
  const jeton = await jetonUret({ sub, exp: Math.floor(Date.now() / 1000) + 3600 })
  return `${CEREZ_ADI}=${jeton}`
}

beforeAll(async () => {
  const cift = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  ozelAnahtar = cift.privateKey
  const disa = await crypto.subtle.exportKey('jwk', cift.publicKey)
  jwk = { kty: 'EC', crv: 'P-256', x: disa.x, y: disa.y, kid: KID, alg: 'ES256' }

  globalThis.fetch = async (girdi) => {
    const adres = typeof girdi === 'string' ? girdi : girdi.url
    if (adres.includes('/.well-known/jwks.json')) {
      return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'content-type': 'application/json' } })
    }
    if (adres.includes('/rest/v1/files')) {
      return new Response(JSON.stringify(filesKaydi ? [filesKaydi] : []), {
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('bulunamadı', { status: 404 })
  }
})

/** content-length göndermeden akan gerçek bayt sayısı bilinçli akışlar üretir. */
function buyukAkis(bayt) {
  return new ReadableStream({
    start(controller) {
      const parcaBoyutu = 1024 * 1024
      let kalan = bayt
      while (kalan > 0) {
        const boy = Math.min(parcaBoyutu, kalan)
        controller.enqueue(new Uint8Array(boy))
        kalan -= boy
      }
      controller.close()
    },
  })
}

describe('yolGecerli', () => {
  it('normal yolu kabul eder', () => {
    expect(yolGecerli('image/9f2c-ab.jpg')).toBe(true)
  })
  it('üst dizin kaçışını reddeder', () => {
    expect(yolGecerli('image/../gizli.jpg')).toBe(false)
  })
  it('ters bölüyü reddeder', () => {
    expect(yolGecerli('image\\gizli.jpg')).toBe(false)
  })
  it('boş yolu reddeder', () => {
    expect(yolGecerli('')).toBe(false)
  })
  it('200 karakterden uzunu reddeder', () => {
    expect(yolGecerli('a'.repeat(201))).toBe(false)
  })
  it('küçük resim önekini kullanıcıdan kabul etmez', () => {
    // k/ öneki YALNIZ Worker'ın kendi kurduğu anahtarda olur.
    expect(yolGecerli('k/160/image/a.jpg.webp')).toBe(false)
  })
})

describe('r2Anahtar', () => {
  it('genişlik yoksa orijinali verir', () => {
    expect(r2Anahtar('image/a.jpg', null)).toBe('image/a.jpg')
  })
  it('160 için küçük anahtarı kurar', () => {
    expect(r2Anahtar('image/a.jpg', '160')).toBe('k/160/image/a.jpg.webp')
  })
  it('480 için küçük anahtarı kurar', () => {
    expect(r2Anahtar('image/a.jpg', '480')).toBe('k/480/image/a.jpg.webp')
  })
  it('desteklenmeyen genişliği yok sayar', () => {
    expect(r2Anahtar('image/a.jpg', '999')).toBe('image/a.jpg')
  })
})

describe('GET /d', () => {
  it('çerezsiz isteği 401 verir', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/d/image/a.jpg')
    expect(r.status).toBe(401)
  })

  it('geçersiz çerezle 401 verir', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/d/image/a.jpg', {
      headers: { cookie: `${CEREZ_ADI}=bozuk.jeton.imza` },
    })
    expect(r.status).toBe(401)
  })

  it('yol kaçışını 400 ile reddeder', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/d/image/..%2Fgizli.jpg', {
      headers: { cookie: `${CEREZ_ADI}=bozuk.jeton.imza` },
    })
    expect(r.status).toBe(400)
  })

  it('bozuk yüzde kodlamasını (%zz) 400 ile reddeder', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/d/%zz', {
      headers: { cookie: `${CEREZ_ADI}=bozuk.jeton.imza` },
    })
    expect(r.status).toBe(400)
  })

  it('geçerli kimlik ve kayıtla var olan dosyayı 200 ile verir, güvenlik başlıklarıyla', async () => {
    filesKaydi = { mime_type: 'image/jpeg', original_name: 'foto.jpg' }
    await env.KOVA.put('image/basarili.jpg', new Uint8Array([9, 9, 9]))
    const r = await SELF.fetch('https://dosya.tekstilas.com/d/image/basarili.jpg', {
      headers: { cookie: await gecerliCerez() },
    })
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
    expect(r.headers.get('etag')).toBeTruthy()
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r.headers.get('content-security-policy')).toBe('sandbox')
    // Resim satır içi güvenli sayılır: indir istenmedi, zorla ek yapılmaz.
    expect(r.headers.get('content-disposition')).toBeNull()
    await r.arrayBuffer()
  })

  it('resim/PDF olmayan tipi indir istenmese de eke zorlar', async () => {
    filesKaydi = { mime_type: 'text/csv', original_name: 'liste.csv' }
    await env.KOVA.put('doc/liste.csv', new Uint8Array([1, 2, 3]))
    const r = await SELF.fetch('https://dosya.tekstilas.com/d/doc/liste.csv', {
      headers: { cookie: await gecerliCerez() },
    })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-disposition')).toMatch(/^attachment/)
    await r.arrayBuffer()
  })
})

describe('PUT /y — servis sırrı', () => {
  it('sırsız ve çerezsiz isteği 401 verir', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/y?yol=image/a.jpg', {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      body: new Uint8Array([1, 2, 3]),
    })
    expect(r.status).toBe(401)
  })

  it('yanlış sırrı reddeder', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/y?yol=image/a.jpg', {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg', 'x-servis-sirri': 'yanlis' },
      body: new Uint8Array([1, 2, 3]),
    })
    expect(r.status).toBe(401)
  })

  it('doğru sırla yükler ve R2 nesnesi oluşur', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/y?yol=image/a.jpg', {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg', 'x-servis-sirri': env.SERVIS_SIRRI },
      body: new Uint8Array([1, 2, 3]),
    })
    expect(r.status).toBe(201)
    const nesne = await env.KOVA.get('image/a.jpg')
    expect(nesne).not.toBeNull()
    // @cloudflare/vitest-pool-workers 0.9.x: R2ObjectBody gövdesi tüketilmezse
    // izole depolama testin sonunda "pop" edilemiyor ve çalıştırma çöküyor.
    // Bkz. https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/#isolated-storage
    await nesne.arrayBuffer()
  })

  it('izin listesi dışı MIME reddeder', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/y?yol=image/kotu.svg', {
      method: 'PUT',
      headers: { 'content-type': 'image/svg+xml', 'x-servis-sirri': env.SERVIS_SIRRI },
      body: new Uint8Array([1, 2, 3]),
    })
    expect(r.status).toBe(415)
  })

  it('yalan content-length ile büyük başlığı ucuz erken sırada reddeder', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/y?yol=image/buyuk.jpg', {
      method: 'PUT',
      headers: {
        'content-type': 'image/jpeg',
        'content-length': String(26 * 1024 * 1024),
        'x-servis-sirri': env.SERVIS_SIRRI,
      },
      body: new Uint8Array([1, 2, 3]),
    })
    expect(r.status).toBe(413)
  })

  it('GERÇEK gövde 25 MiB üstündeyse content-length yalan/eksik olsa da reddeder (K1 regresyonu)', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/y?yol=image/asiri.jpg', {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg', 'x-servis-sirri': env.SERVIS_SIRRI },
      body: buyukAkis(AZAMI_BAYT + 1),
      duplex: 'half',
    })
    expect(r.status).toBe(413)
    expect(await env.KOVA.get('image/asiri.jpg')).toBeNull()
  })

  it('MIME karşılaştırmasında büyük/küçük harf duyarsızdır', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/y?yol=image/buyukharf.jpg', {
      method: 'PUT',
      headers: { 'content-type': 'Image/JPEG', 'x-servis-sirri': env.SERVIS_SIRRI },
      body: new Uint8Array([1, 2, 3]),
    })
    expect(r.status).toBe(201)
  })

  it('k/ önekiyle küçük resim anahtarını servis sırrıyla kabul eder', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/y?yol=k/160/image/kucuk.jpg.webp', {
      method: 'PUT',
      headers: { 'content-type': 'image/webp', 'x-servis-sirri': env.SERVIS_SIRRI },
      body: new Uint8Array([1, 2, 3]),
    })
    expect(r.status).toBe(201)
    const nesne = await env.KOVA.get('k/160/image/kucuk.jpg.webp')
    expect(nesne).not.toBeNull()
    await nesne.arrayBuffer()
  })

  it('k/ önekiyle yol kaçışını 400 ile reddeder', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/y?yol=k/160/../../gizli.webp', {
      method: 'PUT',
      headers: { 'content-type': 'image/webp', 'x-servis-sirri': env.SERVIS_SIRRI },
      body: new Uint8Array([1, 2, 3]),
    })
    expect(r.status).toBe(400)
  })

  it('çerezle üzerine yazma denemesini 409 ile reddeder', async () => {
    await env.KOVA.put('image/coklu.jpg', new Uint8Array([1]))
    const r = await SELF.fetch('https://dosya.tekstilas.com/y?yol=image/coklu.jpg', {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg', cookie: await gecerliCerez() },
      body: new Uint8Array([2, 2, 2]),
    })
    expect(r.status).toBe(409)
  })

  it('servis sırrıyla üzerine yazmaya izin verir', async () => {
    await env.KOVA.put('image/coklu2.jpg', new Uint8Array([1]))
    const r = await SELF.fetch('https://dosya.tekstilas.com/y?yol=image/coklu2.jpg', {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg', 'x-servis-sirri': env.SERVIS_SIRRI },
      body: new Uint8Array([2, 2, 2]),
    })
    expect(r.status).toBe(201)
  })

  it('servis sırrıyla OKUMA yapılamaz', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/d/image/a.jpg', {
      headers: { 'x-servis-sirri': env.SERVIS_SIRRI },
    })
    expect(r.status).toBe(401)
  })
})

describe('POST /s', () => {
  beforeAll(async () => {
    await env.KOVA.put('image/sil.jpg', new Uint8Array([1]))
    await env.KOVA.put('k/160/image/sil.jpg.webp', new Uint8Array([1]))
    await env.KOVA.put('k/480/image/sil.jpg.webp', new Uint8Array([1]))
  })

  it('sırsız isteği reddeder', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/s', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ yollar: ['image/sil.jpg'] }),
    })
    expect(r.status).toBe(401)
  })

  it('orijinali ve iki küçüğü birlikte siler', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/s', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-servis-sirri': env.SERVIS_SIRRI },
      body: JSON.stringify({ yollar: ['image/sil.jpg'] }),
    })
    expect(r.status).toBe(200)
    expect(await env.KOVA.get('image/sil.jpg')).toBeNull()
    expect(await env.KOVA.get('k/160/image/sil.jpg.webp')).toBeNull()
    expect(await env.KOVA.get('k/480/image/sil.jpg.webp')).toBeNull()
  })
})
