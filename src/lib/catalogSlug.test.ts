import { describe, it, expect } from 'vitest'
import { slugify, isValidSlug } from './catalogSlug'

describe('slugify', () => {
  it('Türkçe karakterleri ASCII karşılığına katlar', () => {
    expect(slugify('Cep Detaylı Baskılı Pamuklu Penye Tunik Yeşil'))
      .toBe('cep-detayli-baskili-pamuklu-penye-tunik-yesil')
    expect(slugify('Fırfır Kollu Büzgülü Modal Tunik Su Yeşili'))
      .toBe('firfir-kollu-buzgulu-modal-tunik-su-yesili')
    expect(slugify('Yarasa Kol Medine İpeği Midi Tunik Zeytin Yeşili'))
      .toBe('yarasa-kol-medine-ipegi-midi-tunik-zeytin-yesili')
  })

  it('noktalama ve fazla boşluğu tek tireye indirir, baş/sonu temizler', () => {
    expect(slugify('  Studio Regular  Yüksek Bel — Düz Paça / Modal  '))
      .toBe('studio-regular-yuksek-bel-duz-paca-modal')
    expect(slugify('%100 Pamuk (Compact Penye)')).toBe('100-pamuk-compact-penye')
  })

  it('boş girdide boş döner', () => {
    expect(slugify('')).toBe('')
    expect(slugify('   ---   ')).toBe('')
  })
})

describe('isValidSlug', () => {
  it('geçerli biçimleri kabul eder', () => {
    expect(isValidSlug('cep-detayli-tunik-yesil')).toBe(true)
    expect(isValidSlug('studio-siyah-aerobin-kap-2')).toBe(true)   // "-2" çakışma soneki
    expect(isValidSlug('abc123')).toBe(true)
  })

  it('bozuk biçimleri reddeder', () => {
    expect(isValidSlug('Buyuk-Harf')).toBe(false)
    expect(isValidSlug('bosluk var')).toBe(false)
    expect(isValidSlug('-bas-tire')).toBe(false)
    expect(isValidSlug('son-tire-')).toBe(false)
    expect(isValidSlug('cift--tire')).toBe(false)
    expect(isValidSlug('türkçe-karakter')).toBe(false)
    expect(isValidSlug('')).toBe(false)
  })

  it('slugify çıktısı her zaman geçerlidir', () => {
    for (const ad of ['Şifon Bluz', 'Kaşkorse (2li)', 'Tüvit & Denim', '  A  ']) {
      const s = slugify(ad)
      if (s) expect(isValidSlug(s)).toBe(true)
    }
  })
})
