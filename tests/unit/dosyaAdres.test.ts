import { describe, it, expect } from 'vitest'
import { enYakinBoyut, dosyaUrl, yolGecerli } from '@/lib/dosyaAdres'
import { env } from '@/lib/env'

describe('enYakinBoyut', () => {
  it('küçük genişlikleri 160a yuvarlar', () => {
    expect(enYakinBoyut(80)).toBe(160)
    expect(enYakinBoyut(112)).toBe(160)
    expect(enYakinBoyut(120)).toBe(160)
    expect(enYakinBoyut(160)).toBe(160)
  })

  it('orta genişlikleri 480e yuvarlar', () => {
    expect(enYakinBoyut(161)).toBe(480)
    expect(enYakinBoyut(400)).toBe(480)
    expect(enYakinBoyut(480)).toBe(480)
  })

  it('480 üstünde orijinali ister', () => {
    expect(enYakinBoyut(800)).toBeUndefined()
  })

  it('genişlik verilmezse orijinali ister', () => {
    expect(enYakinBoyut()).toBeUndefined()
    expect(enYakinBoyut(0)).toBeUndefined()
  })
})

describe('dosyaUrl', () => {
  it('düz adres üretir', () => {
    expect(dosyaUrl('image/a.jpg')).toBe(`${env.dosyaUrl}/d/image/a.jpg`)
  })

  it('genişliği yuvarlayıp parametreye koyar', () => {
    expect(dosyaUrl('image/a.jpg', { genislik: 400 })).toContain('w=480')
  })

  it('480 üstünde w parametresi koymaz', () => {
    expect(dosyaUrl('image/a.jpg', { genislik: 900 })).not.toContain('w=')
  })

  it('indirme adını kodlayarak ekler', () => {
    const u = dosyaUrl('image/a.jpg', { indirAdi: 'Teklif Ağustos.pdf' })
    expect(u).toContain('indir=Teklif+A%C4%9Fustos.pdf')
  })

  it('birden çok yol parçasını bölü işaretiyle korur', () => {
    expect(dosyaUrl('image/2024/a-b_c.jpg')).toBe(`${env.dosyaUrl}/d/image/2024/a-b_c.jpg`)
  })

  it('.. içeren yolda boş dize döner, FIRLATMAZ ve öneki taşımaz', () => {
    expect(dosyaUrl('../etc/passwd')).toBe('')
    expect(() => dosyaUrl('../etc/passwd')).not.toThrow()
  })

  it('geçersiz yolda boş dize döner', () => {
    expect(dosyaUrl('k/160/image/a.jpg.webp')).toBe('')
    expect(dosyaUrl('/image/a.jpg')).toBe('')
    // Boşluk da geçersiz — yol biçimi ^[a-zA-Z0-9_\-./]{1,200}$ (bkz. genel-kisitlar.md).
    expect(dosyaUrl('image/a b.jpg')).toBe('')
  })
})

describe('yolGecerli', () => {
  it('normal yolu kabul eder', () => {
    expect(yolGecerli('image/9f2c-ab.jpg')).toBe(true)
  })

  it('.. içeren yolu reddeder', () => {
    expect(yolGecerli('image/../gizli.jpg')).toBe(false)
  })

  it('ters bölü içeren yolu reddeder', () => {
    expect(yolGecerli('image\\a.jpg')).toBe(false)
  })

  it('baştaki bölüyü reddeder', () => {
    expect(yolGecerli('/image/a.jpg')).toBe(false)
  })

  it('k/ önekini reddeder', () => {
    expect(yolGecerli('k/160/image/a.jpg.webp')).toBe(false)
  })

  it('boş dizeyi reddeder', () => {
    expect(yolGecerli('')).toBe(false)
  })

  it('201 karakteri reddeder', () => {
    expect(yolGecerli('a'.repeat(201))).toBe(false)
  })

  it('izinsiz karakteri reddeder', () => {
    expect(yolGecerli('image/a?b.jpg')).toBe(false)
  })
})
