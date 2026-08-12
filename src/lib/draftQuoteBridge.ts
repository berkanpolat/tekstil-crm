// P8A — Taslak teklif → fiyat_teklifi belgesi KÖPRÜSÜ (saf çekirdek).
// build_draft_quote kendi formatında data üretir; fiyat_teklifi şablonu {tkS:{opts…}} bekler.
// Bu modül aradaki eşlemenin SAF (DB'siz) kısmıdır → birim testli. Async/DB kısmı
// useDocuments.buildDraftQuotePrefill içindedir.
//
// KURALLAR (proje sahibi, P8A):
//  1) Katalog ürünü eşleşmemişse görsel yok → belge görselsiz açılır (firstImagePath → null).
//  2) Maliyeti eksik ürün → fiyat satırı BOŞ ('' ) gelir; ASLA sessizce 0 yazılmaz. Ürün adı
//     missingProducts'a girer, belgeye uyarı notu düşer (draftMissingNote).
import { priceForQuantity, type MarginTier } from './pricing'

/** Köprüye giren tek ürün satırı (taslak + katalog türevi). */
export interface DraftLineInput {
  urun: string
  kod: string | null
  /** Ham birim maliyet (USD). null → maliyeti çalışılmamış ürün. */
  unitCostUsd: number | null
  /** Ürüne özel marj (%) — doluysa kademeleri ezer. */
  customMargin: number | null
}

/** fiyat_teklifi şablonundaki tek "Üretim Seçeneği" satırı (tkS.opts[i]). */
export interface DraftOptRow {
  detay: string
  kumas: string
  adet: string
  /** Birim fiyat (USD, string). Maliyet eksikse '' — 0 DEĞİL. */
  birim: string
  oner: boolean
}

export interface BuildOptsInput {
  lines: DraftLineInput[]
  /** Seçili adet kademeleri (ör. [50, 200, 500]). Her biri × her ürün → bir opt satırı. */
  quantities: number[]
  tiers: MarginTier[]
  /** "Önerilen" işaretlenecek adet (taslak adet_kademesi = intake.draft_quote_qty). */
  recommendedQty: number
}

export interface BuildOptsResult {
  opts: DraftOptRow[]
  /** Maliyeti eksik ürün adları (belgeye uyarı notu için). */
  missingProducts: string[]
}

/**
 * Taslak kalemleri → fiyat teklifi "Üretim Seçenekleri" satırları.
 * Her (ürün × seçili adet) bir satır. Fiyat, pricing çekirdeğinin tek-adet biçimi olan
 * priceForQuantity ile üretilir (= marginForQuantity + unitSalePrice; tierRows'un o adetteki karşılığı).
 * Maliyet eksik → birim '' (boş), oner=false; ürün missingProducts'a eklenir.
 */
export function buildDraftOpts(input: BuildOptsInput): BuildOptsResult {
  const qtys = [...new Set(input.quantities)].filter((q) => Number.isFinite(q) && q > 0).sort((a, b) => a - b)
  const opts: DraftOptRow[] = []
  const missing = new Set<string>()
  for (const line of input.lines) {
    const costMissing = line.unitCostUsd == null || !Number.isFinite(line.unitCostUsd)
    if (costMissing) missing.add(line.urun)
    for (const qty of qtys) {
      let birim = ''
      if (!costMissing) {
        const p = priceForQuantity(line.unitCostUsd as number, qty, input.tiers, line.customMargin)
        birim = p.unitPrice.toFixed(2)
      }
      opts.push({
        detay: line.urun,
        kumas: '',
        adet: String(qty),
        birim,
        oner: !costMissing && qty === input.recommendedQty,
      })
    }
  }
  // Editör en az bir satır bekler (silme min=1).
  if (!opts.length) opts.push({ detay: '', kumas: '', adet: '', birim: '', oner: false })
  return { opts, missingProducts: [...missing] }
}

/** Maliyeti eksik ürünler için belgeye yazılacak uyarı notu (boşsa ''). */
export function draftMissingNote(missingProducts: string[]): string {
  if (!missingProducts.length) return ''
  return `⚠ Şu ürüne/ürünlere maliyet çalışılmamış: ${missingProducts.join(', ')}. Birim fiyat elle girilmelidir.`
}

/**
 * Taslak birim fiyatından ham birim maliyeti geri türet.
 * birim_fiyat = maliyet × (1 + marj/100) → maliyet = birim_fiyat / (1 + marj/100).
 * product_costs'u doğrudan çekmek costs.view RLS'ine takılabilir; taslak fiyatı
 * security definer üretildiği için bu türetme yetkiden bağımsız çalışır.
 */
export function deriveUnitCost(birimFiyat: number | null | undefined, draftMarginPercent: number): number | null {
  if (birimFiyat == null || !Number.isFinite(birimFiyat)) return null
  const f = 1 + (Number(draftMarginPercent) || 0) / 100
  if (f <= 0) return null
  return birimFiyat / f
}

/** Görsel listesinden ilk (sort_order en küçük, dolu path) storage yolu; yoksa null. */
export function firstImagePath(
  images: { sort_order: number; storage_path: string | null }[] | null | undefined,
): string | null {
  if (!images || !images.length) return null
  const sorted = images.filter((i) => !!i.storage_path).sort((a, b) => a.sort_order - b.sort_order)
  return sorted[0]?.storage_path ?? null
}
