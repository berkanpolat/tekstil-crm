import { describe, it, expect } from 'vitest'
import { defaultTabForRole, parseTab, formatWaiting, isStale } from './calismaUtils'

const NOW = new Date('2026-09-09T12:00:00Z').getTime()
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('defaultTabForRole', () => {
  it('satış rolü "Bugün aranacaklar" ile açılır', () => {
    expect(defaultTabForRole('sales')).toBe('bugun')
  })
  it('yönetici/operasyon/bilinmeyen roller "Tümü" ile açılır', () => {
    expect(defaultTabForRole('owner')).toBe('tumu')
    expect(defaultTabForRole('admin')).toBe('tumu')
    expect(defaultTabForRole('manager')).toBe('tumu')
    expect(defaultTabForRole('operations')).toBe('tumu')
    expect(defaultTabForRole(null)).toBe('tumu')
    expect(defaultTabForRole(undefined)).toBe('tumu')
  })
})

describe('parseTab', () => {
  it('geçerli değerleri döner, bozukları null', () => {
    expect(parseTab('bugun')).toBe('bugun')
    expect(parseTab('teklif')).toBe('teklif')
    expect(parseTab('tumu')).toBe('tumu')
    expect(parseTab('eski')).toBeNull()
    expect(parseTab(null)).toBeNull()
  })
})

describe('formatWaiting', () => {
  it('kaynak yoksa/bozuksa —', () => {
    expect(formatWaiting(null, NOW)).toBe('—')
    expect(formatWaiting('bozuk-tarih', NOW)).toBe('—')
  })
  it('dakika / saat / gün ölçeklenir', () => {
    expect(formatWaiting(ago(30 * 1000), NOW)).toBe('az önce')
    expect(formatWaiting(ago(5 * MIN), NOW)).toBe('5 dk')
    expect(formatWaiting(ago(3 * HOUR), NOW)).toBe('3 sa')
    expect(formatWaiting(ago(2 * DAY), NOW)).toBe('2 gün')
  })
  it('gelecek tarih 0a kırpılır', () => {
    expect(formatWaiting(new Date(NOW + HOUR).toISOString(), NOW)).toBe('az önce')
  })
})

describe('isStale', () => {
  it('eşik (3 gün) geçilince true', () => {
    expect(isStale(ago(2 * DAY), NOW)).toBe(false)
    expect(isStale(ago(4 * DAY), NOW)).toBe(true)
    expect(isStale(null, NOW)).toBe(false)
  })
})
