/**
 * Telefon ve e-posta normalizasyonu — SAF mantık. Mükerrer tespiti ve aramanın
 * temeli. `0532 123 45 67`, `+90 532 123 4567` ve `905321234567` AYNI numaradır;
 * normalize edilmezse mükerrer tespiti hiç çalışmaz.
 *
 * Türkiye numaraları E.164'e (`+90...`) çevrilir; yurt dışı numaraları (+ önekli
 * veya 00 ile) da desteklenir. `value_normalized` alanında saklanır (indexli).
 */

/**
 * Ham telefon girdisini E.164'e normalize eder. Çözülemezse null.
 * Örnekler: '0532 123 45 67' → '+905321234567', '+1 (415) 555-2671' → '+14155552671'.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  const hadPlus = trimmed.startsWith('+')
  let digits = trimmed.replace(/\D/g, '')
  if (!digits) return null

  // Uluslararası çıkış öneki 00 → +
  if (!hadPlus && digits.startsWith('00')) {
    digits = digits.slice(2)
    return digits ? '+' + digits : null
  }

  // Açıkça uluslararası (+ ile başlıyor) → olduğu gibi E.164
  if (hadPlus) return '+' + digits

  // --- Türkiye kalıpları (ülke kodu 90) ---
  // 90 5xx xxx xx xx  (12 hane)
  if (digits.length === 12 && digits.startsWith('90')) return '+' + digits
  // 0 5xx xxx xx xx   (11 hane, baştaki 0 atılır)
  if (digits.length === 11 && digits.startsWith('0')) return '+90' + digits.slice(1)
  // 5xx xxx xx xx / 2xx... (10 hane) → Türkiye (mobil veya sabit)
  if (digits.length === 10) return '+90' + digits

  // Ülke kodlu ama + olmadan gelmiş olabilir (7-15 hane) → best-effort E.164
  if (digits.length >= 8 && digits.length <= 15) return '+' + digits

  return null
}

/** İki telefonun aynı numara olup olmadığı (normalize ederek). */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePhone(a)
  const nb = normalizePhone(b)
  return na !== null && na === nb
}

/** Türkiye numarasını okunur biçimde gösterir (0532 123 45 67). Değilse E.164. */
export function formatPhoneTR(e164: string | null | undefined): string {
  if (!e164) return ''
  if (e164.startsWith('+90') && e164.length === 13) {
    const d = e164.slice(3) // 10 hane
    return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`
  }
  return e164
}

/** E-posta normalizasyonu: küçük harf + kırpma. Geçersizse null. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase()
  if (!s) return null
  // Kaba geçerlilik: tek @ ve nokta içeren alan adı.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null
  return s
}

/** İletişim noktası tipine göre normalize eder (dedup/arama için). */
export function normalizeContactValue(
  type: 'phone' | 'whatsapp' | 'email' | 'instagram' | 'telegram' | 'website',
  value: string | null | undefined,
): string | null {
  if (type === 'phone' || type === 'whatsapp') return normalizePhone(value)
  if (type === 'email') return normalizeEmail(value)
  if (type === 'instagram' || type === 'telegram') {
    // @ ve boşlukları at, küçük harfe çevir
    const s = (value ?? '').trim().toLowerCase().replace(/^@+/, '')
    return s || null
  }
  if (type === 'website') {
    const s = (value ?? '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '')
    return s || null
  }
  return (value ?? '').trim().toLowerCase() || null
}

/** İletişim değerini tıklanabilir bağlantıya çevirir (yeni sekmede açılır). */
export function contactHref(
  type: 'phone' | 'whatsapp' | 'email' | 'instagram' | 'telegram' | 'website',
  value: string | null | undefined,
): string | null {
  const raw = (value ?? '').trim()
  if (!raw) return null
  if (type === 'phone') return `tel:${normalizePhone(raw) ?? raw.replace(/[^\d+]/g, '')}`
  if (type === 'whatsapp') { const p = normalizePhone(raw) ?? raw; return `https://wa.me/${p.replace(/[^\d]/g, '')}` }
  if (type === 'email') return `mailto:${raw}`
  if (type === 'instagram') return `https://instagram.com/${raw.replace(/^@+/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/+$/, '')}`
  if (type === 'telegram') return `https://t.me/${raw.replace(/^@+/, '')}`
  if (type === 'website') return /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`
  return null
}

/** İletişim değerinin ekranda gösterilecek kısa biçimi (instagram için @kullanıcı). */
export function contactDisplay(
  type: 'phone' | 'whatsapp' | 'email' | 'instagram' | 'telegram' | 'website',
  value: string | null | undefined,
): string {
  const raw = (value ?? '').trim()
  if (type === 'instagram') return '@' + raw.replace(/^@+/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/+$/, '')
  if (type === 'website') return raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  return raw
}
