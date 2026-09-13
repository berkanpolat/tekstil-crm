import { describe, it, expect } from 'vitest'
import {
  buildDraftOpts, draftMissingNote, deriveUnitCost, firstImagePath,
  buildQuoteProducts, TEKLIF_ADET_KADEMELERI,
  type DraftLineInput,
} from './draftQuoteBridge'
import type { MarginTier } from './pricing'

// İki kademe: 1+ → %100 marj, 200+ → %50 marj.
const TIERS: MarginTier[] = [
  { min_quantity: 1, margin_percent: 100 },
  { min_quantity: 200, margin_percent: 50 },
]

// Otomatik teklifin üretim kademeleri: 50/%40, 200/%30, 500/%25 (canlı margin_tiers).
const TIERS_PROD: MarginTier[] = [
  { min_quantity: 50, margin_percent: 40 },
  { min_quantity: 200, margin_percent: 30 },
  { min_quantity: 500, margin_percent: 25 },
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

// B1 — Otomatik teklif: ürün-grubu veri yapısı + maliyet kapısı.
describe('buildQuoteProducts — ürün-grubu yapı + 3 kademe', () => {
  it('her ürün için sabit 3 kademe (50/%40, 200/%30, 500/%25) üretir', () => {
    const lines: DraftLineInput[] = [{ urun: 'Gömlek', kod: 'GML', unitCostUsd: 10, customMargin: null }]
    const { products } = buildQuoteProducts({ lines, tiers: TIERS_PROD })
    expect(products).toHaveLength(1)
    const p = products[0]!
    expect(p.maliyetEksik).toBe(false)
    expect(p.kademeler.map((k) => k.adet)).toEqual([50, 200, 500])
    expect(p.kademeler.map((k) => k.marj)).toEqual([40, 30, 25])
    // 50→10×1.4=14.00 (700), 200→10×1.3=13.00 (2600), 500→10×1.25=12.50 (6250)
    expect(p.kademeler.map((k) => k.birim)).toEqual(['14.00', '13.00', '12.50'])
    expect(p.kademeler.map((k) => k.tutar)).toEqual(['700.00', '2600.00', '6250.00'])
  })

  it('adet verilmezse varsayılan kademelere düşer', () => {
    const { products } = buildQuoteProducts({ lines: [{ urun: 'X', kod: 'X', unitCostUsd: 10, customMargin: null }], tiers: TIERS_PROD })
    expect(products[0]!.kademeler.map((k) => k.adet)).toEqual([...TEKLIF_ADET_KADEMELERI])
  })

  it('recommendedQty verilen kademeyi öner işaretler; verilmezse hiçbiri', () => {
    const lines: DraftLineInput[] = [{ urun: 'X', kod: 'X', unitCostUsd: 10, customMargin: null }]
    const withRec = buildQuoteProducts({ lines, tiers: TIERS_PROD, recommendedQty: 200 })
    expect(withRec.products[0]!.kademeler.map((k) => k.oner)).toEqual([false, true, false])
    const noRec = buildQuoteProducts({ lines, tiers: TIERS_PROD })
    expect(noRec.products[0]!.kademeler.every((k) => !k.oner)).toBe(true)
  })

  it('ürüne özel marj tüm kademeleri ezer', () => {
    const lines: DraftLineInput[] = [{ urun: 'X', kod: 'X', unitCostUsd: 10, customMargin: 20 }]
    const { products } = buildQuoteProducts({ lines, tiers: TIERS_PROD })
    expect(products[0]!.kademeler.map((k) => k.marj)).toEqual([20, 20, 20])
    expect(products[0]!.kademeler.map((k) => k.birim)).toEqual(['12.00', '12.00', '12.00'])
  })
})

describe('buildQuoteProducts — maliyet kapısı (Q6)', () => {
  it('hepsi maliyetli → all_costed', () => {
    const { gate } = buildQuoteProducts({ lines: [
      { urun: 'A', kod: 'A', unitCostUsd: 10, customMargin: null },
      { urun: 'B', kod: 'B', unitCostUsd: 5, customMargin: null },
    ], tiers: TIERS_PROD })
    expect(gate.status).toBe('all_costed')
    expect(gate).toMatchObject({ total: 2, costedCount: 2, missingCount: 0, missingProducts: [] })
  })

  it('kısmi eksik → partial + eksik ürün adıyla döner, kademeleri boş', () => {
    const { products, gate } = buildQuoteProducts({ lines: [
      { urun: 'A', kod: 'A', unitCostUsd: 10, customMargin: null },
      { urun: 'Kaban', kod: 'KBN', unitCostUsd: null, customMargin: null },
    ], tiers: TIERS_PROD })
    expect(gate.status).toBe('partial')
    expect(gate.missingProducts).toEqual(['Kaban'])
    expect(gate.costedProducts).toEqual(['A'])
    const kaban = products.find((p) => p.urun === 'Kaban')!
    expect(kaban.maliyetEksik).toBe(true)
    // Maliyet eksik → birim/tutar '' (0 DEĞİL), ama marj kademesi yine görünür
    for (const k of kaban.kademeler) { expect(k.birim).toBe(''); expect(k.tutar).toBe(''); expect(k.birim).not.toBe('0.00') }
    expect(kaban.kademeler.map((k) => k.marj)).toEqual([40, 30, 25])
  })

  it('hepsi eksik → none (teklif oluşmaz)', () => {
    const { gate } = buildQuoteProducts({ lines: [
      { urun: 'A', kod: 'A', unitCostUsd: null, customMargin: null },
      { urun: 'B', kod: 'B', unitCostUsd: null, customMargin: null },
    ], tiers: TIERS_PROD })
    expect(gate.status).toBe('none')
    expect(gate.missingProducts).toEqual(['A', 'B'])
  })

  it('ürün yok → none (counts 0)', () => {
    const { products, gate } = buildQuoteProducts({ lines: [], tiers: TIERS_PROD })
    expect(products).toEqual([])
    expect(gate).toMatchObject({ status: 'none', total: 0, costedCount: 0, missingCount: 0 })
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
