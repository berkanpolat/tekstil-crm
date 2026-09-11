import { describe, it, expect, beforeAll } from 'vitest'
import { SELF, env } from 'cloudflare:test'
import { CEREZ_ADI } from '../src/kimlik.js'
import { yolGecerli, r2Anahtar } from '../src/index.js'

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

  it('25 MiB üstünü reddeder', async () => {
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
