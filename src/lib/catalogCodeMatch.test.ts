import { describe, it, expect } from 'vitest'
import { autoMatchKey, catalogCodeKey, isAutoMatch, isNearMatch } from './catalogCodeMatch'

describe('autoMatchKey — madde 3 (harf + baş/son boşluk + Türkçe)', () => {
  it('büyük/küçük harf ve baş/son boşluğu yok sayar', () => {
    expect(autoMatchKey('  ST26SS130010 ')).toBe('st26ss130010')
    expect(autoMatchKey('st26ss130010')).toBe('st26ss130010')
  })
  it('iç ayracı KORUR (boşluğa indirir ama silmez)', () => {
    expect(autoMatchKey('ST-26SS130010')).toBe('st 26ss130010')
  })
  it('Türkçe İ/ı güvenli (ham lower değil)', () => {
    expect(autoMatchKey('İPLİK 1')).toBe('iplik 1')
    expect(autoMatchKey('IPLIK 1')).toBe('iplik 1')
  })
})

describe('isAutoMatch — madde 3 otomatik bağlama toleransı', () => {
  it('harf/boşluk/Türkçe farkını eşler', () => {
    expect(isAutoMatch('ST26SS130010', '  st26ss130010 ')).toBe(true)
    expect(isAutoMatch('İPLİK-1', 'iplik-1')).toBe(true)
  })
  it('iç ayraç farkını OTOMATİK eşlemez (bu yalnız öneri olur)', () => {
    expect(isAutoMatch('ST-26SS130010', 'ST26SS130010')).toBe(false)
  })
  it('boş/geçersiz kod asla eşleşmez', () => {
    expect(isAutoMatch('', '')).toBe(false)
    expect(isAutoMatch('---', 'ST26')).toBe(false)
    expect(isAutoMatch(null, undefined)).toBe(false)
  })
})

describe('catalogCodeKey + isNearMatch — madde 4 (yalnız öneri)', () => {
  it('iç ayraç farklı kodlar aynı anahtara iner', () => {
    expect(catalogCodeKey('ST-26SS130010')).toBe('st26ss130010')
    expect(catalogCodeKey('ST26SS130010')).toBe('st26ss130010')
    expect(isNearMatch('ST-26SS130010', 'ST26SS130010')).toBe(true)
  })
  it('biri diğerini içeriyorsa yakın sayar (önek/parça)', () => {
    expect(isNearMatch('ST26', 'ST26SS130010')).toBe(true)
    expect(isNearMatch('ST26SS130010', 'ST-26')).toBe(true)
  })
  it('alakasız kodlar yakın değil', () => {
    expect(isNearMatch('ABC123', 'XYZ999')).toBe(false)
  })
  it('boş kod → yakın değil', () => {
    expect(isNearMatch('', 'ST26')).toBe(false)
    expect(catalogCodeKey(null)).toBe('')
  })
})
