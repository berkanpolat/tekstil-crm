// P8A — Taslak teklif → fiyat_teklifi belgesi KÖPRÜSÜ (saf çekirdek).
// build_draft_quote kendi formatında data üretir; fiyat_teklifi şablonu {tkS:{opts…}} bekler.
// Bu modül aradaki eşlemenin SAF (DB'siz) kısmıdır → birim testli. Async/DB kısmı
// useDocuments.buildDraftQuotePrefill içindedir.
//
// KURALLAR (proje sahibi, P8A):
//  1) Katalog ürünü eşleşmemişse görsel yok → belge görselsiz açılır (firstImagePath → null).
//  2) Maliyeti eksik ürün → fiyat satırı BOŞ ('' ) gelir; ASLA sessizce 0 yazılmaz. Ürün adı
//     missingProducts'a girer, belgeye uyarı notu düşer (draftMissingNote).
import { priceForQuantity, marginForQuantity, type MarginTier } from './pricing'

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

// ─────────────────────────────────────────────────────────────────────────────
// B1 — Otomatik teklif: ÜRÜN-GRUBU veri yapısı + maliyet kapısı (saf çekirdek).
//
// Eski `opts` düz listesiydi (her ürün×adet ayrı satır, gruplama yok). Otomatik
// teklifte belge "her ürün ayrı sayfa, o sayfada 3 marj kademesi birlikte" olacak
// (B2 şablonu). Bu yüzden veri de ürün-gruplu tutulur: her ürün = bir grup, altında
// sabit 3 kademe (50/%40, 200/%30, 500/%25 — marj DB'deki margin_tiers'tan gelir).
//
// Maliyet kapısı (proje sahibi kararı, Q6):
//  • Hepsi eksik → teklif OLUŞMAZ ('none').
//  • Kısmi eksik → UYAR, çalışan seçsin ('partial'); eksik ürünler adıyla döner.
//  • Hepsi maliyetli → otomatik oluşur ('all_costed').
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Son çare adet kademeleri — YALNIZCA margin_tiers boş/okunamaz olduğunda kullanılır.
 * Normal akışta adet kademeleri margin_tiers.min_quantity'den CANLI türetilir
 * (`quantitiesFromTiers`), böylece Ayarlar → Fiyatlandırma'dan kademe eklenince/değişince
 * teklif otomatik yeni kademelerle üretilir (sayı 3'e sabit DEĞİL).
 */
export const TEKLIF_ADET_KADEMELERI_FALLBACK = [50, 200, 500] as const

/** margin_tiers → adet kademeleri: her kademenin min_quantity'si bir adet kolonu olur (benzersiz, artan). */
export function quantitiesFromTiers(tiers: MarginTier[]): number[] {
  const qs = [...new Set((tiers ?? []).map((t) => t.min_quantity))]
    .filter((q) => Number.isFinite(q) && q > 0)
    .sort((a, b) => a - b)
  return qs.length ? qs : [...TEKLIF_ADET_KADEMELERI_FALLBACK]
}

/** Bir ürün sayfasındaki tek marj kademesi satırı. */
export interface QuoteTier {
  adet: number
  /** Bu adete uygulanan marj (%). */
  marj: number
  /** Birim fiyat (USD, string). Maliyet eksikse '' — 0 DEĞİL. */
  birim: string
  /** Kademe toplamı (USD, string) = birim × adet. Maliyet eksikse ''. */
  tutar: string
  /** "Önerilen" kademe (opsiyonel vurgu). */
  oner: boolean
}

/** Belgede bir ürün grubu (kendi sayfası + 3 kademe). */
export interface QuoteProduct {
  urun: string
  kod: string | null
  /** Ait olduğu talep kodu — çoklu talep birleştirmede sayfa bölüm göstergesi (B4). Tek talepte boş. */
  talep?: string
  /** Kumaş/kompozisyon (varsa). */
  kumas: string
  /** Görsel (data URL) + en/boy oranı — async katmanda doldurulur (saf çekirdek boş bırakır). */
  foto?: string
  fotoAR?: number
  /** Bu ürünün maliyeti çalışılmamış (kademelerde birim '' gelir). */
  maliyetEksik: boolean
  kademeler: QuoteTier[]
}

export type CostGateStatus = 'all_costed' | 'partial' | 'none'

/** Maliyet kapısı sonucu — UI kararı (üret / uyar-seç / durdur) buna dayanır. */
export interface CostGate {
  status: CostGateStatus
  /** Toplam ürün sayısı. */
  total: number
  /** Maliyeti olan ürün sayısı. */
  costedCount: number
  /** Maliyeti eksik ürün sayısı. */
  missingCount: number
  /** Maliyeti eksik ürün adları (kullanıcıya adıyla gösterilir). */
  missingProducts: string[]
  /** Maliyeti olan ürün adları. */
  costedProducts: string[]
}

export interface BuildQuoteProductsInput {
  lines: DraftLineInput[]
  /** Adet kademeleri. Verilmezse margin_tiers'tan türetilir (quantitiesFromTiers). */
  quantities?: number[]
  tiers: MarginTier[]
  /** "Önerilen" işaretlenecek adet (opsiyonel; verilmezse hiçbiri önerilmez). */
  recommendedQty?: number | null
}

export interface BuildQuoteProductsResult {
  products: QuoteProduct[]
  gate: CostGate
}

/** Adetleri belirle: verilmişse benzersiz+artan; verilmemişse margin_tiers'tan türet. */
function resolveQuantities(quantities: number[] | undefined, tiers: MarginTier[]): number[] {
  if (quantities == null) return quantitiesFromTiers(tiers)
  const qs = [...new Set(quantities)].filter((q) => Number.isFinite(q) && q > 0).sort((a, b) => a - b)
  return qs.length ? qs : quantitiesFromTiers(tiers)
}

/**
 * Taslak kalemleri → ürün-gruplu teklif verisi + maliyet kapısı.
 * Her ürün için her adet kademesinde marj (marginForQuantity) uygulanır; maliyet eksikse
 * o ürünün tüm kademelerinde birim/tutar '' gelir ve ürün gate.missingProducts'a girer.
 */
export function buildQuoteProducts(input: BuildQuoteProductsInput): BuildQuoteProductsResult {
  const qtys = resolveQuantities(input.quantities, input.tiers)
  const products: QuoteProduct[] = []
  const missing: string[] = []
  const costed: string[] = []

  for (const line of input.lines) {
    const costMissing = line.unitCostUsd == null || !Number.isFinite(line.unitCostUsd)
    if (costMissing) missing.push(line.urun)
    else costed.push(line.urun)

    const kademeler: QuoteTier[] = qtys.map((qty) => {
      if (costMissing) {
        return { adet: qty, marj: marginForQuantity(qty, input.tiers, line.customMargin), birim: '', tutar: '', oner: false }
      }
      const p = priceForQuantity(line.unitCostUsd as number, qty, input.tiers, line.customMargin)
      return {
        adet: qty,
        marj: p.marginPercent,
        birim: p.unitPrice.toFixed(2),
        tutar: p.total.toFixed(2),
        oner: input.recommendedQty != null && qty === input.recommendedQty,
      }
    })

    products.push({ urun: line.urun, kod: line.kod, kumas: '', maliyetEksik: costMissing, kademeler })
  }

  return finalizeQuoteProducts(products, input.lines.length, missing, costed)
}

/** Ürün listesini maliyet durumuna göre süz: skipMissing → maliyeti eksikler çıkarılır. */
export function selectQuoteProducts(products: QuoteProduct[], skipMissing?: boolean): QuoteProduct[] {
  return skipMissing ? products.filter((p) => !p.maliyetEksik) : products
}

/** B4 — bir talebin ürünleri (kod = talep kodu; birleştirmede bölüm + eksik-uyarı etiketinde kullanılır). */
export interface QuoteSource { code: string; products: QuoteProduct[] }

/**
 * Çoklu talebi TEK teklife birleştirir (saf). Her ürün kendi talep koduyla etiketlenir
 * (sayfa bölüm göstergesi). Maliyet kapısı TÜM talepler için birlikte çalışır; eksik/dolu
 * ürünler "TALEP_KODU — Ürün Adı" biçiminde raporlanır (uyarı o talebin adıyla çıksın).
 * Seçim/talep sırası korunur.
 */
export function combineQuoteSources(sources: QuoteSource[]): BuildQuoteProductsResult {
  const products: QuoteProduct[] = []
  const missing: string[] = []
  const costed: string[] = []
  for (const s of sources) {
    for (const p of s.products) {
      products.push({ ...p, talep: s.code })
      const label = `${s.code} — ${p.urun}`
      if (p.maliyetEksik) missing.push(label)
      else costed.push(label)
    }
  }
  return finalizeQuoteProducts(products, products.length, missing, costed)
}

/** products + eksik/dolu listelerinden gate'i kurar (buildQuoteProducts sonu). */
function finalizeQuoteProducts(products: QuoteProduct[], total: number, missing: string[], costed: string[]): BuildQuoteProductsResult {
  const missingCount = missing.length
  const status: CostGateStatus =
    total === 0 || missingCount === total ? 'none' : missingCount > 0 ? 'partial' : 'all_costed'

  return {
    products,
    gate: { status, total, costedCount: costed.length, missingCount, missingProducts: missing, costedProducts: costed },
  }
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
