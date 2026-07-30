import { describe, it, expect } from 'vitest'
import { formatMoney, balanceTone, parseDecimal, decimalToText } from '@/lib/money'

// Faz 5 sunum yardımcıları. Para HESABI DB'de (customer_balance/order_advance_check);
// o mantık scripts/test-finance-p5.mjs ile doğrulanır. Burada yalnız biçim + ton.
describe('formatMoney', () => {
  it('tr-TR grup/ondalık + simge', () => {
    expect(formatMoney(12345.6, 'TRY')).toBe('12.345,60 ₺')
    expect(formatMoney(1000, 'USD')).toBe('1.000,00 $')
    expect(formatMoney(0, 'EUR')).toBe('0,00 €')
  })
  it('null/undefined → 0', () => {
    expect(formatMoney(null, 'TRY')).toBe('0,00 ₺')
    expect(formatMoney(undefined, 'USD')).toBe('0,00 $')
  })
  it('bilinmeyen para birimi kodu aynen', () => {
    expect(formatMoney(5, 'GBP')).toBe('5,00 GBP')
  })
})

describe('parseDecimal — TR virgül + nokta ondalık', () => {
  it('virgül ondalık', () => {
    expect(parseDecimal('45,50')).toBe(45.5)
    expect(parseDecimal('0,99')).toBe(0.99)
    expect(parseDecimal('1234,5')).toBe(1234.5)
  })
  it('nokta ondalık', () => {
    expect(parseDecimal('45.50')).toBe(45.5)
    expect(parseDecimal('45')).toBe(45)
  })
  it('binlik ayıraçlı (en sağdaki ondalık kuralı)', () => {
    expect(parseDecimal('1.234,56')).toBe(1234.56)   // TR: nokta binlik, virgül ondalık
    expect(parseDecimal('1,234.56')).toBe(1234.56)   // EN: virgül binlik, nokta ondalık
    expect(parseDecimal('1.000.000')).toBe(1000000)  // yalnız binlik nokta
  })
  it('para simgesi/harf temizlenir', () => {
    expect(parseDecimal('45,50 ₺')).toBe(45.5)
    expect(parseDecimal('$ 1.200,00')).toBe(1200)
  })
  it('boş/geçersiz → null', () => {
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('abc')).toBeNull()
    expect(parseDecimal(null)).toBeNull()
    expect(parseDecimal(',')).toBeNull()
  })
  it('sayı girişi aynen', () => {
    expect(parseDecimal(42.5)).toBe(42.5)
  })
  it('decimalToText nokta→virgül', () => {
    expect(decimalToText(45.5)).toBe('45,5')
    expect(decimalToText(null)).toBe('')
  })
})

describe('balanceTone', () => {
  it('negatif = borçlu, pozitif = alacaklı, ~0 = sıfır', () => {
    expect(balanceTone(-100)).toBe('debt')
    expect(balanceTone(250)).toBe('credit')
    expect(balanceTone(0)).toBe('zero')
    expect(balanceTone(0.004)).toBe('zero')   // yuvarlama toleransı
    expect(balanceTone(-0.004)).toBe('zero')
  })
})
