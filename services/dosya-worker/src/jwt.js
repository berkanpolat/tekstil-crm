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

  // Beklenmeyen eğri/tür savunması: yalnız P-256 EC anahtarlarını kabul et.
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') return null

  // İmza doğrulama, saldırganın doğrudan denetlediği girdiyle çalışır (jeton
  // metni, JWKS'ten gelen anahtar alanları). Bozuk base64url, eksik/geçersiz
  // JWK alanları ya da hatalı uzunlukta imza baytı burada FIRLATABİLİR; bu
  // fonksiyonun sözleşmesi "asla fırlatmaz" olduğundan hepsini yakalayıp
  // null'a çeviriyoruz. JWKS ÇEKME hatası (yukarıdaki jwks()) bu try/catch'in
  // DIŞINDA kalır — o gerçek bir arızadır, sessizce 401'e dönüşmemeli.
  try {
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
  } catch {
    return null
  }

  if (typeof govde?.exp !== 'number' || govde.exp * 1000 <= Date.now()) return null
  if (!govde?.sub) return null
  return govde
}
