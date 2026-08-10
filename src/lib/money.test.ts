import { describe, it, expect } from 'vitest'
import { parseDecimal } from './money'

/**
 * Birim fiyat parse — kritik: yanlış parse doğrudan cariye yanlış borç yazar.
 * Türkçe biçim: nokta binlik, virgül ondalık. Belge→sipariş kaleminde kullanılır.
 */
describe('parseDecimal — birim fiyat (TR biçim)', () => {
  it('Türkçe binlik+ondalık + para simgesi', () => {
    expect(parseDecimal('1.850,00 ₺')).toBe(1850)
    expect(parseDecimal('12.345,67 ₺')).toBe(12345.67)
  })
  it('ayıraçsız tam sayı', () => {
    expect(parseDecimal('1850')).toBe(1850)
  })
  it('yalnız binlik ayıracı (3 haneli grup → binlik, ondalık değil)', () => {
    expect(parseDecimal('1.850')).toBe(1850)
  })
  it('yalnız ondalık virgül', () => {
    expect(parseDecimal('0,50')).toBe(0.5)
    expect(parseDecimal('45,50')).toBe(45.5)
  })
  it('okunamayan/boş girdi → null (0 YAZMA)', () => {
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal(null)).toBeNull()
    expect(parseDecimal(undefined)).toBeNull()
    expect(parseDecimal('abc')).toBeNull()
  })
})
