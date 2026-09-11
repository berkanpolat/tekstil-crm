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
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ keys: [jwk] }), {
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
})
