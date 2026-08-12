import { describe, it, expect } from 'vitest'
import { pickNextAction, type NextActionTask } from '@/lib/nextAction'

const NOW = new Date('2026-08-12T12:00:00Z').getTime()
const t = (o: Partial<NextActionTask>): NextActionTask => ({
  title: 'X', due_at: null, completed_at: null, status_closed: false, ...o,
})

describe('pickNextAction', () => {
  it('açık görev yoksa null', () => {
    expect(pickNextAction([], NOW)).toBeNull()
    expect(pickNextAction([t({ status_closed: true }), t({ completed_at: '2026-08-01T00:00:00Z' })], NOW)).toBeNull()
  })

  it('en yakın due_at\'li açık görevi seçer', () => {
    const next = pickNextAction([
      t({ title: 'Uzak', due_at: '2026-08-20T12:00:00Z' }),
      t({ title: 'Yakın', due_at: '2026-08-13T12:00:00Z' }),
    ], NOW)
    expect(next?.title).toBe('Yakın')
    expect(next?.overdue).toBe(false)
  })

  it('due_at geçmişteyse overdue=true', () => {
    const next = pickNextAction([t({ title: 'Gecikmiş', due_at: '2026-08-10T12:00:00Z' })], NOW)
    expect(next).toEqual({ title: 'Gecikmiş', due_at: '2026-08-10T12:00:00Z', overdue: true })
  })

  it('kapalı/tamamlanmış görevleri yok sayar, tarihlileri tarihsizlere yeğler', () => {
    const next = pickNextAction([
      t({ title: 'Kapalı', due_at: '2026-08-01T00:00:00Z', status_closed: true }),
      t({ title: 'Tarihsiz' }),
      t({ title: 'Tarihli', due_at: '2026-08-15T12:00:00Z' }),
    ], NOW)
    expect(next?.title).toBe('Tarihli')
  })

  it('tarihli açık görev yoksa ilk açık (tarihsiz) görevi döner', () => {
    const next = pickNextAction([t({ title: 'Sadece bu' })], NOW)
    expect(next).toEqual({ title: 'Sadece bu', due_at: null, overdue: false })
  })
})
