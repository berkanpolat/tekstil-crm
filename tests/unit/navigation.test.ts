import { describe, it, expect } from 'vitest'
import { NAV_ITEMS, activeNavItem } from '@/lib/navigation'

describe('navigation', () => {
  it('Faz 0 menüsü 13 modül içerir', () => {
    expect(NAV_ITEMS).toHaveLength(13)
    expect(NAV_ITEMS[0]?.path).toBe('/')
  })

  it("her öğenin path'i benzersiz", () => {
    const paths = NAV_ITEMS.map((i) => i.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('activeNavItem: / yalnızca tam eşleşir', () => {
    expect(activeNavItem('/')?.label).toBe('Gösterge Paneli')
    // /musteriler, / ile başlıyor ama dashboard olmamalı
    expect(activeNavItem('/musteriler')?.path).toBe('/musteriler')
  })

  it('activeNavItem: alt yollar önekle eşleşir', () => {
    expect(activeNavItem('/musteriler/123')?.path).toBe('/musteriler')
    expect(activeNavItem('/ayarlar/guvenlik')?.path).toBe('/ayarlar')
  })

  it('bilinmeyen yol için undefined', () => {
    expect(activeNavItem('/bilinmeyen')).toBeUndefined()
  })
})
