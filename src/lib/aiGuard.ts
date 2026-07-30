/**
 * YZ veri güvenliği guard'ı (P6.6). Maliyet/finans/iç-not modele ASLA gitmez.
 * Ana koruma İZİN-LİSTESİ (aiPayloads yalnız izinli alanı kurar); bu guard ikinci kattır:
 * payload'da yasak ANAHTAR (finance/cost/internal alan adı) görürse çağrı reddedilir.
 * Anahtar-taraması yapılır (serbest metin DEĞİL) — kullanıcının yazdığı nota takılmaz,
 * ama birinin kartın tamamını (bakiye/maliyet/iç not alanlarıyla) payload'a koymasını yakalar.
 * Aynı liste edge function'da da vardır (Deno import edemez → çoğaltılmıştır).
 */
export const AI_FORBIDDEN_KEYS: string[] = [
  'internalnote', 'internal_note', 'is_internal',
  'cost', 'unit_cost', 'total_cost', 'total_cost_try', 'total_cost_usd', 'product_cost', 'cost_id', 'costitems', 'cost_items',
  'margin', 'margin_percent', 'custom_margin_percent',
  'amount_try', 'amount_usd', 'balance_try', 'balance_usd', 'unit_price', 'exchange_rate', 'usd_rate',
  'account_transaction', 'account_transactions', 'payments', 'payment', 'odeme', 'tahsilat', 'ciro', 'bakiye',
]

/** Payload'daki tüm ANAHTAR adlarını (iç içe) yasak listeye göre tara. Değerlere bakmaz. */
export function scanForbiddenKeys(value: unknown): string[] {
  const hits = new Set<string>()
  const walk = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(walk); return }
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        const kl = k.toLowerCase().replace(/[^a-z_]/g, '')
        if (AI_FORBIDDEN_KEYS.includes(kl)) hits.add(k)
        walk(val)
      }
    }
  }
  walk(value)
  return [...hits]
}

/** Guard: yasak anahtar varsa fırlat (edge fn ve istemci ön-kontrolü için). */
export function assertNoForbidden(payload: unknown): void {
  const hits = scanForbiddenKeys(payload)
  if (hits.length) throw new Error(`YZ güvenlik: yasak alan(lar) payload'da: ${hits.join(', ')}`)
}
