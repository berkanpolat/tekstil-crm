import { describe, it, expect } from 'vitest'
import {
  toTry, costItemAmount, sumCost, marginForQuantity, unitSalePrice, tierRows, priceForQuantity,
  buildRates, type CostItem, type MarginTier,
} from '@/lib/pricing'

const TIERS: MarginTier[] = [
  { min_quantity: 50, margin_percent: 25 },
  { min_quantity: 200, margin_percent: 20 },
  { min_quantity: 500, margin_percent: 10 },
]
const RATES = { TRY: 1, USD: 40, EUR: 44, GBP: 50 }

describe('marginForQuantity — aralık (kademe) sınırları', () => {
  // 50→%25 (50-199), 200→%20 (200-499), 500→%10 (500+)
  it.each([
    [49, 25], [50, 25], [51, 25],
    [199, 25], [200, 20], [201, 20],
    [499, 20], [500, 10], [501, 10],
    [1000, 10], [10, 25], // MOQ altı → en küçük kademe
  ])('adet %i → marj %%%i', (qty, expected) => {
    expect(marginForQuantity(qty, TIERS)).toBe(expected)
  })

  it('ürüne özel marj kademeleri ezer', () => {
    expect(marginForQuantity(500, TIERS, 33)).toBe(33)
    expect(marginForQuantity(50, TIERS, 0)).toBe(0)
  })
  it('kademe yoksa 0', () => { expect(marginForQuantity(100, [])).toBe(0) })
  it('sırasız kademelerde de doğru', () => {
    const shuffled = [TIERS[2], TIERS[0], TIERS[1]] as MarginTier[]
    expect(marginForQuantity(200, shuffled)).toBe(20)
  })
})

describe('unitSalePrice — maliyet üstü marj', () => {
  it('100 + %25 = 125', () => { expect(unitSalePrice(100, 25)).toBe(125) })
  it('4 + %25 = 5', () => { expect(unitSalePrice(4, 25)).toBe(5) })
  it('4 + %10 = 4.4', () => { expect(unitSalePrice(4, 10)).toBeCloseTo(4.4, 10) })
  it('%0 marj = maliyet', () => { expect(unitSalePrice(80, 0)).toBe(80) })
})

describe('costItemAmount — metre×fiyat / sabit', () => {
  it('metre_fiyat: 2.5m × 8 = 20', () => {
    expect(costItemAmount({ calculation_type: 'metre_fiyat', quantity: 2.5, unit_price: 8, currency: 'USD' })).toBe(20)
  })
  it('sabit: amount doğrudan', () => {
    expect(costItemAmount({ calculation_type: 'sabit', amount: 15, currency: 'TRY' })).toBe(15)
  })
})

describe('sumCost — çok para birimli reçete', () => {
  const items: CostItem[] = [
    { calculation_type: 'metre_fiyat', quantity: 2, unit_price: 3, currency: 'USD' }, // 6 USD = 240 TL
    { calculation_type: 'sabit', amount: 50, currency: 'TRY' },                        // 50 TL
    { calculation_type: 'sabit', amount: 2, currency: 'EUR' },                         // 2 EUR = 88 TL
  ]
  it('toplam TL doğru (240+50+88=378)', () => {
    expect(sumCost(items, RATES).totalTry).toBeCloseTo(378, 10)
  })
  it('toplam USD = TL / USD kuru (378/40=9.45)', () => {
    expect(sumCost(items, RATES).totalUsd).toBeCloseTo(9.45, 10)
  })
  it('kur değişince yeniden hesaplanır (USD 40→50)', () => {
    const r2 = { ...RATES, USD: 50, EUR: 55 } // EUR de değişti
    const s = sumCost(items, r2)
    expect(s.totalTry).toBeCloseTo(2 * 3 * 50 + 50 + 2 * 55, 10) // 300+50+110=460
    expect(s.totalUsd).toBeCloseTo(460 / 50, 10) // 9.2
  })
  it('USD kuru 0 ise USD toplam 0 (bölme koruması)', () => {
    expect(sumCost(items, { TRY: 1, USD: 0 }).totalUsd).toBe(0)
  })
})

describe('toTry — para birimi çevrimi', () => {
  it('USD → TL', () => { expect(toTry(10, 'USD', RATES)).toBe(400) })
  it('TRY → TRY', () => { expect(toTry(10, 'TRY', RATES)).toBe(10) })
  it('bilinmeyen para birimi → TL varsayılır', () => { expect(toTry(10, 'XXX', RATES)).toBe(10) })
})

describe('buildRates — güvenlik payı', () => {
  it('%0 pay → ham kur', () => { expect(buildRates({ USD: 40 }, 0).USD).toBe(40) })
  it('%2 pay → 40×1.02=40.8', () => { expect(buildRates({ USD: 40 }, 2).USD).toBeCloseTo(40.8, 10) })
  it('TRY her zaman 1', () => { expect(buildRates({ USD: 40 }, 5).TRY).toBe(1) })
})

describe('tierRows — kart fiyat tablosu (birim maliyet $4)', () => {
  const rows = tierRows(4, TIERS)
  it('3 kademe', () => { expect(rows).toHaveLength(3) })
  it('50 adet: $4 %25 → $5 birim, $250 toplam', () => {
    expect(rows[0]).toMatchObject({ quantity: 50, marginPercent: 25, unitPrice: 5, total: 250 })
  })
  it('200 adet: $4.80 birim, $960 toplam', () => {
    expect(rows[1]!.unitPrice).toBeCloseTo(4.8, 10); expect(rows[1]!.total).toBeCloseTo(960, 10)
  })
  it('500 adet: $4.40 birim, $2200 toplam', () => {
    expect(rows[2]!.unitPrice).toBeCloseTo(4.4, 10); expect(rows[2]!.total).toBeCloseTo(2200, 10)
  })
  it('özel marj tüm satırlara uygulanır', () => {
    expect(tierRows(4, TIERS, 50).every((r) => r.marginPercent === 50)).toBe(true)
  })
})

describe('priceForQuantity — tek adet için (tek-tuş teklif)', () => {
  it('120 adet, $4 maliyet → %25, $5 birim, $600', () => {
    const r = priceForQuantity(4, 120, TIERS)
    expect(r).toMatchObject({ marginPercent: 25 }); expect(r.unitPrice).toBe(5); expect(r.total).toBe(600)
  })
  it('300 adet → %20 kademe', () => { expect(priceForQuantity(4, 300, TIERS).marginPercent).toBe(20) })
})
