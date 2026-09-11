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
 *
 * Saldırgan denetimli girdiyle (çerezden gelen jeton) ağ çağrısı yapar: hem
 * fetch hem de gövde çözümü başarısız olabilir (ağ arızası, bozuk/eksik
 * JSON). Bu fonksiyon de jetonCoz gibi ASLA fırlatmaz — her arıza null'a
 * (yetkisiz) çevrilir.
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

  let r
  try {
    r = await fetch(adres, {
      headers: { authorization: `Bearer ${jeton}`, apikey: env.SUPABASE_ANON_KEY },
    })
  } catch {
    // Ağ arızası (Supabase erişilemez, DNS, vb.) — yetkisiz say, fırlatma.
    return null
  }
  if (!r.ok) return null

  let satirlar
  try {
    satirlar = await r.json()
  } catch {
    // Beklenmeyen/bozuk gövde — yetkisiz say, fırlatma.
    return null
  }
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
