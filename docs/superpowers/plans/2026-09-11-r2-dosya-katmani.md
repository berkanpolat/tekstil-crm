# R2 Dosya Katmanı Uygulama Planı

> **Ajan çalışanlar için:** GEREKLİ ALT BECERİ: Bu planı görev görev uygulamak
> için `superpowers:subagent-driven-development` (önerilen) veya
> `superpowers:executing-plans` kullanın. Adımlar onay kutusu (`- [ ]`)
> biçimindedir.

**Amaç:** CRM'in dosya/görsel katmanını Supabase Storage'dan Cloudflare R2 +
özel Worker'a taşımak; sıfır ek ücret, kalıcı önbelleklenebilir adresler ve
önceden üretilmiş küçük resimlerle.

**Mimari:** Kapalı bir R2 kovasının önünde tek bir Cloudflare Worker
(`dosya.tekstilas.com`). Kimlik, giriş sonrası bırakılan aynı-site oturum
çerezi; imza Worker'da yerel doğrulanır, yetkinin kaynağı ise RLS üzerinden
canlı `files` sorgusudur. Küçük resimler yükleme anında tarayıcıda üretilip
R2'ye ayrı nesne olarak konur.

**Teknoloji:** Cloudflare Workers + R2, `wrangler`, `@cloudflare/vitest-pool-workers`,
React 19 + TanStack Query, Supabase (auth + Postgres, artık Storage değil),
Node 20 + `sharp` (yalnız taşıma betiğinde).

**Tasarım:** `docs/superpowers/specs/2026-09-11-r2-dosya-katmani-design.md`

## Genel Kısıtlar

Her görevin gereksinimleri bu bölümü örtük olarak içerir.

- **Dil:** Tanımlayıcılar, yorumlar, commit mesajları ve kullanıcıya görünen
  metinler **Türkçe**. Mevcut kod tabanının kuralı budur.
- **Ücret:** Hiçbir adım ücretli katmana geçmemeli. Cloudflare Image Resizing
  **kullanılmaz**. R2 sınıf A (yazma) bütçesi 1 M/ay, sınıf B (okuma) 10 M/ay,
  Worker 100 bin istek/gün.
- **Ön yüze sır gömülmez.** `VITE_` önekli hiçbir değişken sır taşımaz.
  Servis sırrı yalnız kenar işlevi ile Worker arasında yaşar.
- **Sözleşme korunur.** `src/hooks/useFiles.ts` dışa verdiği adlar ve imzalar
  değişmez: `useUploadFile`, `useEntityFiles`, `useDeleteFile`, `useSignedUrl`,
  `getSignedUrl`, `isPreviewable`, `FileRow`, `FileCategory`, `UploadFileInput`.
  Yaklaşık 20 tüketici dosyaya dokunulmaz.
- **Mevcut testler kırılmaz.** `npm test` çalıştıran 243 test her görev
  sonunda yeşil kalmalı.
- **MIME ve boyut sınırları** bugünkü `documents` kovasıyla birebir aynı:
  25 MiB; `application/pdf`, `image/jpeg`, `image/png`, `image/webp`,
  `image/gif`, `image/heic`, `image/heif`,
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
  `application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
  `application/vnd.ms-excel`, `text/csv`, `text/plain`, `application/zip`.
- **Yol biçimi:** `^[a-zA-Z0-9_\-./]{1,200}$`, `..` ve ters bölü yasak.
- **Küçük resim boyutları:** yalnız 160 ve 480 piksel genişlik, WebP, kalite 0,82.
- **R2 anahtar şeması:** orijinal `<yol>`, küçükler `k/160/<yol>.webp` ve
  `k/480/<yol>.webp`.
- **Commit sonu:** `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

## Dosya Haritası

| Dosya | Sorumluluk |
|---|---|
| `services/dosya-worker/wrangler.jsonc` | Worker + R2 bağı + alan adı |
| `services/dosya-worker/src/jwt.js` | JWKS çekme, ES256 imza doğrulama |
| `services/dosya-worker/src/kimlik.js` | Çerez okuma/yazma, `files` kaydı sorgusu, önbellek |
| `services/dosya-worker/src/index.js` | Yönlendirme, dört uç, CORS, önbellek başlıkları |
| `services/dosya-worker/test/*.test.js` | Worker birim testleri (miniflare) |
| `src/lib/dosyaAdres.ts` | Adres üretimi, boyut yuvarlama (saf, test edilebilir) |
| `src/lib/dosyaOturum.ts` | Çerez tazeleme, tekilleştirme |
| `src/lib/kucukResim.ts` | Tarayıcıda canvas ile küçük resim üretimi |
| `src/hooks/useFiles.ts` | Yeniden yazılır, sözleşme korunur |
| `src/components/shared/DosyaResim.tsx` | Tek resim bileşeni + yeniden deneme |
| `scripts/r2-tasima.mjs` | İndir / küçük üret / yükle / doğrula |
| `supabase/migrations/…_r2_gecis.sql` | `files.bucket` → `'r2'` |

---

### Görev 1: Worker iskeleti ve jeton doğrulama

**Dosyalar:**
- Oluştur: `services/dosya-worker/package.json`
- Oluştur: `services/dosya-worker/wrangler.jsonc`
- Oluştur: `services/dosya-worker/vitest.config.js`
- Oluştur: `services/dosya-worker/src/jwt.js`
- Oluştur: `services/dosya-worker/src/index.js`
- Test: `services/dosya-worker/test/jwt.test.js`

**Arayüzler:**
- Üretir: `jetonCoz(jeton: string, env) → Promise<{sub, exp, ...} | null>`
  — geçersiz imza, bilinmeyen `kid`, `ES256` dışı `alg`, süresi geçmiş ya da
  `sub` içermeyen jetonlarda `null`.

- [ ] **Adım 1: Paket ve yapılandırmayı kur**

`services/dosya-worker/package.json`:

```json
{
  "name": "tekstil-dosya-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev --remote",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.9.0",
    "vitest": "^3.2.0",
    "wrangler": "^4.128.0"
  }
}
```

`services/dosya-worker/wrangler.jsonc`:

```jsonc
{
  // Tekstil A.Ş. — Dosya Servisi (Cloudflare Worker + R2).
  // Dağıtım: npx wrangler deploy   (önce: npx wrangler login)
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "tekstil-dosya",
  "main": "src/index.js",
  "compatibility_date": "2026-09-01",

  // Kova DIŞARIYA KAPALI. Tek giriş bu Worker'dır.
  "r2_buckets": [
    { "binding": "KOVA", "bucket_name": "tekstil-crm-dosya" }
  ],

  "routes": [
    { "pattern": "dosya.tekstilas.com", "custom_domain": true }
  ],

  "vars": {
    // Sır değildir: anon anahtar ön yüz derlemesinde zaten var.
    "SUPABASE_URL": "https://kkxvoxeqfsaqzklrtgrw.supabase.co",
    "SUPABASE_ANON_KEY": "sb_publishable_HcZIEYsmxwopvP44Ba7-LQ_AJGsaxwH",
    "CORS_ORIGIN": "https://crm.tekstilas.com"
  },

  // SERVIS_SIRRI gizli değişkendir; wrangler secret put ile konur (Görev 3).

  "observability": { "enabled": true }
}
```

`services/dosya-worker/vitest.config.js`:

```js
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: { r2Buckets: ['KOVA'] },
      },
    },
  },
})
```

- [ ] **Adım 2: Başarısız testi yaz**

`services/dosya-worker/test/jwt.test.js`:

```js
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
```

- [ ] **Adım 3: Testi çalıştır, başarısız olduğunu gör**

```bash
cd services/dosya-worker && npm install && npm test
```

Beklenen: `Failed to resolve import "../src/jwt.js"`.

- [ ] **Adım 4: `jwt.js`'i yaz**

```js
// Supabase erişim jetonunun ES256 imzasını YEREL doğrular.
//
// NEDEN YEREL: her görsel isteğinde Supabase'e sormak, 40 görsellik bir katalog
// ızgarasında 40 ağ turu demek olurdu. İmza doğrulaması burada yalnız UCUZ İLK
// KAPIDIR; yetkinin kaynağı kimlik.js'teki canlı `files` sorgusudur (RLS
// is_active_user çağırır → çıkarılan kullanıcı orada durur).
// Bkz. tasarım belgesi §5.1 "Yetki iptali".

let onbellek = { anahtarlar: null, sonGecerlilik: 0 }

async function jwks(env) {
  const simdi = Date.now()
  if (onbellek.anahtarlar && onbellek.sonGecerlilik > simdi) return onbellek.anahtarlar
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
  if (!r.ok) throw new Error('JWKS alınamadı')
  const { keys } = await r.json()
  onbellek = { anahtarlar: keys || [], sonGecerlilik: simdi + 86_400_000 }
  return onbellek.anahtarlar
}

function b64urlBayt(metin) {
  const b64 = metin.replace(/-/g, '+').replace(/_/g, '/')
  const ham = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const bayt = new Uint8Array(ham.length)
  for (let i = 0; i < ham.length; i++) bayt[i] = ham.charCodeAt(i)
  return bayt
}

const metinCoz = (parca) => JSON.parse(new TextDecoder().decode(b64urlBayt(parca)))

/**
 * @returns jetonun gövdesi, ya da geçersizse null. ASLA fırlatmaz (JWKS
 * erişilemezse hariç — o gerçek bir arıza, sessizce 401'e dönüşmemeli).
 */
export async function jetonCoz(jeton, env) {
  if (typeof jeton !== 'string') return null
  const parca = jeton.split('.')
  if (parca.length !== 3) return null

  let baslik, govde
  try {
    baslik = metinCoz(parca[0])
    govde = metinCoz(parca[1])
  } catch {
    return null
  }

  // alg karışıklığı savunması: başlıktaki alg'e GÜVENMEYİZ, sabitle karşılaştırırız.
  if (baslik?.alg !== 'ES256') return null

  const anahtarlar = await jwks(env)
  const jwk = anahtarlar.find((k) => k.kid === baslik.kid)
  if (!jwk) return null

  // WebCrypto bazı uygulamalarda JWK'deki fazladan alanlara takılır; temiz kur.
  const anahtar = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: jwk.crv, x: jwk.x, y: jwk.y },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )

  const gecerli = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    anahtar,
    b64urlBayt(parca[2]),
    new TextEncoder().encode(`${parca[0]}.${parca[1]}`),
  )
  if (!gecerli) return null

  if (typeof govde?.exp !== 'number' || govde.exp * 1000 <= Date.now()) return null
  if (!govde?.sub) return null
  return govde
}

/** Testlerin anahtar önbelleğini sıfırlayabilmesi için. */
export function _onbellegiSifirla() {
  onbellek = { anahtarlar: null, sonGecerlilik: 0 }
}
```

- [ ] **Adım 5: Geçici `index.js` yaz (Worker'ın açılması için)**

```js
// Tekstil A.Ş. — Dosya Servisi (Cloudflare Worker + R2).
// Uçlar Görev 2 ve 3'te eklenir.
export default {
  async fetch() {
    return new Response('tekstil-dosya', { status: 200 })
  },
}
```

- [ ] **Adım 6: Testleri çalıştır, geçtiğini gör**

```bash
cd services/dosya-worker && npm test
```

Beklenen: 7 test PASS.

- [ ] **Adım 7: Commit**

```bash
git add services/dosya-worker
git commit -m "Dosya Worker: iskelet ve ES256 jeton doğrulama

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Görev 2: Çerez oturumu ve `files` kaydı yetkisi

**Dosyalar:**
- Oluştur: `services/dosya-worker/src/kimlik.js`
- Değiştir: `services/dosya-worker/src/index.js`
- Test: `services/dosya-worker/test/kimlik.test.js`

**Arayüzler:**
- Tüketir: `jetonCoz` (Görev 1).
- Üretir:
  - `cerezOku(request) → string | null`
  - `cerezYaz(jeton, exp) → string` (Set-Cookie değeri)
  - `dosyaKaydiniAl(jeton, kullaniciId, yol, env) → Promise<{mime_type, original_name} | null>`
  - `CEREZ_ADI = 'dosya_oturum'`

- [ ] **Adım 1: Başarısız testi yaz**

`services/dosya-worker/test/kimlik.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { cerezOku, cerezYaz, CEREZ_ADI } from '../src/kimlik.js'

describe('cerezOku', () => {
  it('çerezi çoklu değer içinden ayıklar', () => {
    const r = new Request('https://d.test/', {
      headers: { cookie: `baska=1; ${CEREZ_ADI}=JETON123; ucuncu=2` },
    })
    expect(cerezOku(r)).toBe('JETON123')
  })

  it('çerez yoksa null döner', () => {
    expect(cerezOku(new Request('https://d.test/'))).toBeNull()
  })

  it('başka çerez varken yanlış eşleşme yapmaz', () => {
    const r = new Request('https://d.test/', {
      headers: { cookie: `on_${CEREZ_ADI}=YANLIS` },
    })
    expect(cerezOku(r)).toBeNull()
  })
})

describe('cerezYaz', () => {
  it('güvenlik bayraklarını koyar', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const d = cerezYaz('JETON', exp)
    expect(d).toContain(`${CEREZ_ADI}=JETON`)
    expect(d).toContain('HttpOnly')
    expect(d).toContain('Secure')
    expect(d).toContain('SameSite=Lax')
    expect(d).toContain('Path=/')
    expect(d).toMatch(/Max-Age=\d+/)
  })

  it('süresi geçmiş jeton için Max-Age=0 verir', () => {
    const d = cerezYaz('JETON', Math.floor(Date.now() / 1000) - 5)
    expect(d).toContain('Max-Age=0')
  })
})
```

- [ ] **Adım 2: Testi çalıştır, başarısız olduğunu gör**

```bash
cd services/dosya-worker && npm test -- kimlik
```

Beklenen: `Failed to resolve import "../src/kimlik.js"`.

- [ ] **Adım 3: `kimlik.js`'i yaz**

```js
// Çerez oturumu ve yetki kaynağı.
//
// Bir <img> etiketi Authorization başlığı gönderemez. Bu yüzden kimlik
// aynı-site bir çerezle taşınır: crm.tekstilas.com ve dosya.tekstilas.com
// aynı kayıtlı alan adı altında olduğu için SameSite=Lax alt kaynak
// isteklerinde sorunsuz gider.

export const CEREZ_ADI = 'dosya_oturum'

export function cerezOku(request) {
  const ham = request.headers.get('cookie') || ''
  for (const parca of ham.split(';')) {
    const esit = parca.indexOf('=')
    if (esit < 0) continue
    if (parca.slice(0, esit).trim() === CEREZ_ADI) return parca.slice(esit + 1).trim() || null
  }
  return null
}

export function cerezYaz(jeton, exp) {
  const omur = Math.max(0, Math.floor(exp - Date.now() / 1000))
  // Secure, http://localhost'ta da kabul edilir (tarayıcılar localhost'u
  // güvenilir sayar) — geliştirme wrangler dev ile localhost üzerinden çalışır.
  return `${CEREZ_ADI}=${jeton}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${omur}`
}

/**
 * YETKİNİN KAYNAĞI. files kaydını KULLANICININ KENDİ jetonuyla sorar; files
 * üzerindeki RLS public.is_active_user() çağırdığı için çıkarılmış kullanıcı
 * burada boş döner. İmza doğrulaması tek başına iptali yakalayamaz.
 *
 * Önbellek (kullanıcı, yol) çiftine göre anahtarlanır. YALNIZ yola göre
 * anahtarlamak bir kullanıcının olumlu sonucunu herkese servis eder ve
 * iptali tamamen devre dışı bırakır.
 */
export async function dosyaKaydiniAl(jeton, kullaniciId, yol, env) {
  const anahtar = new Request(
    `https://kayit.local/${encodeURIComponent(kullaniciId)}/${encodeURIComponent(yol)}`,
  )
  const onbellek = caches.default
  const vurus = await onbellek.match(anahtar)
  if (vurus) {
    const g = await vurus.json()
    return g.yok ? null : g
  }

  const adres =
    `${env.SUPABASE_URL}/rest/v1/files` +
    `?select=mime_type,original_name` +
    `&bucket=eq.r2` +
    `&storage_path=eq.${encodeURIComponent(yol)}` +
    `&deleted_at=is.null&limit=1`

  const r = await fetch(adres, {
    headers: { authorization: `Bearer ${jeton}`, apikey: env.SUPABASE_ANON_KEY },
  })
  if (!r.ok) return null
  const satirlar = await r.json()
  const kayit = Array.isArray(satirlar) && satirlar.length ? satirlar[0] : null

  // Olumsuz sonucu da önbelleğe koy: var olmayan yola yapılan seri istekler
  // veritabanını dövmesin.
  await onbellek.put(
    anahtar,
    new Response(JSON.stringify(kayit ?? { yok: true }), {
      headers: { 'cache-control': 'max-age=60', 'content-type': 'application/json' },
    }),
  )
  return kayit
}
```

- [ ] **Adım 4: Testleri çalıştır, geçtiğini gör**

```bash
cd services/dosya-worker && npm test
```

Beklenen: 12 test PASS (7 jwt + 5 kimlik).

- [ ] **Adım 5: `/oturum` ucunu `index.js`'e ekle**

```js
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
```

- [ ] **Adım 6: `/oturum` testini yaz**

`services/dosya-worker/test/oturum.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { SELF } from 'cloudflare:test'
import { CEREZ_ADI } from '../src/kimlik.js'

describe('POST /oturum', () => {
  it('jetonsuz isteği 401 ile reddeder', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/oturum', { method: 'POST' })
    expect(r.status).toBe(401)
    expect(r.headers.get('set-cookie')).toBeNull()
  })

  it('Bearer olmayan başlığı reddeder', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/oturum', {
      method: 'POST',
      headers: { authorization: 'Basic abc' },
    })
    expect(r.status).toBe(401)
  })

  it('bilinmeyen yolu 404 verir', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/olmayan')
    expect(r.status).toBe(404)
  })

  it('OPTIONS ön uçuşuna izinli kökeni yansıtır', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/oturum', {
      method: 'OPTIONS',
      headers: { origin: 'https://crm.tekstilas.com' },
    })
    expect(r.status).toBe(204)
    expect(r.headers.get('access-control-allow-origin')).toBe('https://crm.tekstilas.com')
    expect(r.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('izinsiz kökene CORS başlığı VERMEZ', async () => {
    const r = await SELF.fetch('https://dosya.tekstilas.com/oturum', {
      method: 'OPTIONS',
      headers: { origin: 'https://kotu.example' },
    })
    expect(r.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('çerez adı beklenen sabittir', () => {
    expect(CEREZ_ADI).toBe('dosya_oturum')
  })
})
```

- [ ] **Adım 7: Testleri çalıştır, geçtiğini gör**

```bash
cd services/dosya-worker && npm test
```

Beklenen: 18 test PASS.

- [ ] **Adım 8: Commit**

```bash
git add services/dosya-worker
git commit -m "Dosya Worker: oturum çerezi ve files kaydı yetkisi

Yetkinin kaynağı RLS üzerinden canlı files sorgusu; imza yalnız ucuz
ilk kapı. Önbellek (kullanıcı, yol) anahtarlı — yalnız yola göre
anahtarlamak iptali devre dışı bırakırdı.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Görev 3: Dosya verme, yükleme ve silme uçları

**Dosyalar:**
- Değiştir: `services/dosya-worker/src/index.js`
- Test: `services/dosya-worker/test/dosya.test.js`

**Arayüzler:**
- Tüketir: `jetonCoz`, `cerezOku`, `dosyaKaydiniAl` (Görev 1-2).
- Üretir: `/d/<yol>`, `/y?yol=`, `/s` uçları. Anahtar kuralı:
  `w=160 → k/160/<yol>.webp`, `w=480 → k/480/<yol>.webp`, yoksa `<yol>`.

- [ ] **Adım 1: Başarısız testi yaz**

`services/dosya-worker/test/dosya.test.js`:

```js
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
    expect([400, 401]).toContain(r.status)
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
```

- [ ] **Adım 2: Test ortamına sır ekle**

`services/dosya-worker/vitest.config.js` içindeki `miniflare` bloğuna ekle:

```js
        miniflare: {
          r2Buckets: ['KOVA'],
          bindings: { SERVIS_SIRRI: 'test-sirri' },
        },
```

- [ ] **Adım 3: Testi çalıştır, başarısız olduğunu gör**

```bash
cd services/dosya-worker && npm test -- dosya
```

Beklenen: `yolGecerli is not a function` / import hatası.

- [ ] **Adım 4: Uçları `index.js`'e ekle**

Dosyanın başına (importlardan sonra) ekle:

```js
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
  let nesne = await env.KOVA.get(r2Anahtar(yol, genislik), { onlyIf: request.headers })

  // Küçük resim yoksa orijinale düş: sayfa asla boş kalmasın.
  if (!nesne && BOYUTLAR.has(genislik)) {
    nesne = await env.KOVA.get(yol, { onlyIf: request.headers })
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

  await env.KOVA.put(yol, request.body, { httpMetadata: { contentType: tip } })
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
  if (anahtarlar.length) await env.KOVA.delete(anahtarlar)
  return json(request, env, { ok: true, silinen: yollar.length })
}
```

`fetch` içindeki yönlendirmeyi güncelle (404 dönüşünden önce):

```js
    if (url.pathname.startsWith('/d/') && (request.method === 'GET' || request.method === 'HEAD')) {
      return dosyaVer(request, env, decodeURIComponent(url.pathname.slice(3)), url)
    }
    if (url.pathname === '/y' && request.method === 'PUT') {
      return dosyaYukle(request, env, url)
    }
    if (url.pathname === '/s' && request.method === 'POST') {
      return dosyaSil(request, env)
    }
```

`kimlik.js` importunu genişlet:

```js
import { cerezOku, cerezYaz, dosyaKaydiniAl } from './kimlik.js'
```

- [ ] **Adım 5: Testleri çalıştır, geçtiğini gör**

```bash
cd services/dosya-worker && npm test
```

Beklenen: tüm testler PASS (18 + 17 = 35).

- [ ] **Adım 6: Commit**

```bash
git add services/dosya-worker
git commit -m "Dosya Worker: verme, yükleme ve silme uçları

Yol kaçışı, MIME ve boyut denetimi; küçük resim yoksa orijinale düşme;
değişmez önbellek başlıkları ve 304. Servis sırrı yalnız yazma
yetkisi verir, okuma insana özeldir.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Görev 4: Kova, alan adı ve ilk dağıtım

**Dosyalar:**
- Değiştir: `.env.example`
- Değiştir: `src/lib/env.ts`
- Test: `tests/unit/dosyaAdres.test.ts` (Görev 5'te yazılır; burada yalnız env)

**Arayüzler:**
- Üretir: `env.dosyaUrl: string`, `hasDosyaServisi: boolean`.

> **Bu görev insan eylemi gerektirir.** Ajan çalışan buraya geldiğinde durup
> kullanıcıdan `wrangler login` istemelidir; `wrangler` oturumu 2026-09-11
> itibarıyla süresi dolmuş durumdadır.

- [ ] **Adım 1: Cloudflare oturumu aç (kullanıcı)**

```bash
cd services/dosya-worker && npx wrangler login
```

- [ ] **Adım 2: R2 kovasını oluştur**

```bash
cd services/dosya-worker && npx wrangler r2 bucket create tekstil-crm-dosya
```

Beklenen: `Created bucket tekstil-crm-dosya`. Kova varsayılan olarak
**dışarıya kapalıdır**; herkese açık erişim açılmaz.

- [ ] **Adım 3: Servis sırrını üret ve koy**

```bash
cd services/dosya-worker
SIR=$(openssl rand -hex 32)
echo "$SIR" | npx wrangler secret put SERVIS_SIRRI
echo "Bu değeri Supabase kenar işlevi sırlarına da ekleyeceksin (Görev 9): $SIR"
```

- [ ] **Adım 4: Worker'ı dağıt**

```bash
cd services/dosya-worker && npx wrangler deploy
```

Beklenen: `dosya.tekstilas.com` özel alan adı bağlanır. Alan adı Cloudflare
DNS'inde olduğu için (doğrulandı 2026-09-11) DNS kaydı otomatik oluşur.

- [ ] **Adım 5: Canlı sağlık denetimi**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://dosya.tekstilas.com/olmayan
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://dosya.tekstilas.com/oturum
```

Beklenen: sırasıyla `404` ve `401`.

- [ ] **Adım 6: `.env.example`'a değişkeni ekle**

`VITE_PDF_SERVICE_URL` satırının altına:

```
# Dosya servisi (Cloudflare Worker + R2). Dev'de: http://localhost:8787
VITE_DOSYA_URL=https://dosya.tekstilas.com
```

Aynı satırı yerel `.env` dosyasına da ekle.

- [ ] **Adım 7: `src/lib/env.ts`'e alanı ekle**

`AppEnv` arayüzüne:

```ts
  /** Dosya servisi (R2 + Worker). Dev'de yerel wrangler; üretimde dağıtılan URL. */
  dosyaUrl: string
```

`env` nesnesine:

```ts
  dosyaUrl: read('VITE_DOSYA_URL') || (import.meta.env.DEV ? 'http://localhost:8787' : ''),
```

Dosyanın sonuna:

```ts
/** Dosya servisi bu ortamda yapılandırılmış mı? (yoksa görseller açılmaz) */
export const hasDosyaServisi = Boolean(env.dosyaUrl)
```

- [ ] **Adım 8: Tip denetimi ve testler**

```bash
npm run typecheck && npm test
```

Beklenen: temiz, 243 test PASS.

- [ ] **Adım 9: Commit**

```bash
git add .env.example src/lib/env.ts services/dosya-worker
git commit -m "Dosya servisi: R2 kovası, alan adı ve ortam değişkeni

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Görev 5: Adres üretimi ve oturum tazeleme

**Dosyalar:**
- Oluştur: `src/lib/dosyaAdres.ts`
- Oluştur: `src/lib/dosyaOturum.ts`
- Test: `tests/unit/dosyaAdres.test.ts`

**Arayüzler:**
- Üretir:
  - `enYakinBoyut(genislik?: number) → 160 | 480 | undefined`
  - `dosyaUrl(yol: string, secenek?: { genislik?: number; indirAdi?: string }) → string`
  - `oturumTazele() → Promise<void>` (eşzamanlı çağrılar tekilleştirilir)

- [ ] **Adım 1: Başarısız testi yaz**

`tests/unit/dosyaAdres.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { enYakinBoyut, dosyaUrl } from '@/lib/dosyaAdres'

describe('enYakinBoyut', () => {
  it('küçük genişlikleri 160a yuvarlar', () => {
    expect(enYakinBoyut(80)).toBe(160)
    expect(enYakinBoyut(112)).toBe(160)
    expect(enYakinBoyut(120)).toBe(160)
    expect(enYakinBoyut(160)).toBe(160)
  })

  it('orta genişlikleri 480e yuvarlar', () => {
    expect(enYakinBoyut(161)).toBe(480)
    expect(enYakinBoyut(400)).toBe(480)
    expect(enYakinBoyut(480)).toBe(480)
  })

  it('480 üstünde orijinali ister', () => {
    expect(enYakinBoyut(800)).toBeUndefined()
  })

  it('genişlik verilmezse orijinali ister', () => {
    expect(enYakinBoyut()).toBeUndefined()
    expect(enYakinBoyut(0)).toBeUndefined()
  })
})

describe('dosyaUrl', () => {
  it('düz adres üretir', () => {
    expect(dosyaUrl('image/a.jpg')).toBe('http://localhost:8787/d/image/a.jpg')
  })

  it('genişliği yuvarlayıp parametreye koyar', () => {
    expect(dosyaUrl('image/a.jpg', { genislik: 400 })).toContain('w=480')
  })

  it('480 üstünde w parametresi koymaz', () => {
    expect(dosyaUrl('image/a.jpg', { genislik: 900 })).not.toContain('w=')
  })

  it('indirme adını kodlayarak ekler', () => {
    const u = dosyaUrl('image/a.jpg', { indirAdi: 'Teklif Ağustos.pdf' })
    expect(u).toContain('indir=Teklif+A%C4%9Fustos.pdf')
  })

  it('yol parçalarını kodlar ama bölü işaretini korur', () => {
    expect(dosyaUrl('image/a b.jpg')).toBe('http://localhost:8787/d/image/a%20b.jpg')
  })
})
```

- [ ] **Adım 2: Testi çalıştır, başarısız olduğunu gör**

```bash
npm test -- dosyaAdres
```

Beklenen: `Failed to resolve import "@/lib/dosyaAdres"`.

- [ ] **Adım 3: `dosyaAdres.ts`'i yaz**

```ts
import { env } from './env'

/** Hazır küçük resim boyutları. Başka boyut ÜRETİLMEZ (ücretsiz kalmak için). */
export type Boyut = 160 | 480

/**
 * İstenen genişliği hazır boyutlardan birine yuvarlar. 480'den genişse
 * orijinal istenir — büyütmenin anlamı yok.
 */
export function enYakinBoyut(genislik?: number): Boyut | undefined {
  if (!genislik || genislik <= 0) return undefined
  if (genislik <= 160) return 160
  if (genislik <= 480) return 480
  return undefined
}

export interface AdresSecenek {
  genislik?: number
  /** Verilirse tarayıcı indirir (Content-Disposition: attachment). */
  indirAdi?: string
}

/**
 * Dosyanın KALICI adresi. İmza yoktur; kimlik oturum çerezinde taşınır.
 * Adres sabit olduğu için tarayıcı önbelleği çalışır.
 */
export function dosyaUrl(yol: string, secenek?: AdresSecenek): string {
  const kodlu = yol.split('/').map(encodeURIComponent).join('/')
  const u = new URL(`${env.dosyaUrl}/d/${kodlu}`)
  const boyut = enYakinBoyut(secenek?.genislik)
  if (boyut) u.searchParams.set('w', String(boyut))
  if (secenek?.indirAdi) u.searchParams.set('indir', secenek.indirAdi)
  return u.toString()
}
```

- [ ] **Adım 4: Testleri çalıştır, geçtiğini gör**

```bash
npm test -- dosyaAdres
```

Beklenen: 9 test PASS.

- [ ] **Adım 5: `dosyaOturum.ts`'i yaz**

```ts
import { supabase } from './supabase'
import { env } from './env'

/**
 * Dosya servisinin oturum çerezini tazeler.
 *
 * Bir <img> etiketi Authorization başlığı gönderemez; bu yüzden kimlik
 * çerezle taşınır. Çerez ömrü jetonun ömrüne eşittir, o yüzden Supabase
 * jetonu yenilediğinde bu da yenilenmelidir.
 *
 * Eşzamanlı çağrılar tekilleştirilir: 40 görsellik bir ızgarada hepsi aynı
 * anda hata alırsa 40 istek değil bir istek çıkar.
 */
let bekleyen: Promise<void> | null = null

export function oturumTazele(): Promise<void> {
  if (bekleyen) return bekleyen
  bekleyen = (async () => {
    if (!env.dosyaUrl) return
    const { data } = await supabase.auth.getSession()
    const jeton = data.session?.access_token
    if (!jeton) return
    try {
      await fetch(`${env.dosyaUrl}/oturum`, {
        method: 'POST',
        credentials: 'include',
        headers: { authorization: `Bearer ${jeton}` },
      })
    } catch {
      // Ağ hatası: sessiz geç. Çağıran zaten yeniden deneyecek.
    }
  })().finally(() => {
    bekleyen = null
  })
  return bekleyen
}

/** Giriş/çıkış ve jeton yenilemede çerezi eşle. Uygulama açılışında bir kez kurulur. */
export function dosyaOturumunuBagla(): () => void {
  const { data } = supabase.auth.onAuthStateChange((olay) => {
    if (olay === 'SIGNED_IN' || olay === 'TOKEN_REFRESHED' || olay === 'INITIAL_SESSION') {
      void oturumTazele()
    }
  })
  return () => data.subscription.unsubscribe()
}
```

- [ ] **Adım 6: Uygulama açılışına bağla**

`src/App.tsx` içinde, mevcut en dış bileşenin gövdesine:

```tsx
  useEffect(() => dosyaOturumunuBagla(), [])
```

`import { dosyaOturumunuBagla } from '@/lib/dosyaOturum'` ve gerekiyorsa
`useEffect` importunu ekle.

- [ ] **Adım 7: Tip denetimi ve tüm testler**

```bash
npm run typecheck && npm test
```

Beklenen: temiz, 252 test PASS.

- [ ] **Adım 8: Commit**

```bash
git add src/lib/dosyaAdres.ts src/lib/dosyaOturum.ts src/App.tsx tests/unit/dosyaAdres.test.ts
git commit -m "Ön yüz: dosya adresi üretimi ve oturum çerezi tazeleme

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Görev 6: Küçük resim üretimi ve `useFiles` yeniden yazımı

**Dosyalar:**
- Oluştur: `src/lib/kucukResim.ts`
- Değiştir: `src/hooks/useFiles.ts`
- Test: `tests/unit/kucukResim.test.ts`

**Arayüzler:**
- Tüketir: `dosyaUrl`, `enYakinBoyut` (Görev 5).
- Üretir: `kucukResimUret(file: File, genislik: Boyut) → Promise<Blob | null>`.
- Korunur (değişmez imzalar): `useUploadFile`, `useEntityFiles`,
  `useDeleteFile`, `useSignedUrl`, `getSignedUrl`, `isPreviewable`.

- [ ] **Adım 1: Başarısız testi yaz**

`tests/unit/kucukResim.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { kucukResimUret } from '@/lib/kucukResim'

// jsdom'da canvas ve createImageBitmap yoktur; davranışı sahteleriz.
beforeEach(() => {
  vi.restoreAllMocks()
})

const sahteDosya = (tip: string) => new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: tip })

describe('kucukResimUret', () => {
  it('görsel olmayan dosya için null döner', async () => {
    expect(await kucukResimUret(sahteDosya('application/pdf'), 160)).toBeNull()
  })

  it('createImageBitmap yoksa null döner (HEIC gibi)', async () => {
    vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('desteklenmiyor')))
    expect(await kucukResimUret(sahteDosya('image/heic'), 160)).toBeNull()
  })

  it('canvas bağlamı yoksa null döner', async () => {
    vi.stubGlobal('createImageBitmap', () =>
      Promise.resolve({ width: 800, height: 600, close: () => {} }),
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(await kucukResimUret(sahteDosya('image/jpeg'), 160)).toBeNull()
  })

  it('oranı koruyarak küçültür ve webp üretir', async () => {
    const cizilen: number[] = []
    vi.stubGlobal('createImageBitmap', () =>
      Promise.resolve({ width: 800, height: 600, close: () => {} }),
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: (_b: unknown, _x: number, _y: number, w: number, h: number) => {
        cizilen.push(w, h)
      },
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      geri: BlobCallback,
      tip?: string,
    ) {
      geri(new Blob([new Uint8Array([9])], { type: tip }))
    })

    const blob = await kucukResimUret(sahteDosya('image/jpeg'), 160)
    expect(blob?.type).toBe('image/webp')
    expect(cizilen).toEqual([160, 120])   // 800x600 → 160x120
  })

  it('hedeften küçük görseli büyütmez', async () => {
    const cizilen: number[] = []
    vi.stubGlobal('createImageBitmap', () =>
      Promise.resolve({ width: 100, height: 50, close: () => {} }),
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: (_b: unknown, _x: number, _y: number, w: number, h: number) => {
        cizilen.push(w, h)
      },
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      geri: BlobCallback,
      tip?: string,
    ) {
      geri(new Blob([new Uint8Array([9])], { type: tip }))
    })

    await kucukResimUret(sahteDosya('image/jpeg'), 160)
    expect(cizilen).toEqual([100, 50])
  })
})
```

- [ ] **Adım 2: Testi çalıştır, başarısız olduğunu gör**

```bash
npm test -- kucukResim
```

Beklenen: `Failed to resolve import "@/lib/kucukResim"`.

- [ ] **Adım 3: `kucukResim.ts`'i yaz**

```ts
import type { Boyut } from './dosyaAdres'

/**
 * Tarayıcıda küçük resim üretir.
 *
 * NEDEN BURADA: Cloudflare Image Resizing ayda 5.000 dönüşümden sonra
 * ücretlidir. Küçüğü yükleme anında bir kez üretip R2'ye koymak hem bedava
 * hem de sunumda hiç işlem gerektirmediği için daha hızlıdır.
 *
 * @returns WebP blob, ya da üretilemezse null (çağıran yalnız orijinali yükler).
 */
export async function kucukResimUret(dosya: File, genislik: Boyut): Promise<Blob | null> {
  if (!dosya.type.startsWith('image/')) return null
  try {
    // HEIC/HEIF gibi biçimlerde tarayıcı çizemez → burada hata verir, null döner.
    const bitmap = await createImageBitmap(dosya)
    const oran = Math.min(1, genislik / bitmap.width)   // büyütme yok
    const g = Math.max(1, Math.round(bitmap.width * oran))
    const y = Math.max(1, Math.round(bitmap.height * oran))

    const tuval = document.createElement('canvas')
    tuval.width = g
    tuval.height = y
    const ctx = tuval.getContext('2d')
    if (!ctx) {
      bitmap.close?.()
      return null
    }
    ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, g, y)
    bitmap.close?.()

    return await new Promise<Blob | null>((coz) => {
      tuval.toBlob((b) => coz(b), 'image/webp', 0.82)
    })
  } catch {
    return null
  }
}
```

- [ ] **Adım 4: Testleri çalıştır, geçtiğini gör**

```bash
npm test -- kucukResim
```

Beklenen: 5 test PASS.

- [ ] **Adım 5: `useFiles.ts`'i yeniden yaz**

Aşağıdaki bölümleri değiştir. **Diğer her şey aynen kalır** (`sha256`,
`extensionOf`, `useEntityFiles`, `useDeleteFile`, `isPreviewable`, tipler).

`FileBucket` tipini genişlet:

```ts
/** 'documents'/'avatars' eski Supabase kovaları; 'r2' yeni dosya servisi. */
export type FileBucket = 'documents' | 'avatars' | 'r2'
```

`useUploadFile` içindeki yıkımı düzelt — `bucket` artık kullanılmıyor, lint
hatası vermesin:

```ts
      const { file, category } = input
```

Sonra yükleme bloğunu değiştir. Eski hali:

```ts
      const upload = await supabase.storage.from(bucket).upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
      if (upload.error) throw upload.error
```

Yeni hali:

```ts
      // Orijinal + iki küçük resim R2'ye. Küçükler üretilemezse (PDF, HEIC)
      // sessizce atlanır; Worker küçük bulamazsa orijinale düşer.
      await dosyaYukle(path, file, file.type || 'application/octet-stream')
      for (const boyut of [160, 480] as const) {
        const kucuk = await kucukResimUret(file, boyut)
        if (kucuk) await dosyaYukle(`k/${boyut}/${path}.webp`, kucuk, 'image/webp')
      }
```

`bucket` alanının kaydedildiği yeri değiştir — `insert` çağrısında:

```ts
          bucket: 'r2',
```

Hata temizleme bloğunu değiştir. Eski hali:

```ts
        await supabase.storage.from(bucket).remove([path])
```

Yeni hali:

```ts
        await dosyalariSil([path])
```

`getSignedUrl` ve `useSignedUrl`'ü değiştir:

```ts
/** Görsel dönüşümü. Artık yalnız `width` kullanılır (hazır boyuta yuvarlanır). */
export interface ImgTransform { width?: number; height?: number; resize?: 'cover' | 'contain' | 'fill' }

/**
 * Dosyanın adresi.
 *
 * ADI TARİHSELDİR: artık imza üretmez, KALICI adres döndürür. Kimlik oturum
 * çerezinde taşınır. Adı korunuyor çünkü ~20 tüketici bu adı çağırıyor.
 * `expiresInSeconds` yok sayılır; imzasız adresin süresi yoktur.
 */
export async function getSignedUrl(
  _bucket: FileBucket,
  path: string,
  _expiresInSeconds = 60,
  downloadName?: string,
  transform?: ImgTransform,
): Promise<string> {
  return dosyaUrl(path, { genislik: transform?.width, indirAdi: downloadName })
}

/** Dosya adresi. Ağ isteği YOKTUR — imza yenileme derdi kalktı. */
export function useSignedUrl(file: Pick<FileRow, 'bucket' | 'storage_path'> | null, transform?: ImgTransform) {
  const data = file ? dosyaUrl(file.storage_path, { genislik: transform?.width }) : undefined
  return { data, isLoading: false, isError: false as const }
}
```

Dosyanın başına yardımcıları ve importları ekle:

```ts
import { dosyaUrl } from '@/lib/dosyaAdres'
import { kucukResimUret } from '@/lib/kucukResim'
import { oturumTazele } from '@/lib/dosyaOturum'
import { env } from '@/lib/env'

/** Tek bir nesneyi dosya servisine yükler. Çerez yoksa bir kez tazeleyip dener. */
async function dosyaYukle(yol: string, govde: Blob, tip: string): Promise<void> {
  const gonder = () =>
    fetch(`${env.dosyaUrl}/y?yol=${encodeURIComponent(yol)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': tip },
      body: govde,
    })
  let r = await gonder()
  if (r.status === 401) {
    await oturumTazele()
    r = await gonder()
  }
  if (!r.ok) throw new Error(`Dosya yüklenemedi (${r.status}).`)
}

/**
 * Nesneleri (orijinal + küçükler) fiziksel siler.
 *
 * Worker'ın /s ucu servis sırrı ister ve sır tarayıcıya KONAMAZ; bu yüzden
 * çağrı `dosya-sil` kenar işlevinden geçer (Görev 8'de dağıtılır).
 * Hata FIRLATMAZ: silme başarısız olursa yetim nesne kalır, ama `files`
 * kaydı olmadığı için hiçbir kullanıcı ona erişemez.
 */
export async function dosyalariSil(yollar: string[]): Promise<void> {
  const temiz = yollar.filter(Boolean)
  if (!temiz.length) return
  try {
    await supabase.functions.invoke('dosya-sil', { body: { yollar: temiz } })
  } catch {
    // sessiz geç
  }
}
```

> **Sıra notu:** `dosya-sil` kenar işlevi Görev 8'de yazılır. Bu iki görev
> arasında yarım yükleme temizliği sessizce başarısız olur. Kabul edilebilir:
> yalnız nadir bir hata yolunda çalışır ve yetim nesne erişilemez.

- [ ] **Adım 6: Tip denetimi ve tüm testler**

```bash
npm run typecheck && npm test
```

Beklenen: temiz, 257 test PASS.

- [ ] **Adım 7: Commit**

```bash
git add src/lib/kucukResim.ts src/hooks/useFiles.ts tests/unit/kucukResim.test.ts
git commit -m "Ön yüz: yükleme R2'ye, küçük resimler tarayıcıda üretiliyor

getSignedUrl artık imza değil kalıcı adres döndürüyor; adı ~20
tüketici için korundu. useSignedUrl ağ isteği yapmıyor.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Görev 7: Resim bileşeni ve yeniden deneme

**Dosyalar:**
- Oluştur: `src/components/shared/DosyaResim.tsx`
- Değiştir: `src/pages/catalog/CatalogImage.tsx`
- Değiştir: `src/pages/operations/OperationsListPage.tsx:41`
- Değiştir: `src/components/dashboard/TodayBoard.tsx:226`
- Test: `tests/unit/dosyaResim.test.tsx`

**Arayüzler:**
- Tüketir: `dosyaUrl` (Görev 5), `oturumTazele` (Görev 5).
- Üretir: `<DosyaResim path genislik alt className contain />`.

- [ ] **Adım 1: Başarısız testi yaz**

`tests/unit/dosyaResim.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DosyaResim } from '@/components/shared/DosyaResim'

// vi.mock hoist edilir; fabrikanın gördüğü değişken vi.hoisted ile kurulmalı.
const { tazele } = vi.hoisted(() => ({ tazele: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/dosyaOturum', () => ({ oturumTazele: tazele }))

beforeEach(() => tazele.mockClear())

describe('DosyaResim', () => {
  it('yol yoksa yer tutucu gösterir', () => {
    render(<DosyaResim path={null} alt="kumaş" />)
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('adresi genişlikle kurar', () => {
    render(<DosyaResim path="image/a.jpg" alt="kumaş" genislik={400} />)
    expect(screen.getByRole('img').getAttribute('src')).toContain('w=480')
  })

  it('ilk hatada oturumu tazeleyip bir kez daha dener', async () => {
    render(<DosyaResim path="image/a.jpg" alt="kumaş" />)
    fireEvent.error(screen.getByRole('img'))
    await waitFor(() => expect(tazele).toHaveBeenCalledTimes(1))
    // İkinci deneme adresi tazeleme damgasıyla ayrışır.
    expect(screen.getByRole('img').getAttribute('src')).toContain('tz=')
  })

  it('ikinci hatada pes eder ve tekrar tazelemez', async () => {
    render(<DosyaResim path="image/a.jpg" alt="kumaş" />)
    fireEvent.error(screen.getByRole('img'))
    await waitFor(() => expect(tazele).toHaveBeenCalledTimes(1))
    fireEvent.error(screen.getByRole('img'))
    await waitFor(() => expect(screen.queryByRole('img')).toBeNull())
    expect(tazele).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Adım 2: Testi çalıştır, başarısız olduğunu gör**

```bash
npm test -- dosyaResim
```

Beklenen: `Failed to resolve import "@/components/shared/DosyaResim"`.

- [ ] **Adım 3: `DosyaResim.tsx`'i yaz**

```tsx
import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import { dosyaUrl } from '@/lib/dosyaAdres'
import { oturumTazele } from '@/lib/dosyaOturum'
import { cn } from '@/lib/utils'

/**
 * Dosya servisinden gelen tek resim bileşeni.
 *
 * YENİDEN DENEME: oturum çerezi jetonla birlikte ~1 saatte dolar. Sekme açık
 * kalmışsa resimler 401 alıp kırılırdı. İlk hatada çerez bir kez tazelenip
 * resim yeniden istenir; ikinci hatada yer tutucuya düşülür.
 */
export function DosyaResim({
  path, alt, className, genislik, contain,
}: {
  path: string | null
  alt: string
  className?: string
  genislik?: number
  contain?: boolean
}) {
  const [damga, setDamga] = useState<number | null>(null)
  const [pes, setPes] = useState(false)

  if (!path || pes) {
    return (
      <div className={cn('flex items-center justify-center bg-muted text-text-muted', className)}>
        <ImageOff className="size-6" />
      </div>
    )
  }

  const temel = dosyaUrl(path, { genislik })
  const src = damga ? `${temel}${temel.includes('?') ? '&' : '?'}tz=${damga}` : temel

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn(contain ? 'object-contain' : 'object-cover', className)}
      onError={() => {
        if (damga) { setPes(true); return }
        void oturumTazele().then(() => setDamga(Date.now()))
      }}
    />
  )
}
```

- [ ] **Adım 4: Testleri çalıştır, geçtiğini gör**

```bash
npm test -- dosyaResim
```

Beklenen: 4 test PASS.

- [ ] **Adım 5: `CatalogImage.tsx`'i sadeleştir**

Tüm dosyayı şununla değiştir:

```tsx
import { DosyaResim } from '@/components/shared/DosyaResim'

/**
 * Katalog görseli. width verilirse hazır küçük resim (160/480) istenir.
 * contain=true → kart oranından bağımsız KIRPILMADAN sığar.
 *
 * Eski `noTransform` yedek yolu kaldırıldı: küçük resimler artık yükleme
 * anında üretiliyor, Worker bulamazsa kendisi orijinale düşüyor.
 */
export function CatalogImage({ path, alt, className, width, contain }:
  { path: string | null; alt: string; className?: string; width?: number; contain?: boolean }) {
  return <DosyaResim path={path} alt={alt} className={className} genislik={width} contain={contain} />
}
```

- [ ] **Adım 6: `OperationsListPage.tsx` ve `TodayBoard.tsx` küçük resimlerini geçir**

Her iki dosyadaki yerel `Thumb` bileşeninde `useSignedUrl` çağrısını ve
`<img>` etiketini kaldırıp `<DosyaResim path={path} alt="" genislik={120} contain />`
(TodayBoard için `genislik={112}`) kullan. `useSignedUrl` importu kullanılmıyorsa sil.

- [ ] **Adım 7: Tip denetimi, lint ve tüm testler**

```bash
npm run typecheck && npm run lint && npm test
```

Beklenen: temiz, 261 test PASS.

- [ ] **Adım 8: Commit**

```bash
git add src/components/shared/DosyaResim.tsx src/pages/catalog/CatalogImage.tsx \
        src/pages/operations/OperationsListPage.tsx src/components/dashboard/TodayBoard.tsx \
        tests/unit/dosyaResim.test.tsx
git commit -m "Ön yüz: tek resim bileşeni ve çerez süresi dolunca yeniden deneme

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Görev 8: Müşteri kalıcı silme yolunu geçir

**Dosyalar:**
- Değiştir: `src/hooks/useCustomers.ts:398-410`
- Oluştur: `supabase/functions/dosya-sil/index.ts`
- Test: `tests/unit/dosyaSilCagrisi.test.ts`

**Arayüzler:**
- Tüketir: `dosyalariSil` (Görev 6), Worker `/s` ucu (Görev 3), servis sırrı (Görev 4).
- Üretir: `dosya-sil` kenar işlevi — gövde `{ yollar: string[] }`.

> **Neden kenar işlevi:** `/s` ucu servis sırrı ister ve sır tarayıcıya
> konamaz. Silme isteği bu yüzden kenar işlevinden geçer.

- [ ] **Adım 1: Başarısız testi yaz**

`tests/unit/dosyaSilCagrisi.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoke = vi.fn(() => Promise.resolve({ data: null, error: null }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }))

const { dosyalariSil } = await import('@/hooks/useFiles')

beforeEach(() => invoke.mockClear())

describe('dosyalariSil', () => {
  it('boş listede çağrı yapmaz', async () => {
    await dosyalariSil([])
    expect(invoke).not.toHaveBeenCalled()
  })

  it('yolları tek çağrıda kenar işlevine gönderir', async () => {
    await dosyalariSil(['image/a.jpg', 'doc/b.pdf'])
    expect(invoke).toHaveBeenCalledWith('dosya-sil', {
      body: { yollar: ['image/a.jpg', 'doc/b.pdf'] },
    })
  })

  it('boş yolları ayıklar', async () => {
    await dosyalariSil(['', 'image/a.jpg'])
    expect(invoke).toHaveBeenCalledWith('dosya-sil', { body: { yollar: ['image/a.jpg'] } })
  })

  it('hata fırlatmaz (DB zaten silinmiş)', async () => {
    invoke.mockRejectedValueOnce(new Error('ağ'))
    await expect(dosyalariSil(['image/a.jpg'])).resolves.toBeUndefined()
  })
})
```

- [ ] **Adım 2: Testi çalıştır, başarısız olduğunu gör**

```bash
npm test -- dosyaSilCagrisi
```

Beklenen: `dosya-sil` işlevi henüz dağıtılmadığı için çağrı doğrulaması
geçer ama `useCustomers` hâlâ eski yolu kullanır — Adım 3 onu bağlar.

- [ ] **Adım 3: `useCustomers.ts`'i değiştir**

`398-410` arasındaki bloğu (`byBucket` haritası ve `supabase.storage.remove`
döngüsü) şununla değiştir:

```ts
      // Fiziksel silme dosya servisinden geçer (Görev 6'daki ortak yardımcı).
      const nesneler = (data as unknown as { bucket: string; path: string }[]) ?? []
      await dosyalariSil(nesneler.map((n) => n?.path).filter(Boolean))
```

Dosyanın başına import ekle:

```ts
import { dosyalariSil } from './useFiles'
```

- [ ] **Adım 4: `dosya-sil` kenar işlevini yaz**

`supabase/functions/dosya-sil/index.ts`:

```ts
// Dosya servisinin /s ucuna köprü.
//
// /s servis sırrı ister; sır tarayıcıya konamaz. Bu işlev çağıranın Supabase
// oturumunu doğrular, sonra sırla Worker'a gider.
Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('yöntem yok', { status: 405 })

  const auth = request.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) return new Response('yetki yok', { status: 401 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const dosyaUrl = Deno.env.get('DOSYA_SERVIS_URL')
  const sir = Deno.env.get('DOSYA_SERVIS_SIRRI')
  if (!supabaseUrl || !anon || !dosyaUrl || !sir) {
    return new Response('yapılandırma eksik', { status: 500 })
  }

  // Çağıran gerçekten oturum sahibi mi?
  const u = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { authorization: auth, apikey: anon },
  })
  if (!u.ok) return new Response('yetki yok', { status: 401 })

  let govde: { yollar?: unknown }
  try {
    govde = await request.json()
  } catch {
    return new Response('gövde okunamadı', { status: 400 })
  }
  const yollar = Array.isArray(govde.yollar)
    ? govde.yollar.filter((y): y is string => typeof y === 'string')
    : []
  if (!yollar.length) return Response.json({ ok: true, silinen: 0 })

  const r = await fetch(`${dosyaUrl}/s`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-servis-sirri': sir },
    body: JSON.stringify({ yollar }),
  })
  return new Response(await r.text(), { status: r.status })
})
```

- [ ] **Adım 5: Kenar işlevi sırlarını koy ve dağıt**

```bash
supabase secrets set DOSYA_SERVIS_URL=https://dosya.tekstilas.com
supabase secrets set DOSYA_SERVIS_SIRRI=<Görev 4 Adım 3'teki değer>
supabase functions deploy dosya-sil
```

- [ ] **Adım 6: Tip denetimi ve tüm testler**

```bash
npm run typecheck && npm test
```

Beklenen: temiz, 265 test PASS.

- [ ] **Adım 7: Commit**

```bash
git add src/hooks/useCustomers.ts supabase/functions/dosya-sil tests/unit/dosyaSilCagrisi.test.ts
git commit -m "Müşteri kalıcı silme: nesneler dosya servisi üzerinden siliniyor

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Görev 9: Talep girişini R2'ye yönlendir

**Dosyalar:**
- Değiştir: `supabase/functions/intake-request/index.ts:53-66`
- Test: `tests/unit/intakeDepolama.test.ts`

**Arayüzler:**
- Tüketir: Worker `/y` ucu + servis sırrı (Görev 3-4).
- Üretir: `depolamayaYaz(yol, bayt, mime, ortam) → Promise<boolean>`
  (`supabase/functions/_shared/dosyaDepo.ts`).

- [ ] **Adım 1: Başarısız testi yaz**

`tests/unit/intakeDepolama.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { depolamayaYaz } from '../../supabase/functions/_shared/dosyaDepo.ts'

const ORTAM = { url: 'https://dosya.test', sir: 'sir123' }

describe('depolamayaYaz', () => {
  it('doğru uca sırla PUT eder', async () => {
    const cagri: { adres?: string; secenek?: RequestInit } = {}
    const sahte = vi.fn((adres: string, secenek: RequestInit) => {
      cagri.adres = adres
      cagri.secenek = secenek
      return Promise.resolve(new Response('{}', { status: 201 }))
    })
    const ok = await depolamayaYaz('intake/5/a.jpg', new Uint8Array([1]), 'image/jpeg', ORTAM, sahte as never)
    expect(ok).toBe(true)
    expect(cagri.adres).toBe('https://dosya.test/y?yol=intake%2F5%2Fa.jpg')
    expect(cagri.secenek?.method).toBe('PUT')
    expect((cagri.secenek?.headers as Record<string, string>)['x-servis-sirri']).toBe('sir123')
  })

  it('başarısız yanıtta false döner (fırlatmaz)', async () => {
    const sahte = vi.fn(() => Promise.resolve(new Response('hata', { status: 500 })))
    expect(await depolamayaYaz('a.jpg', new Uint8Array([1]), 'image/jpeg', ORTAM, sahte as never)).toBe(false)
  })

  it('ağ hatasında false döner (fırlatmaz)', async () => {
    const sahte = vi.fn(() => Promise.reject(new Error('ağ')))
    expect(await depolamayaYaz('a.jpg', new Uint8Array([1]), 'image/jpeg', ORTAM, sahte as never)).toBe(false)
  })

  it('yapılandırma eksikse false döner', async () => {
    const sahte = vi.fn()
    expect(await depolamayaYaz('a.jpg', new Uint8Array([1]), 'image/jpeg', { url: '', sir: '' }, sahte as never)).toBe(false)
    expect(sahte).not.toHaveBeenCalled()
  })
})
```

- [ ] **Adım 2: Testi çalıştır, başarısız olduğunu gör**

```bash
npm test -- intakeDepolama
```

Beklenen: modül bulunamadı.

- [ ] **Adım 3: `_shared/dosyaDepo.ts`'i yaz**

```ts
// Kenar işlevlerinden dosya servisine yazma köprüsü.
//
// Kenar işlevinin kullanıcı jetonu yoktur; /y ucu bu yüzden servis sırrını
// kabul eder. Sır YALNIZ sunucu bileşenleri arasında yaşar, tarayıcıya
// asla ulaşmaz. Bu, işlevin kendi girişindeki INTAKE_SECRET kalıbının aynısı.

export interface DepoOrtam {
  url: string
  sir: string
}

/** @returns yazıldıysa true. ASLA fırlatmaz — talep girişi dosya yüzünden düşmemeli. */
export async function depolamayaYaz(
  yol: string,
  bayt: Uint8Array,
  mime: string,
  ortam: DepoOrtam,
  getir: typeof fetch = fetch,
): Promise<boolean> {
  if (!ortam.url || !ortam.sir) return false
  try {
    const r = await getir(`${ortam.url}/y?yol=${encodeURIComponent(yol)}`, {
      method: 'PUT',
      headers: {
        'content-type': mime,
        'content-length': String(bayt.byteLength),
        'x-servis-sirri': ortam.sir,
      },
      body: bayt,
    })
    return r.ok
  } catch {
    return false
  }
}
```

- [ ] **Adım 4: `intake-request`'teki `store` fonksiyonunu değiştir**

Eski gövdesini şununla değiştir:

```ts
  async function store(bytes: Uint8Array, name: string, mime: string) {
    const path = `intake/${opId}/${crypto.randomUUID()}-${name}`.slice(0, 200)
    const ortam = {
      url: Deno.env.get('DOSYA_SERVIS_URL') ?? '',
      sir: Deno.env.get('DOSYA_SERVIS_SIRRI') ?? '',
    }
    if (!(await depolamayaYaz(path, bytes, mime, ortam))) {
      notes.push(`dosya yüklenemedi: ${name}`)
      return
    }
    await db.from('files').insert({
      bucket: 'r2', storage_path: path, original_name: name, mime_type: mime,
      size_bytes: bytes.byteLength, checksum: await sha256(bytes),
      category: mime.startsWith('image/') ? 'image' : 'document',   // görsel → image (liste önizlemesi bunu arar)
      entity_type: 'operation', entity_id: String(opId),
    })
    filesSaved++
  }
```

Dosyanın başına import ekle:

```ts
import { depolamayaYaz } from '../_shared/dosyaDepo.ts'
```

> **Küçük resim:** Talep girişi küçük resim ÜRETMEZ. Deno'da görsel işleme
> ek bağımlılık ve CPU demek; talep girişi asla görsel yüzünden düşmemeli.
> Worker küçük bulamayınca orijinale düşer. Görev 10'daki tamamlama betiği
> bu dosyaların küçüklerini sonradan üretir.

- [ ] **Adım 5: Yol adının geçerliliğini doğrula**

`intake/<id>/<uuid>-<ad>` biçimindeki `<ad>` kullanıcıdan gelir ve Worker'ın
yol denetiminden geçmesi gerekir. `store` çağrısından önce adı temizle:

```ts
    const guvenliAd = name.replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 80) || 'dosya'
```

ve `path` kurulumunda `name` yerine `guvenliAd` kullan. `original_name`
alanına **temizlenmemiş** `name` yazılmaya devam eder (kullanıcı gerçek adı
görsün).

- [ ] **Adım 6: Sırları koy ve dağıt**

```bash
supabase functions deploy intake-request
```

(Sırlar Görev 8 Adım 5'te zaten konuldu.)

- [ ] **Adım 7: Testleri çalıştır**

```bash
npm test
```

Beklenen: 269 test PASS.

- [ ] **Adım 8: Commit**

```bash
git add supabase/functions/_shared/dosyaDepo.ts supabase/functions/intake-request \
        tests/unit/intakeDepolama.test.ts
git commit -m "Talep girişi: dosyalar R2'ye yazılıyor

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Görev 10: Taşıma betiği

**Dosyalar:**
- Oluştur: `scripts/r2-tasima.mjs`
- Değiştir: `package.json` (devDependency: `sharp`)
- Test: `tests/unit/tasimaYol.test.ts`

**Arayüzler:**
- Üretir: `node scripts/r2-tasima.mjs <indir|kucuk|yukle|dogrula>`
- Üretir (test için): `kucukYolu(yol, boyut) → string`,
  `gorselMi(mime) → boolean` — `scripts/r2-tasima.mjs`'den dışa verilir.

> **rclone kullanılmıyor.** rclone iki tarafta da ayrı API anahtarı
> üretmeyi gerektirirdi (Supabase S3 kimliği + R2 kimliği). Bu betik
> elimizdeki kimlikleri kullanır: Supabase tarafında servis anahtarı,
> R2 tarafında Worker'ın `/y` ucu. Ayrıca yükleme canlı yetki yolunun
> aynısını kullandığı için taşıma aynı zamanda bir uçtan uca testtir.

- [ ] **Adım 1: `sharp` ekle**

```bash
npm install -D sharp
```

- [ ] **Adım 2: Başarısız testi yaz**

`tests/unit/tasimaYol.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { kucukYolu, gorselMi } from '../../scripts/r2-tasima.mjs'

describe('kucukYolu', () => {
  it('160 anahtarını kurar', () => {
    expect(kucukYolu('image/a.jpg', 160)).toBe('k/160/image/a.jpg.webp')
  })
  it('480 anahtarını kurar', () => {
    expect(kucukYolu('image/a.jpg', 480)).toBe('k/480/image/a.jpg.webp')
  })
  it('Worker anahtar kuralıyla birebir aynıdır', () => {
    // services/dosya-worker/src/index.js → r2Anahtar ile aynı biçim.
    expect(kucukYolu('doc/x/y.png', 160)).toBe('k/160/doc/x/y.png.webp')
  })
})

describe('gorselMi', () => {
  it('görsel tiplerini tanır', () => {
    expect(gorselMi('image/jpeg')).toBe(true)
    expect(gorselMi('image/png')).toBe(true)
    expect(gorselMi('image/webp')).toBe(true)
  })
  it('sharp desteklemeyen tipleri dışlar', () => {
    expect(gorselMi('image/heic')).toBe(false)
    expect(gorselMi('image/heif')).toBe(false)
  })
  it('görsel olmayanları dışlar', () => {
    expect(gorselMi('application/pdf')).toBe(false)
    expect(gorselMi(null)).toBe(false)
  })
})
```

- [ ] **Adım 3: Testi çalıştır, başarısız olduğunu gör**

```bash
npm test -- tasimaYol
```

Beklenen: modül bulunamadı.

- [ ] **Adım 4: `scripts/r2-tasima.mjs`'i yaz**

```js
#!/usr/bin/env node
// Supabase Storage → Cloudflare R2 taşıma aracı.
//
// KULLANIM
//   node scripts/r2-tasima.mjs indir     # Supabase'den yerel klasöre
//   node scripts/r2-tasima.mjs kucuk     # 160/480 WebP üret
//   node scripts/r2-tasima.mjs yukle     # R2'ye (Worker /y ucundan)
//   node scripts/r2-tasima.mjs dogrula   # sayı/boyut karşılaştır, yetim ara
//
// Her aşama YENİDEN BAŞLATILABİLİR: tamamlananlar .tasima-durum.json'da
// tutulur, ikinci çalıştırma kaldığı yerden sürer.
//
// GEREKLİ ORTAM DEĞİŞKENLERİ (.env'den okunur)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DOSYA_SERVIS_URL, DOSYA_SERVIS_SIRRI

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'

const KLASOR = '.tasima'
const DURUM = '.tasima-durum.json'
const ESZAMAN = 6
const BOYUTLAR = [160, 480]

export const kucukYolu = (yol, boyut) => `k/${boyut}/${yol}.webp`

/** sharp'ın güvenle işleyebildiği tipler. HEIC/HEIF hariç (lisans + kodek). */
export const gorselMi = (mime) =>
  typeof mime === 'string' && ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)

async function durumOku() {
  if (!existsSync(DURUM)) return { indirilen: [], kucuk: [], yuklenen: [] }
  return JSON.parse(await readFile(DURUM, 'utf8'))
}
const durumYaz = (d) => writeFile(DURUM, JSON.stringify(d, null, 2))

function ortam() {
  const g = (k) => {
    const v = process.env[k]
    if (!v) throw new Error(`${k} tanımlı değil`)
    return v
  }
  return {
    supabaseUrl: g('SUPABASE_URL'),
    servisAnahtar: g('SUPABASE_SERVICE_ROLE_KEY'),
    dosyaUrl: g('DOSYA_SERVIS_URL'),
    sir: g('DOSYA_SERVIS_SIRRI'),
  }
}

/** files tablosundaki tüm aktif kayıtlar (sayfalı). */
async function kayitlar(o) {
  const hepsi = []
  for (let sayfa = 0; ; sayfa++) {
    const r = await fetch(
      `${o.supabaseUrl}/rest/v1/files?select=storage_path,mime_type,size_bytes` +
        `&deleted_at=is.null&order=id&limit=1000&offset=${sayfa * 1000}`,
      { headers: { authorization: `Bearer ${o.servisAnahtar}`, apikey: o.servisAnahtar } },
    )
    if (!r.ok) throw new Error(`files okunamadı: ${r.status}`)
    const parca = await r.json()
    hepsi.push(...parca)
    if (parca.length < 1000) break
  }
  return hepsi
}

/** İş listesini sınırlı eşzamanlılıkla işler. */
async function kuyruk(isler, calis) {
  let sira = 0
  let bitti = 0
  const isci = async () => {
    while (sira < isler.length) {
      const i = sira++
      await calis(isler[i])
      if (++bitti % 100 === 0) console.log(`  ${bitti}/${isler.length}`)
    }
  }
  await Promise.all(Array.from({ length: ESZAMAN }, isci))
}

async function indir() {
  const o = ortam()
  const durum = await durumOku()
  const tamam = new Set(durum.indirilen)
  const liste = (await kayitlar(o)).filter((k) => !tamam.has(k.storage_path))
  console.log(`İndirilecek: ${liste.length}`)

  await kuyruk(liste, async (k) => {
    const hedef = path.join(KLASOR, 'ham', k.storage_path)
    await mkdir(path.dirname(hedef), { recursive: true })
    const imza = await fetch(
      `${o.supabaseUrl}/storage/v1/object/sign/documents/${k.storage_path}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${o.servisAnahtar}`,
          apikey: o.servisAnahtar,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 600 }),
      },
    )
    if (!imza.ok) { console.error(`  imza yok: ${k.storage_path}`); return }
    const { signedURL } = await imza.json()
    const r = await fetch(`${o.supabaseUrl}/storage/v1${signedURL}`)
    if (!r.ok) { console.error(`  indirilemedi: ${k.storage_path}`); return }
    await writeFile(hedef, Buffer.from(await r.arrayBuffer()))
    durum.indirilen.push(k.storage_path)
  })
  await durumYaz(durum)
  console.log(`İndirilen toplam: ${durum.indirilen.length}`)
}

async function kucuk() {
  const o = ortam()
  const durum = await durumOku()
  const tamam = new Set(durum.kucuk)
  const liste = (await kayitlar(o))
    .filter((k) => gorselMi(k.mime_type) && !tamam.has(k.storage_path))
  console.log(`Küçültülecek: ${liste.length}`)

  await kuyruk(liste, async (k) => {
    const kaynak = path.join(KLASOR, 'ham', k.storage_path)
    if (!existsSync(kaynak)) return
    for (const boyut of BOYUTLAR) {
      const hedef = path.join(KLASOR, 'ham', kucukYolu(k.storage_path, boyut))
      await mkdir(path.dirname(hedef), { recursive: true })
      try {
        await sharp(kaynak)
          .resize({ width: boyut, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toFile(hedef)
      } catch (e) {
        console.error(`  küçültülemedi (${boyut}): ${k.storage_path} — ${e.message}`)
      }
    }
    durum.kucuk.push(k.storage_path)
  })
  await durumYaz(durum)
  console.log(`Küçültülen toplam: ${durum.kucuk.length}`)
}

async function yukle() {
  const o = ortam()
  const durum = await durumOku()
  const tamam = new Set(durum.yuklenen)
  const kayit = await kayitlar(o)

  const isler = []
  for (const k of kayit) {
    isler.push({ yol: k.storage_path, mime: k.mime_type || 'application/octet-stream' })
    if (gorselMi(k.mime_type)) {
      for (const boyut of BOYUTLAR) isler.push({ yol: kucukYolu(k.storage_path, boyut), mime: 'image/webp' })
    }
  }
  const kalan = isler.filter((i) => !tamam.has(i.yol))
  console.log(`Yüklenecek nesne: ${kalan.length}`)

  await kuyruk(kalan, async (i) => {
    const kaynak = path.join(KLASOR, 'ham', i.yol)
    if (!existsSync(kaynak)) return
    const govde = await readFile(kaynak)
    const r = await fetch(`${o.dosyaUrl}/y?yol=${encodeURIComponent(i.yol)}`, {
      method: 'PUT',
      headers: {
        'content-type': i.mime,
        'content-length': String(govde.byteLength),
        'x-servis-sirri': o.sir,
      },
      body: govde,
    })
    if (!r.ok) { console.error(`  yüklenemedi: ${i.yol} (${r.status})`); return }
    durum.yuklenen.push(i.yol)
  })
  await durumYaz(durum)
  console.log(`Yüklenen toplam: ${durum.yuklenen.length}`)
}

async function dogrula() {
  const o = ortam()
  const kayit = await kayitlar(o)
  let eksik = 0
  let boyutFarki = 0

  await kuyruk(kayit, async (k) => {
    const yerel = path.join(KLASOR, 'ham', k.storage_path)
    if (!existsSync(yerel)) { console.error(`  YEREL YOK: ${k.storage_path}`); eksik++; return }
    const s = await stat(yerel)
    if (k.size_bytes && Number(k.size_bytes) !== s.size) {
      console.error(`  BOYUT FARKI: ${k.storage_path} — DB ${k.size_bytes}, yerel ${s.size}`)
      boyutFarki++
    }
  })

  console.log(`\nKayıt: ${kayit.length} · eksik: ${eksik} · boyut farkı: ${boyutFarki}`)
  if (eksik || boyutFarki) process.exitCode = 1
}

// CLI YALNIZ doğrudan çalıştırıldığında işler. Testler bu dosyadan
// kucukYolu/gorselMi içe aktarır; import sırasında taşıma başlamamalı.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const komut = process.argv[2]
  const komutlar = { indir, kucuk, yukle, dogrula }
  if (!komutlar[komut]) {
    console.error('Kullanım: node scripts/r2-tasima.mjs <indir|kucuk|yukle|dogrula>')
    process.exit(1)
  }
  await komutlar[komut]()
}
```

- [ ] **Adım 5: `.gitignore`'a taşıma çıktısını ekle**

```
.tasima/
.tasima-durum.json
```

- [ ] **Adım 6: Testleri çalıştır, geçtiğini gör**

```bash
npm test -- tasimaYol
```

Beklenen: 6 test PASS.

- [ ] **Adım 7: Commit**

```bash
git add scripts/r2-tasima.mjs package.json package-lock.json .gitignore tests/unit/tasimaYol.test.ts
git commit -m "Taşıma betiği: indir, küçült, yükle, doğrula

rclone yerine tek betik: iki tarafta da yeni API anahtarı üretmeye
gerek kalmıyor, yükleme canlı yetki yolunu kullandığı için taşıma
aynı zamanda uçtan uca test.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Görev 11: Kuru prova

**Dosyalar:** yok (yalnız çalıştırma ve gözlem)

> Bu görev **canlı veriye dokunmaz**: `files.bucket` hâlâ `'documents'`,
> ön yüz hâlâ Supabase'den okuyor. Yalnız R2 dolduruluyor.

- [ ] **Adım 1: İndir**

```bash
set -a && source .env && set +a
node scripts/r2-tasima.mjs indir
```

Beklenen: `İndirilen toplam: 3794` (ya da o günkü kayıt sayısı).

- [ ] **Adım 2: Küçükleri üret**

```bash
node scripts/r2-tasima.mjs kucuk
```

Beklenen: ~3.399 görselin küçüğü üretilir. HEIC/HEIF atlanır.

- [ ] **Adım 3: Doğrula**

```bash
node scripts/r2-tasima.mjs dogrula
```

Beklenen: `eksik: 0 · boyut farkı: 0`, çıkış kodu 0. Aksi halde **DURUP**
farkı incele; geçişe geçme.

- [ ] **Adım 4: R2'ye yükle**

```bash
node scripts/r2-tasima.mjs yukle
```

Beklenen: ~10.600 nesne (3.794 orijinal + ~6.800 küçük).

- [ ] **Adım 5: R2 tarafını say**

```bash
cd services/dosya-worker && npx wrangler r2 bucket info tekstil-crm-dosya
```

Beklenen: nesne sayısı ve toplam boyut yukarıdakiyle tutarlı, boyut ~1,1 GB.
Ücretsiz katman 10 GB.

- [ ] **Adım 6: Ücretsiz katman kullanımını denetle**

Cloudflare panelinde R2 ve Workers kullanımına bak. Sınıf A (yazma)
işlemlerinin aylık 1 M bütçesinin %2'sini geçmemesi beklenir.

- [ ] **Adım 7: Yerelde uçtan uca dene**

```bash
cd services/dosya-worker && npx wrangler dev --remote &
cd ../.. && npm run dev
```

Tarayıcıda `http://localhost:5173`:
- Giriş yap, ağ sekmesinde `POST localhost:8787/oturum` → 200 ve `Set-Cookie`.
- Katalog ızgarasını aç → görseller `?w=480` ile geliyor, hepsi 200.
- Sayfayı yenile → görseller `(disk cache)` olarak geliyor, ağ isteği yok.
- Bir belgeyi indir → doğru ad ve içerik.
- Yeni bir görsel yükle → üç nesne de R2'ye gidiyor (ağ sekmesinde üç PUT).

> **Not:** Bu aşamada ön yüz `files.bucket = 'documents'` kayıtlarını okuyor
> ama `dosyaUrl` kovaya bakmıyor, yalnız yola bakıyor. Worker ise
> `bucket=eq.r2` filtresiyle sorguluyor, bu yüzden kuru provada `/d` uçları
> **404 dönecektir**. Bu beklenen davranıştır; Adım 7'yi geçişten (Görev 12)
> sonra tekrarla. Kuru provada yalnız Adım 1-6 doğrulanır.

- [ ] **Adım 8: Bulguları not et**

Taşıma süresi, başarısız dosya sayısı ve R2 kullanımını
`docs/superpowers/specs/2026-09-11-r2-dosya-katmani-design.md` sonuna
"Taşıma kaydı" başlığıyla ekle ve commit et.

---

### Görev 12: Geçiş

**Dosyalar:**
- Oluştur: `supabase/migrations/20260911120000_r2_gecis.sql`

> **Sakin bir saatte yapılır.** Süre: yaklaşık 15 dakika.

- [ ] **Adım 1: Son fark kopyasını al**

```bash
set -a && source .env && set +a
node scripts/r2-tasima.mjs indir && node scripts/r2-tasima.mjs kucuk && node scripts/r2-tasima.mjs yukle
```

Beklenen: yalnız kuru provadan sonra eklenen dosyalar işlenir, dakikalar sürer.

- [ ] **Adım 2: Geçiş migration'ını yaz**

`supabase/migrations/20260911120000_r2_gecis.sql`:

```sql
-- R2 geçişi — dosyalar artık Cloudflare R2'de, Supabase Storage'da değil.
--
-- storage_path DEĞİŞMEZ: R2 anahtar şeması Supabase yollarıyla birebir aynı
-- tutuldu, böylece bu tek satır geçişi tamamlar.
--
-- GERİ DÖNÜŞ: update public.files set bucket = 'documents' where bucket = 'r2';
-- Supabase nesneleri iki hafta boyunca yerinde duruyor (bkz. tasarım §8).

update public.files
   set bucket = 'r2'
 where bucket = 'documents'
   and deleted_at is null;

-- Silinmiş kayıtlar da tutarlı olsun (geri dönüşte ayrı dal gerekmesin).
update public.files
   set bucket = 'r2'
 where bucket = 'documents';
```

- [ ] **Adım 3: Migration'ı uygula**

```bash
npm run db:push
```

- [ ] **Adım 4: Kaydı doğrula**

```bash
TOK=$(security find-generic-password -s "Supabase CLI" -a supabase -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -s -X POST "https://api.supabase.com/v1/projects/kkxvoxeqfsaqzklrtgrw/database/query" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"query":"select bucket, count(*) from public.files group by 1"}'
```

Beklenen: yalnız `r2`, sayı 3.821.

- [ ] **Adım 5: Ön yüzü yayımla**

```bash
npm run build && ./scripts/release.sh
```

- [ ] **Adım 6: Canlı denetim**

`https://crm.tekstilas.com` üzerinde:
- Giriş → ağ sekmesinde `POST dosya.tekstilas.com/oturum` → 200.
- Katalog ızgarası → görseller 200, `?w=480`.
- Yenile → `(disk cache)`.
- Pano, operasyon listesi, müşteri dosyaları sekmesi → görseller geliyor.
- Bir belge indir → doğru ad.
- Bir görsel yükle → üç PUT, sonra listede görünüyor.
- Bir teklif PDF'i üret → belge motoru görseli gömüyor.

- [ ] **Adım 7: Rastgele 50 dosyayı denetle**

```bash
TOK=$(security find-generic-password -s "Supabase CLI" -a supabase -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -s -X POST "https://api.supabase.com/v1/projects/kkxvoxeqfsaqzklrtgrw/database/query" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"query":"select storage_path from public.files where deleted_at is null order by random() limit 50"}' \
  | python3 -c "import json,sys;[print(r['storage_path']) for r in json.load(sys.stdin)]" > /tmp/ornek.txt
wc -l /tmp/ornek.txt
```

Tarayıcıda oturum açıkken bu yollardan birkaçını `dosya.tekstilas.com/d/<yol>`
olarak aç; hepsi açılmalı.

- [ ] **Adım 8: Sürümü yükselt ve commit**

`package.json` sürümünü `1.37.0` yap, `CHANGELOG.md`'ye girdi ekle.

```bash
git add -A
git commit -m "Dosya katmanı R2'ye geçti (v1.37.0)

files.bucket → 'r2'. Supabase nesneleri iki hafta yerinde duruyor;
geri dönüş tek SQL.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Görev 13: İki hafta sonra temizlik

> **2026-09-25'ten önce yapılmaz.** Bu görev geri dönüş penceresini kapatır.

- [ ] **Adım 1: Hata olmadığını doğrula**

Cloudflare Worker günlüklerinde son iki haftanın 4xx/5xx oranına bak.
`files` tablosunda `bucket <> 'r2'` kaydı olmadığını doğrula.

- [ ] **Adım 2: Kullanıcıdan onay al**

Temizlik geri döndürülemez. Devam etmeden önce açıkça onay iste.

- [ ] **Adım 3: Supabase kovasını boşalt**

```bash
TOK=$(security find-generic-password -s "Supabase CLI" -a supabase -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -s -X POST "https://api.supabase.com/v1/projects/kkxvoxeqfsaqzklrtgrw/database/query" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"query":"select count(*) from storage.objects where bucket_id = '"'"'documents'"'"'"}'
```

Sayıyı not et, sonra Supabase panelinden `documents` kovasını boşalt.

- [ ] **Adım 4: Kota düşüşünü doğrula**

Supabase panelinde depolama kullanımının ~0 MB'a düştüğünü gör.

- [ ] **Adım 5: Ölü kodu temizle**

`useFiles.ts`'te `FileBucket` tipinden `'documents' | 'avatars'` dallarını
kaldır, `'r2'` tek değer olarak kalsın. Tip hatalarını düzelt.

```bash
npm run typecheck && npm test && npm run lint
```

- [ ] **Adım 6: Commit**

```bash
git add -A
git commit -m "Temizlik: Supabase Storage kovası boşaltıldı, ölü kod kaldırıldı

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
