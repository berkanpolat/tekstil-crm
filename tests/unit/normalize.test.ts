import { describe, it, expect } from 'vitest'
import { normalizeTr } from '@/lib/normalize'
import cases from '../fixtures/normalize-tr-cases.json'

// OTORİTER senaryolar tests/fixtures/normalize-tr-cases.json'da; aynı dosyayı
// SQL tutarlılık kontrolü (scripts/check-normalize-consistency.mjs) de okur.
// Biri değişirse (TS veya SQL) test kırılır → SQL↔TS ayrışması engellenir.
type NormCase = { input: string; expected: string | null }

describe('normalizeTr — Türkçe + Avrupa katlama (fixture ile SQL↔TS)', () => {
  for (const { input, expected } of cases as NormCase[]) {
    it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      expect(normalizeTr(input)).toBe(expected)
    })
  }

  // Fixture dışı: null/undefined girişleri de güvenli olmalı
  it('null/undefined → null', () => {
    expect(normalizeTr(null)).toBeNull()
    expect(normalizeTr(undefined)).toBeNull()
  })

  it('aynı firmanın farklı yazımları eşit normalize olur', () => {
    expect(normalizeTr('ŞİŞLİ TEKSTİL LTD. ŞTİ.')).toBe(normalizeTr('sisli tekstil ltd sti'))
    expect(normalizeTr('Öztürk A.Ş.')).toBe(normalizeTr('ozturk a s'))
    expect(normalizeTr('Bräuer')).toBe(normalizeTr('BRAUER'))
  })
})
