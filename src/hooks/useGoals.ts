import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'

export interface GoalRow {
  id: number; name: string; goal_type: string; scope: string; scope_user_id: string | null
  scope_department_id: number | null; scope_team_id: number | null; period_type: string
  period_start: string; period_end: string; target_value: number; currency: string | null; is_active: boolean
  actual?: number
}

/** Hedefler + gerçekleşen (goal_actual). scopeUser verilirse kişisel filtre (dashboard). */
export function useGoals(opts?: { activeOnly?: boolean; scopeUser?: string | null }) {
  return useQuery({
    queryKey: ['goals', opts?.activeOnly, opts?.scopeUser],
    queryFn: async (): Promise<GoalRow[]> => {
      let q = supabase.from('goals').select('*').order('period_end', { ascending: false })
      if (opts?.activeOnly) q = q.eq('is_active', true)
      if (opts?.scopeUser) q = q.eq('scope', 'kisi').eq('scope_user_id', opts.scopeUser)
      const goals = ensureRows(await q) as GoalRow[]
      // gerçekleşen — her hedef için goal_actual (küçük sayıda hedef)
      const actuals = await Promise.all(goals.map((g) => supabase.rpc('goal_actual', { p_goal_id: g.id }).then((r) => Number(r.data ?? 0))))
      return goals.map((g, i) => ({ ...g, actual: actuals[i] }))
    },
  })
}

const invalidate = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['goals'] })

export interface GoalInput {
  name: string; goal_type: string; scope: string; scope_user_id?: string | null; scope_department_id?: number | null
  scope_team_id?: number | null; period_type: string; period_start: string; period_end: string
  target_value: number; currency?: string | null; is_active?: boolean
}
export function useSaveGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (g: GoalInput & { id?: number }) => {
      if (g.id) { const { id, ...rest } = g; return ensureRows(await supabase.from('goals').update(rest as never).eq('id', id).select('id')) }
      const { data: { user } } = await supabase.auth.getUser()
      return ensureRows(await supabase.from('goals').insert({ ...g, created_by: user?.id ?? null } as never).select('id'))
    },
    onSuccess: () => invalidate(qc),
  })
}
export function useDeleteGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => ensureRows(await supabase.from('goals').delete().eq('id', id).select('id')),
    onSuccess: () => invalidate(qc),
  })
}

/** İlerleme + renk: gerçekleşen / hedef, ve süre-oranıyla karşılaştırıp durum verir. */
export function goalProgress(g: GoalRow): { pct: number; tone: 'done' | 'ontrack' | 'risk' | 'fail'; expectedPct: number } {
  const target = Number(g.target_value) || 0
  const actual = Number(g.actual ?? 0)
  const pct = target > 0 ? Math.round((actual / target) * 100) : 0
  const start = new Date(g.period_start).getTime(); const end = new Date(g.period_end).getTime(); const now = Date.now()
  const elapsed = end > start ? Math.min(1, Math.max(0, (now - start) / (end - start))) : 1
  const expectedPct = Math.round(elapsed * 100)
  let toneV: 'done' | 'ontrack' | 'risk' | 'fail'
  if (pct >= 100) toneV = 'done'
  else if (pct >= expectedPct * 0.9) toneV = 'ontrack'
  else if (pct >= expectedPct * 0.6) toneV = 'risk'
  else toneV = 'fail'
  return { pct, tone: toneV, expectedPct }
}
