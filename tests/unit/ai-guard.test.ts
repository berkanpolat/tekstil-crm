import { describe, it, expect } from 'vitest'
import { scanForbiddenKeys, assertNoForbidden } from '@/lib/aiGuard'
import { buildCustomerSummaryPayload } from '@/lib/aiPayloads'

// P6.6 — YZ SIZINTI TESTİ (zorlamalı). Bir sızıntı geri alınamaz.
describe('YZ payload sızıntı koruması (P6.6)', () => {
  // Müşteri kartında HER ŞEY var: cari bakiye, sipariş tutarları, maliyet, İÇ NOT.
  // Özet payload'ında bunların HİÇBİRİ geçmemeli.
  const customer = {
    id: 4821, company_name: 'ACME Tekstil', full_name: 'Ali Veli', city: 'İstanbul', sector: 'Hazır Giyim',
    // ↓ YASAK veriler — kart nesnesine karışmış (naif dump senaryosu)
    balance_try: 'SIZINTI_BAKIYE_5000', balance_usd: 'SIZINTI_BAKIYE_125',
    orders: [{ total: 'SIZINTI_TUTAR_9999', amount_try: 'SIZINTI_TUTAR_TL' }],
    product_cost: 'SIZINTI_MALIYET_290', margin_percent: 'SIZINTI_MARJ_25', unit_price: 'SIZINTI_FIYAT',
    account_transactions: [{ amount_usd: 'SIZINTI_HAREKET' }],
  }
  const notes = [
    { body: 'Müşteri tesettür koleksiyonuyla ilgileniyor.', is_internal: false },
    { body: 'SIZINTI_ICNOT_gizli_pazarlik_notu', is_internal: true },   // İÇ NOT — gitmemeli
  ]
  const SECRETS = ['SIZINTI_BAKIYE', 'SIZINTI_TUTAR', 'SIZINTI_MALIYET', 'SIZINTI_MARJ', 'SIZINTI_FIYAT', 'SIZINTI_HAREKET', 'SIZINTI_ICNOT']

  it('müşteri özeti payload\'ında cari/tutar/maliyet/iç-not GEÇMEZ', () => {
    const p = buildCustomerSummaryPayload({ customer, notes })
    const blob = JSON.stringify(p)
    for (const s of SECRETS) expect(blob, `sızıntı: ${s}`).not.toContain(s)
    // ama izinli veri geçer (özet çalışıyor)
    expect(p.text).toContain('ACME Tekstil')
    expect(p.text).toContain('tesettür')          // açık not geçer
    expect(p.entity_id).toBe(4821)
    expect(p.record_counts.notes).toBe(1)          // yalnız 1 açık not (iç not elendi)
  })

  it('scanForbiddenKeys yasak alan adlarını yakalar (guard ikinci kat)', () => {
    expect(scanForbiddenKeys({ x: 1, amount_usd: 5 })).toContain('amount_usd')
    expect(scanForbiddenKeys({ nested: { internalNote: 'x' } })).toContain('internalNote')
    expect(scanForbiddenKeys({ list: [{ balance_try: 1 }] })).toContain('balance_try')
    expect(scanForbiddenKeys({ company_name: 'ACME', city: 'İstanbul' })).toEqual([])   // temiz payload
  })

  it('assertNoForbidden temiz payload\'ı geçirir, kirliyi reddeder', () => {
    const clean = buildCustomerSummaryPayload({ customer, notes })
    expect(() => assertNoForbidden(clean)).not.toThrow()
    expect(() => assertNoForbidden({ feature: 'x', cost: 100 })).toThrow(/yasak alan/)
  })
})
