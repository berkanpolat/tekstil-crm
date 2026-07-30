/**
 * Para gösterim yardımcıları (Faz 5). Hesap DEĞİL, yalnız biçimlendirme.
 * Hesap çekirdeği DB'de (account_transactions, customer_balance) ve saf test edilir.
 */

const SYMBOL: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' }

/** 12345.6 → "12.345,60 ₺" (tr-TR grup/ondalık). currency simgesi sona gelir. */
export function formatMoney(amount: number | null | undefined, currency = 'TRY'): string {
  const n = Number(amount ?? 0)
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  return `${s} ${SYMBOL[currency] ?? currency}`
}

/** ISO tarih (2026-07-28 veya tam timestamp) → "28.07.2026" (TR). Boşsa "—". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = String(iso).slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}.${d[1]}.${d[0]}` : String(iso)
}

/** Bakiye için işaretli gösterim; negatif = müşteri borçlu (kırmızı). */
export function balanceTone(amount: number): 'debt' | 'credit' | 'zero' {
  if (amount < -0.005) return 'debt'
  if (amount > 0.005) return 'credit'
  return 'zero'
}

/**
 * Türkçe/uluslararası ondalık girişi güvenle sayıya çevirir. Hem virgül hem
 * nokta ondalık ayıracı kabul eder; binlik ayıraçları atar. Boş/geçersiz → null.
 *   "45,50" → 45.5 · "1.234,56" → 1234.56 · "1,234.56" → 1234.56 · "45.50" → 45.5
 * Kural: en sağdaki ayıraç ondalıktır; soldakiler binliktir.
 */
export function parseDecimal(input: string | number | null | undefined): number | null {
  if (input == null) return null
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  let s = String(input).trim().replace(/\s/g, '').replace(/[^\d.,-]/g, '')
  if (!s || s === '-' || s === '.' || s === ',') return null
  const neg = s.startsWith('-')
  s = s.replace(/-/g, '')
  const hasComma = s.includes(','), hasDot = s.includes('.')
  let n: number
  if (hasComma && hasDot) {
    // İki ayıraç birlikte → en sağdaki ondalık, diğeri binlik.
    const sep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'))
    n = Number(`${s.slice(0, sep).replace(/[.,]/g, '')}.${s.slice(sep + 1).replace(/[.,]/g, '')}`)
  } else if (hasComma) {
    const cnt = (s.match(/,/g) || []).length
    n = cnt > 1 ? Number(s.replace(/,/g, '')) : Number(s.replace(',', '.'))
  } else if (hasDot) {
    const cnt = (s.match(/\./g) || []).length
    const after = s.length - s.lastIndexOf('.') - 1
    // Birden çok nokta VEYA tam 3 haneli grup → binlik ayıraç; aksi halde ondalık.
    n = cnt > 1 || after === 3 ? Number(s.replace(/\./g, '')) : Number(s)
  } else {
    n = Number(s)
  }
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

/** Sayıyı düzenlenebilir metne çevirir (TR ondalık: nokta→virgül). null/NaN → ''. */
export function decimalToText(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return ''
  return String(n).replace('.', ',')
}
