import { describe, it, expect } from 'vitest'
import { goalProgress, type GoalRow } from '@/hooks/useGoals'

// P6.5/P6.12 — hedef ilerleme + renk (gerçekleşen/hedef, süre-oranıyla).
const base = (over: Partial<GoalRow>): GoalRow => ({
  id: 1, name: 'x', goal_type: 'siparis_sayisi', scope: 'sirket', scope_user_id: null,
  scope_department_id: null, scope_team_id: null, period_type: 'aylik',
  period_start: '2000-01-01', period_end: '2000-01-31', target_value: 100, currency: null, is_active: true, ...over,
})

describe('goalProgress', () => {
  it('%100+ → done', () => {
    expect(goalProgress(base({ target_value: 100, actual: 120 })).tone).toBe('done')
    expect(goalProgress(base({ target_value: 100, actual: 120 })).pct).toBe(120)
  })
  it('geçmiş dönem, hedef altında → fail (beklenen %100)', () => {
    // dönem tamamen geçmiş (2000), gerçekleşen 40/100 → beklenen 100, 40<70 → fail
    expect(goalProgress(base({ target_value: 100, actual: 40 })).tone).toBe('fail')
  })
  it('hedef 0 → pct 0, patlamaz', () => {
    expect(goalProgress(base({ target_value: 0, actual: 0 })).pct).toBe(0)
  })
  it('erken/uzun dönem, beklenenin üstünde → ontrack', () => {
    const g = base({ period_start: '2000-01-01', period_end: '2999-12-31', target_value: 100, actual: 5 })
    // elapsed ~%2.5 → beklenen ~2.5; actual 5 >= 2.25 → ontrack
    expect(goalProgress(g).tone).toBe('ontrack')
  })
})
