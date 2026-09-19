// Belge sızıntı koruması — müşteriye giden PDF/önizlemeden iç veriyi ÖZYİNELEMELİ ayıklar.
// (P4A iç-not koruması + PAKET F maliyet/marj gizliliği.)
//
// KURAL: aşağıdaki anahtarlar HER SEVİYEDE (iç içe nesne/dizi dahil) çıktıdan düşer:
//   • 'internalNote'            — iç not
//   • '_' ile başlayan          — editör-içi/geçici + maliyet iç kanalı (ör. _maliyet, _marj)
//   • SENSITIVE (maliyet/marj)  — kaynak yanlışlıkla üst düzey koymuş olsa bile
// Şablonlar bu alanları okumaz; bu ayıklama İKİNCİ güvenlik katmanıdır. stripInternal
// SIĞ olsaydı (eski hâli) iç içe opsiyon/kademe maliyeti müşteriye sızardı — bu yüzden özyineli.

/** Maliyet/kâr/marj anlamı taşıyan, müşteriye ASLA gitmemesi gereken düz anahtarlar. */
export const SENSITIVE_KEYS = new Set<string>([
  'marj', 'maliyet', 'maliyetItems', 'kar', 'kazanc',
  'unit_cost', 'margin_percent', 'margin', 'cost', 'profit',
])

function isInternalKey(k: string): boolean {
  return k === 'internalNote' || k.startsWith('_') || SENSITIVE_KEYS.has(k)
}

function stripDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDeep)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isInternalKey(k)) continue
      out[k] = stripDeep(v)
    }
    return out
  }
  return value
}

/**
 * İç/hassas alanları HER SEVİYEDE ayıklar. documents.data (iç not + _-önekli + maliyet/marj)
 * korunur ama PDF/önizleme verisinden çıkarılır.
 */
export function stripInternal(data: Record<string, unknown>): Record<string, unknown> {
  return stripDeep(data) as Record<string, unknown>
}
