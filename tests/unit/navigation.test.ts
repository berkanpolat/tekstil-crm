import { describe, it, expect } from 'vitest'
import { NAV_ITEMS, activeNavItem, canViewFinance, canManageUsers } from '@/lib/navigation'

describe('navigation', () => {
  it('menü modülleri (M3: +Mesajlar = 15)', () => {
    expect(NAV_ITEMS).toHaveLength(15)
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

// QA#1 regresyon — sales finansal arayüzü GÖRMEZ (menü + Cari sekmesi bu yardımcıya bağlı).
describe('canViewFinance (QA#1 güvenlik)', () => {
  it('sales, operations, viewer finansal veri göremez', () => {
    expect(canViewFinance('sales')).toBe(false)
    expect(canViewFinance('operations')).toBe(false)
    expect(canViewFinance('viewer')).toBe(false)
  })
  it('owner/admin/manager/finance görür', () => {
    for (const r of ['owner', 'admin', 'manager', 'finance']) expect(canViewFinance(r)).toBe(true)
  })
  it('null/undefined güvenli', () => {
    expect(canViewFinance(null)).toBe(false)
    expect(canViewFinance(undefined)).toBe(false)
  })
  it('Finans öğesi financeOnly ile işaretli ve sales menüsünde görünmez', () => {
    const fin = NAV_ITEMS.find((i) => i.path === '/finans')
    expect(fin?.financeOnly).toBe(true)
    const salesVisible = NAV_ITEMS.filter((i) => (!i.adminOnly || canManageUsers('sales')) && (!i.financeOnly || canViewFinance('sales')))
    expect(salesVisible.some((i) => i.path === '/finans')).toBe(false)
  })
})
