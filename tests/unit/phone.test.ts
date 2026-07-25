import { describe, it, expect } from 'vitest'
import {
  normalizePhone,
  samePhone,
  formatPhoneTR,
  normalizeEmail,
  normalizeContactValue,
} from '@/lib/phone'

describe('normalizePhone — Türkiye + uluslararası (15+ biçim)', () => {
  const TR = '+905321234567'
  const cases: [string, string | null][] = [
    ['0532 123 45 67', TR],
    ['+90 532 123 4567', TR],
    ['905321234567', TR],
    ['90 532 123 45 67', TR],
    ['532 123 45 67', TR],
    ['5321234567', TR],
    ['0090 532 123 45 67', TR],
    ['(0532) 123-45-67', TR],
    ['+90-532-123-45-67', TR],
    ['  0532.123.45.67  ', TR],
    ['0212 345 67 89', '+902123456789'], // İstanbul sabit hat
    ['+49 170 1234567', '+491701234567'], // Almanya
    ['+1 (415) 555-2671', '+14155552671'], // ABD
    ['00491701234567', '+491701234567'], // 00 → +
    ['', null],
    ['   ', null],
    ['abc', null],
    ['+90 532 12', '+9053212'], // kısa ama + ile → korunur
  ]

  for (const [input, expected] of cases) {
    it(`"${input}" → ${expected ?? 'null'}`, () => {
      expect(normalizePhone(input)).toBe(expected)
    })
  }

  it('farklı yazımdaki aynı numara eşit sayılır (samePhone)', () => {
    expect(samePhone('0532 123 45 67', '+905321234567')).toBe(true)
    expect(samePhone('905321234567', '0532-123-4567')).toBe(true)
    expect(samePhone('0532 123 45 67', '0533 123 45 67')).toBe(false)
  })

  it('formatPhoneTR okunur biçim üretir', () => {
    expect(formatPhoneTR('+905321234567')).toBe('0532 123 45 67')
    expect(formatPhoneTR('+491701234567')).toBe('+491701234567')
  })
})

describe('normalizeEmail', () => {
  it('küçük harf + kırpma', () => {
    expect(normalizeEmail('  Ali.Veli@Sirket.COM ')).toBe('ali.veli@sirket.com')
  })
  it('geçersiz → null', () => {
    expect(normalizeEmail('ali[at]sirket')).toBeNull()
    expect(normalizeEmail('')).toBeNull()
  })
})

describe('normalizeContactValue', () => {
  it('phone/whatsapp → E.164', () => {
    expect(normalizeContactValue('phone', '0532 123 45 67')).toBe('+905321234567')
    expect(normalizeContactValue('whatsapp', '0532 123 45 67')).toBe('+905321234567')
  })
  it('email → küçük harf', () => {
    expect(normalizeContactValue('email', 'A@B.com')).toBe('a@b.com')
  })
  it('instagram → @ ve boşluk temizlenir', () => {
    expect(normalizeContactValue('instagram', '@Firma_Adi ')).toBe('firma_adi')
  })
  it('website → şema ve sondaki slash atılır', () => {
    expect(normalizeContactValue('website', 'https://Firma.com/')).toBe('firma.com')
  })
})
