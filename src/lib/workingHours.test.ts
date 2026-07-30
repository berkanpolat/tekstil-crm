import { describe, it, expect } from 'vitest'
import { addWorkingHours, isWorkingDay, slaStatus, type WorkingHoursConfig } from './workingHours'

const CFG: WorkingHoursConfig = { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00', holidays: [] }
// Mesai: 09:00–18:00 = 9 iş saati/gün.

describe('isWorkingDay', () => {
  it('hafta içi çalışma günü', () => {
    expect(isWorkingDay(new Date(2026, 6, 27), CFG)).toBe(true) // 27 Tem 2026 Pazartesi
  })
  it('hafta sonu değil', () => {
    expect(isWorkingDay(new Date(2026, 7, 1), CFG)).toBe(false) // 1 Ağu 2026 Cumartesi
    expect(isWorkingDay(new Date(2026, 7, 2), CFG)).toBe(false) // 2 Ağu 2026 Pazar
  })
  it('tatil hariç tutulur', () => {
    const cfg = { ...CFG, holidays: ['2026-07-28'] }
    expect(isWorkingDay(new Date(2026, 6, 28), cfg)).toBe(false) // Salı ama tatil
  })
})

describe('addWorkingHours', () => {
  it('aynı gün içinde kalan süre', () => {
    // Pzt 09:00 + 3 saat = Pzt 12:00
    expect(addWorkingHours(new Date(2026, 6, 27, 9, 0), 3, CFG)).toEqual(new Date(2026, 6, 27, 12, 0))
  })
  it('gün sonunu aşınca ertesi iş gününe taşar', () => {
    // Pzt 16:00 + 4 saat: 2 saat Pzt (18:00) + 2 saat Salı (09:00→11:00)
    expect(addWorkingHours(new Date(2026, 6, 27, 16, 0), 4, CFG)).toEqual(new Date(2026, 6, 28, 11, 0))
  })
  it('24 iş saati = 3 iş günü (9+9+6)', () => {
    // Pzt 09:00 + 24 iş saati → Çar 15:00 (9 Pzt + 9 Salı + 6 Çar)
    expect(addWorkingHours(new Date(2026, 6, 27, 9, 0), 24, CFG)).toEqual(new Date(2026, 6, 29, 15, 0))
  })
  it('Cuma akşamı hafta sonunu atlar', () => {
    // Cuma 17:00 + 2 saat: 1 saat Cuma (18:00) + 1 saat Pzt (09:00→10:00)
    // 31 Tem 2026 Cuma → 3 Ağu 2026 Pzt
    expect(addWorkingHours(new Date(2026, 6, 31, 17, 0), 2, CFG)).toEqual(new Date(2026, 7, 3, 10, 0))
  })
  it('mesai dışı başlangıç gün başına çekilir', () => {
    // Pzt 07:00 (mesai öncesi) + 1 saat → Pzt 10:00 (09:00 baz)
    expect(addWorkingHours(new Date(2026, 6, 27, 7, 0), 1, CFG)).toEqual(new Date(2026, 6, 27, 10, 0))
  })
  it('tatili atlar', () => {
    const cfg = { ...CFG, holidays: ['2026-07-28'] } // Salı tatil
    // Pzt 16:00 + 4 saat: 2 saat Pzt + (Salı tatil) + 2 saat Çar 09:00→11:00
    expect(addWorkingHours(new Date(2026, 6, 27, 16, 0), 4, cfg)).toEqual(new Date(2026, 6, 29, 11, 0))
  })
})

describe('slaStatus', () => {
  it('süresi dolmuş', () => {
    const s = slaStatus(new Date(2026, 6, 27, 9, 0), new Date(2026, 6, 27, 12, 0))
    expect(s.overdue).toBe(true)
  })
  it('yaklaşıyor (12 saat içinde)', () => {
    const s = slaStatus(new Date(2026, 6, 27, 18, 0), new Date(2026, 6, 27, 9, 0))
    expect(s.soon).toBe(true)
    expect(s.overdue).toBe(false)
  })
  it('bol zaman var', () => {
    const s = slaStatus(new Date(2026, 6, 30, 9, 0), new Date(2026, 6, 27, 9, 0))
    expect(s.soon).toBe(false)
    expect(s.overdue).toBe(false)
  })
})
