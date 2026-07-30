// P4B — Maliyet ve fiyat hesabı ÇEKİRDEĞİ. Saf fonksiyonlar (UI + belge aynı kaynağı kullanır).
// Yanlış hesap = müşteriye yanlış fiyat → her adım birim testli (pricing.test.ts).
//
// KARARLAR / VARSAYIMLAR (docs/faz-4b-hesaplar.md ile birebir):
//  • Maliyet reçetesi BİRİM (adet) başınadır. Kumaş X metre × birim fiyat, diğerleri sabit tutar.
//  • Her kalemin kendi para birimi; toplam güncel kurla TL'ye çevrilip toplanır. USD = TL / USD_kuru.
//  • Kur = TCMB Döviz Satış × (1 + güvenlik payı/100). Güvenlik payı varsayılan %0.
//  • Kâr marjı MALİYET ÜSTÜ eklemedir: birim fiyat = birim maliyet × (1 + marj/100). (100+%25=125)
//  • Adet kademeleri ARALIK mantığı: min_quantity artan; adet için min_quantity ≤ adet olan EN BÜYÜK
//    kademe geçerli. Adet en küçük kademenin altındaysa en küçük kademe uygulanır (MOQ zaten koruyor).
//  • Ürüne özel marj (custom_margin_percent) doluysa kademeleri EZER.

/** currency → 1 birimin TL karşılığı (TRY:1). Güvenlik payı bu haritaya işlenmiş gelir. */
export type Rates = Record<string, number>

export interface CostItem {
  calculation_type: 'metre_fiyat' | 'sabit'
  quantity?: number | null
  unit_price?: number | null
  amount?: number | null
  currency: string
}

export interface MarginTier { min_quantity: number; margin_percent: number }

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

/** Tutarı TL'ye çevirir. Bilinmeyen para birimi → 1 (TL varsayılır). */
export function toTry(amount: number, currency: string, rates: Rates): number {
  return num(amount) * (rates[currency] ?? 1)
}

/** Bir maliyet kaleminin KENDİ para birimindeki tutarı (metre×fiyat veya sabit). */
export function costItemAmount(item: CostItem): number {
  if (item.calculation_type === 'metre_fiyat') return num(item.quantity) * num(item.unit_price)
  return num(item.amount)
}

/** Reçete toplamı: her kalem kendi kurundan TL'ye çevrilip toplanır; USD = TL / USD_kuru. */
export function sumCost(items: CostItem[], rates: Rates): { totalTry: number; totalUsd: number } {
  let totalTry = 0
  for (const it of items) totalTry += toTry(costItemAmount(it), it.currency, rates)
  const usdRate = rates.USD || 0
  return { totalTry, totalUsd: usdRate > 0 ? totalTry / usdRate : 0 }
}

/**
 * Adet için geçerli marj (%). custom doluysa onu döndürür. Aksi halde ARALIK mantığı:
 * min_quantity ≤ qty olan en büyük kademe; hiçbiri değilse en küçük kademe.
 */
export function marginForQuantity(qty: number, tiers: MarginTier[], custom?: number | null): number {
  if (custom != null && Number.isFinite(custom)) return num(custom)
  if (!tiers.length) return 0
  const sorted = [...tiers].sort((a, b) => a.min_quantity - b.min_quantity)
  let chosen = sorted[0]! // qty en küçük eşiğin altındaysa en küçük kademe
  for (const t of sorted) if (qty >= t.min_quantity) chosen = t
  return chosen.margin_percent
}

/** Maliyet üstü satış fiyatı: birim maliyet × (1 + marj/100). */
export function unitSalePrice(unitCost: number, marginPercent: number): number {
  return num(unitCost) * (1 + num(marginPercent) / 100)
}

export interface TierRow { quantity: number; unitCost: number; marginPercent: number; unitPrice: number; total: number }

/** Ürün kartı fiyat kademeleri tablosu (birim maliyet sabit; marj kademeye göre). */
export function tierRows(unitCost: number, tiers: MarginTier[], custom?: number | null): TierRow[] {
  const sorted = [...tiers].sort((a, b) => a.min_quantity - b.min_quantity)
  return sorted.map((t) => {
    const marginPercent = custom != null && Number.isFinite(custom) ? num(custom) : t.margin_percent
    const unitPrice = unitSalePrice(unitCost, marginPercent)
    return { quantity: t.min_quantity, unitCost: num(unitCost), marginPercent, unitPrice, total: unitPrice * t.min_quantity }
  })
}

/** Belirli bir adet için tek satır fiyat (tek-tuş teklif). */
export function priceForQuantity(unitCost: number, qty: number, tiers: MarginTier[], custom?: number | null): { marginPercent: number; unitPrice: number; total: number } {
  const marginPercent = marginForQuantity(qty, tiers, custom)
  const unitPrice = unitSalePrice(unitCost, marginPercent)
  return { marginPercent, unitPrice, total: unitPrice * qty }
}

/** Güvenlik paylı efektif USD/EUR/GBP kur haritası (ham kur + %pay). TRY:1. */
export function buildRates(raw: { USD?: number | null; EUR?: number | null; GBP?: number | null }, safetyPercent = 0): Rates {
  const f = 1 + num(safetyPercent) / 100
  return { TRY: 1, USD: num(raw.USD) * f, EUR: num(raw.EUR) * f, GBP: num(raw.GBP) * f }
}
