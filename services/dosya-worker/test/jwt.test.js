import { describe, it, expect, beforeAll } from 'vitest'
import { jetonCoz } from '../src/jwt.js'

// Gerçek Supabase JWKS'ine bağlanmamak için kendi ES256 anahtar çiftimizi
// üretip fetch'i sahteleriz. Böylece test ağsız ve deterministik çalışır.
let ozelAnahtar, jwk
const KID = 'test-kid'

const b64url = (bayt) =>
  btoa(String.fromCharCode(...new Uint8Array(bayt)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function jetonUret(govde, { alg = 'ES256', kid = KID } = {}) {
  const basChunk = b64url(new TextEncoder().encode(JSON.stringify({ alg, kid, typ: 'JWT' })))
  const govChunk = b64url(new TextEncoder().encode(JSON.stringify(govde)))
  const veri = new TextEncoder().encode(`${basChunk}.${govChunk}`)
  const imza = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, ozelAnahtar, veri)
  return `${basChunk}.${govChunk}.${b64url(imza)}`
}

const ENV = { SUPABASE_URL: 'https://ornek.supabase.co' }

beforeAll(async () => {
  const cift = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
  )
  ozelAnahtar = cift.privateKey
  const disa = await crypto.subtle.exportKey('jwk', cift.publicKey)
  jwk = { kty: 'EC', crv: 'P-256', x: disa.x, y: disa.y, kid: KID, alg: 'ES256' }

  // JWKS önbelleği modül kapsamında kalıcı olduğundan (bkz. src/jwt.js),
  // bozuk/farklı-eğrili anahtarları da BAŞTAN aynı JWKS yanıtına ekliyoruz —
  // testler arasında fetch'i değiştirip cache'i geçersiz kılma yolumuz yok.
  const bozukAnahtar = { kty: 'EC', crv: 'P-256', kid: 'bozuk-anahtar', alg: 'ES256' } // x/y eksik
  const yanlisEgriAnahtar = { kty: 'EC', crv: 'P-384', x: disa.x, y: disa.y, kid: 'p384-egri', alg: 'ES256' }

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ keys: [jwk, bozukAnahtar, yanlisEgriAnahtar] }), {
      headers: { 'content-type': 'application/json' },
    })
})

const gelecek = () => Math.floor(Date.now() / 1000) + 3600
const gecmis = () => Math.floor(Date.now() / 1000) - 10

describe('jetonCoz', () => {
  it('geçerli jetonu çözer', async () => {
    const j = await jetonUret({ sub: 'kullanici-1', exp: gelecek() })
    const g = await jetonCoz(j, ENV)
    expect(g?.sub).toBe('kullanici-1')
  })

  it('süresi geçmiş jetonu reddeder', async () => {
    const j = await jetonUret({ sub: 'kullanici-1', exp: gecmis() })
    expect(await jetonCoz(j, ENV)).toBeNull()
  })

  it('bozuk imzayı reddeder', async () => {
    const j = await jetonUret({ sub: 'kullanici-1', exp: gelecek() })
    const bozuk = j.slice(0, -4) + 'AAAA'
    expect(await jetonCoz(bozuk, ENV)).toBeNull()
  })

  it('alg=none karışıklığını reddeder', async () => {
    const j = await jetonUret({ sub: 'kullanici-1', exp: gelecek() }, { alg: 'none' })
    expect(await jetonCoz(j, ENV)).toBeNull()
  })

  it('bilinmeyen kid reddeder', async () => {
    const j = await jetonUret({ sub: 'kullanici-1', exp: gelecek() }, { kid: 'baska' })
    expect(await jetonCoz(j, ENV)).toBeNull()
  })

  it('sub içermeyen jetonu reddeder', async () => {
    const j = await jetonUret({ exp: gelecek() })
    expect(await jetonCoz(j, ENV)).toBeNull()
  })

  it('üç parçalı olmayan metni reddeder', async () => {
    expect(await jetonCoz('abc', ENV)).toBeNull()
  })

  it('base64url alfabesi dışı karakter içeren imzayı FIRLATMADAN reddeder', async () => {
    const j = await jetonUret({ sub: 'kullanici-1', exp: gelecek() })
    const parca = j.split('.')
    const bozukJeton = `${parca[0]}.${parca[1]}.!!!!`
    await expect(jetonCoz(bozukJeton, ENV)).resolves.toBeNull()
  })

  it('çok kısa/bozuk uzunlukta imzayı FIRLATMADAN reddeder', async () => {
    const j = await jetonUret({ sub: 'kullanici-1', exp: gelecek() })
    const parca = j.split('.')
    const kisaJeton = `${parca[0]}.${parca[1]}.QQ`
    await expect(jetonCoz(kisaJeton, ENV)).resolves.toBeNull()
  })

  it('JWKS bozuk anahtar (x/y eksik) döndürürse FIRLATMADAN reddeder', async () => {
    const j = await jetonUret({ sub: 'kullanici-1', exp: gelecek() }, { kid: 'bozuk-anahtar' })
    await expect(jetonCoz(j, ENV)).resolves.toBeNull()
  })

  it('eğri P-256 değilse (crv: "P-384") reddeder', async () => {
    const j = await jetonUret({ sub: 'kullanici-1', exp: gelecek() }, { kid: 'p384-egri' })
    await expect(jetonCoz(j, ENV)).resolves.toBeNull()
  })
})
