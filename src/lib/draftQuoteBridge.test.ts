import { describe, it, expect } from 'vitest'
import {
  buildDraftOpts, draftMissingNote, deriveUnitCost, firstImagePath,
  type DraftLineInput,
} from './draftQuoteBridge'
import type { MarginTier } from './pricing'

// İki kademe: 1+ → %100 marj, 200+ → %50 marj.
const TIERS: MarginTier[] = [
  { min_quantity: 1, margin_percent: 100 },
  { min_quantity: 200, margin_percent: 50 },
]

describe('buildDraftOpts — normal fiyatlama', () => {
  it('her (ürün × seçili adet) için bir satır üretir, adet kademesine göre marj uygular', () => {
    const lines: DraftLineInput[] = [{ urun: 'Klasik Gömlek', kod: 'GML-1', unitCostUsd: 10, customMargin: null }]
    const { opts, missingProducts } = buildDraftOpts({ lines, quantities: [50, 200], tiers: TIERS, recommendedQty: 50 })
    expect(missingProducts).toEqual([])
    expect(opts).toHaveLength(2)
    // 50 adet → %100 marj → 10 × 2 = 20.00
    expect(opts[0]).toMatchObject({ adet: '50', birim: '20.00', oner: true })
    // 200 adet → %50 marj → 10 × 1.5 = 15.00
    expect(opts[1]).toMatchObject({ adet: '200', birim: '15.00', oner: false })
  })

  it('ürüne özel marj kademeleri ezer', () => {
    const lines: DraftLineInput[] = [{ urun: 'X', kod: 'X', unitCostUsd: 10, customMargin: 20 }]
    const { opts } = buildDraftOpts({ lines, quantities: [500], tiers: TIERS, recommendedQty: 50 })
    expect(opts[0]!.birim).toBe('12.00') // 10 × 1.2
  })

  it('adetleri tekilleştirip artan sıralar', () => {
    const lines: DraftLineInput[] = [{ urun: 'X', kod: 'X', unitCostUsd: 10, customMargin: null }]
    const { opts } = buildDraftOpts({ lines, quantities: [500, 50, 50], tiers: TIERS, recommendedQty: 50 })
    expect(opts.map((o) => o.adet)).toEqual(['50', '500'])
  })
})

// KURAL 2 — maliyeti eksik ürün: fiyat BOŞ, sessizce 0 YAZILMAZ, uyarı görünür.
describe('buildDraftOpts — maliyeti eksik ürün (Kural 2)', () => {
  it('birim BOŞ gelir (0 değil), oner=false ve ürün missingProducts’a girer', () => {
    const lines: DraftLineInput[] = [{ urun: 'Kaban', kod: 'KBN-9', unitCostUsd: null, customMargin: null }]
    const { opts, missingProducts } = buildDraftOpts({ lines, quantities: [50, 200], tiers: TIERS, recommendedQty: 50 })
    expect(missingProducts).toEqual(['Kaban'])
    for (const o of opts) {
      expect(o.birim).toBe('')
      expect(o.birim).not.toBe('0')
      expect(o.birim).not.toBe('0.00')
      expect(o.oner).toBe(false)
    }
  })

  it('maliyetli ve maliyetsiz ürün bir arada — yalnız maliyetsiz boş kalır', () => {
    const lines: DraftLineInput[] = [
      { urun: 'A', kod: 'A', unitCostUsd: 10, customMargin: null },
      { urun: 'B', kod: 'B', unitCostUsd: null, customMargin: null },
    ]
    const { opts, missingProducts } = buildDraftOpts({ lines, quantities: [50], tiers: TIERS, recommendedQty: 50 })
    expect(missingProducts).toEqual(['B'])
    expect(opts.find((o) => o.detay === 'A')!.birim).toBe('20.00')
    expect(opts.find((o) => o.detay === 'B')!.birim).toBe('')
  })

  it('draftMissingNote uyarı metni üretir; eksik yoksa boş döner', () => {
    expect(draftMissingNote([])).toBe('')
    const note = draftMissingNote(['Kaban', 'Mont'])
    expect(note).toContain('Kaban, Mont')
    expect(note).toContain('maliyet')
  })
})

describe('deriveUnitCost — birim fiyattan ham maliyeti geri türet', () => {
  it('varsayılan %40 marjı geri alır', () => {
    expect(deriveUnitCost(14, 40)).toBeCloseTo(10, 6)
  })
  it('null / geçersiz girdi → null', () => {
    expect(deriveUnitCost(null, 40)).toBeNull()
    expect(deriveUnitCost(undefined, 40)).toBeNull()
    expect(deriveUnitCost(NaN, 40)).toBeNull()
  })
  it('marj 0 → maliyet = birim fiyat', () => {
    expect(deriveUnitCost(10, 0)).toBe(10)
  })
})

// KURAL 1 — katalog ürünü eşleşmemiş / görsel yok → belge görselsiz açılır (null), hata yok.
describe('firstImagePath — görsel seçimi (Kural 1)', () => {
  it('görsel yoksa null döner (belge görselsiz açılır)', () => {
    expect(firstImagePath(null)).toBeNull()
    expect(firstImagePath(undefined)).toBeNull()
    expect(firstImagePath([])).toBeNull()
  })
  it('tüm path’ler boşsa null döner', () => {
    expect(firstImagePath([{ sort_order: 0, storage_path: null }])).toBeNull()
  })
  it('sort_order en küçük dolu path’i seçer', () => {
    expect(firstImagePath([
      { sort_order: 2, storage_path: 'b.png' },
      { sort_order: 0, storage_path: 'a.png' },
      { sort_order: 1, storage_path: null },
    ])).toBe('a.png')
  })
})
