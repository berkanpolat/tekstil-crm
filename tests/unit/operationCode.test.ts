import { describe, it, expect } from 'vitest'
import {
  OPERATION_CODE_ALPHABET,
  OPERATION_CODE_FORBIDDEN,
  isValidOperationCode,
  randomOperationCode,
  operationCodePattern,
} from '@/lib/operationCode'

describe('operationCode — saf mantık', () => {
  it('alfabe yasak karakterleri (I,O,0,1) içermez', () => {
    for (const ch of OPERATION_CODE_FORBIDDEN) {
      expect(OPERATION_CODE_ALPHABET).not.toContain(ch)
    }
    expect(OPERATION_CODE_ALPHABET.length).toBe(32)
  })

  it('isValidOperationCode doğru formatı kabul, yanlışı reddeder', () => {
    expect(isValidOperationCode('TAS-ABC234')).toBe(true)
    expect(isValidOperationCode('TAS-ABCDEF')).toBe(true)
    expect(isValidOperationCode('TAS-ABC23')).toBe(false) // kısa
    expect(isValidOperationCode('TAS-ABC2345')).toBe(false) // uzun
    expect(isValidOperationCode('TAS-ABC2O4')).toBe(false) // yasak O
    expect(isValidOperationCode('TAS-ABC2I4')).toBe(false) // yasak I
    expect(isValidOperationCode('TAS_ABC234')).toBe(false) // yanlış ayraç
    expect(isValidOperationCode('XXX-ABC234')).toBe(false) // yanlış önek
    expect(isValidOperationCode('tas-abc234')).toBe(false) // küçük harf
  })

  it('özel önek/uzunluk desteklenir', () => {
    expect(isValidOperationCode('STD-ABC2345', 'STD', 7)).toBe(true)
    expect(operationCodePattern('STD', 7).source).toContain('STD')
  })

  it('randomOperationCode her zaman geçerli format üretir (10.000 üretim)', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 10_000; i++) {
      const code = randomOperationCode()
      expect(isValidOperationCode(code)).toBe(true)
      // yasak karakter yok
      for (const ch of OPERATION_CODE_FORBIDDEN) {
        expect(code.slice(4)).not.toContain(ch)
      }
      codes.add(code)
    }
    // Saf rastgelede benzersizlik OLASILIKSAL (garanti Postgres registry'de).
    // 1e9 uzayda 10.000 çekim → çakışma nadir; en az %99 benzersiz beklenir.
    expect(codes.size).toBeGreaterThan(9900)
  })
})
