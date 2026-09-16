import { describe, it, expect } from 'vitest'
import { buildOrderFromDoc, resolvePaymentTerm } from './orderFromDoc'

// Canlı belgeden alınan gerçek siparis_formu.data.sip (TAS-G235X9).
const REAL_SIP = {
  no6: 'G235X9', urunkodu: 'TAS-G235X9', grup: 'Kadın Giyim / Üst Giyim', tur: 'Büstiyer',
  para: 'USD', birim: '40', toplam: '30', tavsiye: '333',
  teslim: '2026-09-30', tarih: '2026-09-16', odeme: '%50 Ön Ödeme %50 Sevkiyat Öncesi',
  kompozisyon: '%100 Pamuk', yorum: 'acele', bakim: ['30', 'handwash', 'iron', 'notumble'],
  bedenler: ['S', 'M', 'L'], bedenlerText: 'S;M;L',
  renkler: [{ q: { S: '10', M: '10', L: '10' }, ad: '', hex: '#1f2f57' }],
  alici: { unvan: 'Berkan Polat Çetiner', vno: '31312', vd: '', adres: 'Bağdat Cad. No:1' },
}

const TERMS = [
  { id: 1, key: 'yuzde_50_50', label: '%50 Peşin / %50 Teslimat', is_default: true },
  { id: 2, key: 'pesin', label: 'Peşin' },
  { id: 3, key: 'vadeli_30', label: '30 Gün Vadeli' },
  { id: 4, key: 'diger', label: 'Diğer' },
]

describe('buildOrderFromDoc (gerçek sip)', () => {
  const m = buildOrderFromDoc(REAL_SIP, { paymentTerms: TERMS, defaultTaxRate: 10 })

  it('para birimi ve teslim tarihi geçer', () => {
    expect(m.fields.currency).toBe('USD')
    expect(m.fields.promised_delivery).toBe('2026-09-30')
  })

  it('renk×beden matrisi tek renk satırına aktarılır (Σbeden = 30)', () => {
    expect(m.items).toHaveLength(1)
    const it = m.items[0]!
    expect(it.quantity).toBe(30) // 10+10+10
    expect(it.unit_price).toBe(40)
    expect(it.name).toBe('Renk 1') // ad boş → otomatik
    expect(it.description).toBe('S: 10 · M: 10 · L: 10')
  })

  it('toplam (qty×birim) trigger için doğru: 30×40 = 1200', () => {
    const sum = m.items.reduce((a, i) => a + i.quantity * i.unit_price, 0)
    expect(sum).toBe(1200)
  })

  it('ödeme koşulu %50/%50 kalıbına eşleşir', () => {
    expect(m.fields.payment_term_id).toBe(1)
    expect(m.paymentMatched).toBe(true)
  })

  it('production_notes kompozisyon+yorum+bakım+tavsiye içerir', () => {
    expect(m.fields.production_notes).toContain('Kompozisyon: %100 Pamuk')
    expect(m.fields.production_notes).toContain('acele')
    expect(m.fields.production_notes).toContain('Bakım: 30, handwash, iron, notumble')
    expect(m.fields.production_notes).toContain('Tavsiye satış fiyatı: 333 USD')
  })

  it('teslim adresi ve KDV varsayılanı', () => {
    expect(m.fields.delivery_address).toBe('Bağdat Cad. No:1')
    expect(m.fields.tax_rate).toBe(10)
    expect(m.priceMissing).toBe(false)
  })
})

describe('renk yoksa toplam×birim tek kalem', () => {
  it('renkler boş → toplam adet tek satır', () => {
    const m = buildOrderFromDoc({ para: 'TRY', birim: '25', toplam: '100', renkler: [] }, { paymentTerms: TERMS, defaultTaxRate: 20 })
    expect(m.items).toHaveLength(1)
    expect(m.items[0]!.quantity).toBe(100)
    expect(m.items[0]!.unit_price).toBe(25)
    expect(m.items[0]!.name).toBe('Sipariş kalemi')
  })
})

describe('resolvePaymentTerm', () => {
  it('%50…%50 metni → yuzde_50_50', () => {
    expect(resolvePaymentTerm('%50 Ön Ödeme %50 Sevkiyat Öncesi', TERMS)).toEqual({ id: 1, matched: true })
  })
  it('peşin → pesin', () => {
    expect(resolvePaymentTerm('Peşin ödeme', TERMS)).toEqual({ id: 2, matched: true })
  })
  it('30 gün vadeli → vadeli_30', () => {
    expect(resolvePaymentTerm('30 gün vadeli', TERMS)).toEqual({ id: 3, matched: true })
  })
  it('eşleşmeyen metin → is_default + matched:false (uyarı sinyali)', () => {
    expect(resolvePaymentTerm('kapıda kredi kartı taksitli', TERMS)).toEqual({ id: 1, matched: false })
  })
  it('boş metin → sessiz varsayılan (matched:true)', () => {
    expect(resolvePaymentTerm('', TERMS)).toEqual({ id: 1, matched: true })
  })
})
