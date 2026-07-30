import { describe, it, expect } from 'vitest'
import {
  normalizePhone,
  samePhone,
  formatPhoneTR,
  normalizeEmail,
  normalizeContactValue,
} from '@/lib/phone'
import phoneCases from '../fixtures/phone-cases.json'

// OTORİTER senaryolar tests/fixtures/phone-cases.json'da; aynı dosyayı SQL
// tutarlılık kontrolü (scripts/check-normalize-consistency.mjs) de okur ve
// normalize_contact_value('phone', ...) ile birebir aynı sonucu üretmelidir.
// Biri değişirse (TS phone.ts veya SQL) test kırılır → ayrışma engellenir.
type PhoneCase = { input: string; expected: string | null }

describe('normalizePhone — fixture (Türkiye + uluslararası, SQL↔TS)', () => {
  for (const { input, expected } of phoneCases as PhoneCase[]) {
    it(`"${input}" → ${expected ?? 'null'}`, () => {
      expect(normalizePhone(input)).toBe(expected)
      // phone tipi için normalizeContactValue de aynı sonucu vermeli
      expect(normalizeContactValue('phone', input)).toBe(expected)
    })
  }

  it('+ ile gelen kısa numara korunur (fixture dışı kenar)', () => {
    expect(normalizePhone('+90 532 12')).toBe('+9053212')
  })

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
