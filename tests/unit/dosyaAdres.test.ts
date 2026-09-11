import { describe, it, expect } from 'vitest'
import { enYakinBoyut, dosyaUrl } from '@/lib/dosyaAdres'
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

  it('yol parçalarını kodlar ama bölü işaretini korur', () => {
    expect(dosyaUrl('image/a b.jpg')).toBe(`${env.dosyaUrl}/d/image/a%20b.jpg`)
  })
})
