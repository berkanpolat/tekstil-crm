import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'

// ── Referans (durum/öncelik) ──────────────────────────────────────────────────
export function useTaskStatuses() {
  return useQuery({
    queryKey: ['task-statuses'], staleTime: 300_000,
    queryFn: async () => ensureRows(await supabase.from('task_statuses').select('*').eq('is_active', true).order('sort_order')),
  })
}
export function useTaskPriorities() {
  return useQuery({
    queryKey: ['task-priorities'], staleTime: 300_000,
    queryFn: async () => ensureRows(await supabase.from('task_priorities').select('*').eq('is_active', true).order('sort_order')),
  })
}

// ── Görev listesi ─────────────────────────────────────────────────────────────
export type TaskView = 'all' | 'mine' | 'today' | 'week' | 'overdue' | 'created'
export interface TaskFilters {
  view?: TaskView; statusId?: number | null; priorityId?: number | null; assignedTo?: string | null
  entityType?: string | null; entityId?: number | null; search?: string
}
export interface TaskRow {
  id: number; title: string; description: string | null; status_id: number | null; priority_id: number | null
  assigned_to: string | null; created_by: string | null; entity_type: string | null; entity_id: number | null
  due_at: string | null; started_at: string | null; completed_at: string | null; estimated_hours: number | null
  source: string; sort_order: number; created_at: string
  status_key: string | null; status_label: string | null; status_color: string | null; status_closed: boolean
  priority_key: string | null; priority_label: string | null; priority_color: string | null; priority_weight: number
  assignee_name: string | null
}
interface RawTask extends Omit<TaskRow, 'status_key' | 'status_label' | 'status_color' | 'status_closed' | 'priority_key' | 'priority_label' | 'priority_color' | 'priority_weight' | 'assignee_name'> {
  task_statuses: { key: string; label: string; color: string | null; is_closed: boolean } | null
  task_priorities: { key: string; label: string; color: string | null; weight: number } | null
  assignee: { full_name: string | null } | null
}
const SELECT = 'id, title, description, status_id, priority_id, assigned_to, created_by, entity_type, entity_id, due_at, started_at, completed_at, estimated_hours, source, sort_order, created_at,'
  + ' task_statuses(key,label,color,is_closed), task_priorities(key,label,color,weight), assignee:users!tasks_assigned_to_fkey(full_name)'
function mapTask(r: RawTask): TaskRow {
  const { task_statuses, task_priorities, assignee, ...rest } = r
  return { ...rest, status_key: task_statuses?.key ?? null, status_label: task_statuses?.label ?? null, status_color: task_statuses?.color ?? null, status_closed: task_statuses?.is_closed ?? false,
    priority_key: task_priorities?.key ?? null, priority_label: task_priorities?.label ?? null, priority_color: task_priorities?.color ?? null, priority_weight: task_priorities?.weight ?? 0,
    assignee_name: assignee?.full_name ?? null }
}

export function useTaskList(filters: TaskFilters, meId?: string | null) {
  return useQuery({
    queryKey: ['tasks', filters, meId],
    queryFn: async (): Promise<TaskRow[]> => {
      let q = supabase.from('tasks').select(SELECT).is('deleted_at', null)
      if (filters.statusId) q = q.eq('status_id', filters.statusId)
      if (filters.priorityId) q = q.eq('priority_id', filters.priorityId)
      if (filters.assignedTo) q = q.eq('assigned_to', filters.assignedTo)
      if (filters.entityType) q = q.eq('entity_type', filters.entityType)
      if (filters.entityId != null) q = q.eq('entity_id', filters.entityId)
      if (filters.search) q = q.ilike('title', `%${filters.search}%`)
      // hazır görünümler
      const now = new Date()
      if (filters.view === 'mine' && meId) q = q.eq('assigned_to', meId)
      if (filters.view === 'created' && meId) q = q.eq('created_by', meId)
      if (filters.view === 'today') { const end = new Date(now); end.setHours(23, 59, 59); q = q.lte('due_at', end.toISOString()).is('completed_at', null) }
      if (filters.view === 'week') { const end = new Date(now.getTime() + 7 * 864e5); q = q.lte('due_at', end.toISOString()).is('completed_at', null) }
      if (filters.view === 'overdue') q = q.lt('due_at', now.toISOString()).is('completed_at', null)
      q = q.order('sort_order').order('due_at', { nullsFirst: false }).order('id', { ascending: false }).limit(500)
      return (ensureRows(await q) as unknown as RawTask[]).map(mapTask)
    },
  })
}

export function useTask(id: number | null) {
  return useQuery({
    enabled: id != null, queryKey: ['task', id],
    queryFn: async (): Promise<TaskRow | null> => {
      const rows = ensureRows(await supabase.from('tasks').select(SELECT).eq('id', id!).is('deleted_at', null)) as unknown as RawTask[]
      return rows[0] ? mapTask(rows[0]) : null
    },
  })
}

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['task'] })
  qc.invalidateQueries({ queryKey: ['user-workload'] })
}

export interface TaskInput {
  title: string; description?: string | null; status_id?: number | null; priority_id?: number | null
  assigned_to?: string | null; entity_type?: string | null; entity_id?: number | null
  due_at?: string | null; estimated_hours?: number | null; source?: string; sort_order?: number
}
export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (t: TaskInput): Promise<number> => {
      const { data: { user } } = await supabase.auth.getUser()
      const rows = ensureRows(await supabase.from('tasks').insert({ ...t, created_by: user?.id ?? null } as never).select('id'))
      return (rows as { id: number }[])[0]!.id
    },
    onSuccess: () => invalidate(qc),
  })
}
export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<TaskInput> & { id: number }) =>
      ensureRows(await supabase.from('tasks').update(patch as never).eq('id', id).select('id')),
    onSuccess: () => invalidate(qc),
  })
}
export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data: { user } } = await supabase.auth.getUser()
      return ensureRows(await supabase.from('tasks').update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null } as never).eq('id', id).select('id'))
    },
    onSuccess: () => invalidate(qc),
  })
}

// ── Bağımlılıklar (yumuşak kapı) ──────────────────────────────────────────────
export function useTaskBlocking(taskId: number | null) {
  return useQuery({
    enabled: taskId != null, queryKey: ['task-blocking', taskId],
    queryFn: async () => ensureRows(await supabase.rpc('task_blocking', { p_task_id: taskId! })),
  })
}
export function useTaskDependencies(taskId: number | null) {
  return useQuery({
    enabled: taskId != null, queryKey: ['task-deps', taskId],
    queryFn: async () => ensureRows(await supabase.from('task_dependencies')
      .select('id, depends_on_task_id, dependency_type, dep:tasks!task_dependencies_depends_on_task_id_fkey(title, status_id)').eq('task_id', taskId!)),
  })
}
export function useSetDependency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ taskId, dependsOn, remove }: { taskId: number; dependsOn: number; remove?: boolean }) => {
      if (remove) return ensureRows(await supabase.from('task_dependencies').delete().eq('task_id', taskId).eq('depends_on_task_id', dependsOn).select('id'))
      return ensureRows(await supabase.from('task_dependencies').insert({ task_id: taskId, depends_on_task_id: dependsOn } as never).select('id'))
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['task-deps', v.taskId] }); qc.invalidateQueries({ queryKey: ['task-blocking', v.taskId] }) },
  })
}

// ── Sorumluluk geçmişi + iş yükü ──────────────────────────────────────────────
export function useTaskAssignments(taskId: number | null) {
  return useQuery({
    enabled: taskId != null, queryKey: ['task-assignments', taskId],
    queryFn: async () => ensureRows(await supabase.from('task_assignments')
      .select('id, assigned_at, unassigned_at, reason, who:users!task_assignments_assigned_to_fkey(full_name), by:users!task_assignments_assigned_by_fkey(full_name)')
      .eq('task_id', taskId!).order('assigned_at', { ascending: false })),
  })
}
// ── Otomatik öneriler (P6.3/P6.4) ─────────────────────────────────────────────
export interface Suggestion {
  kind: 'template' | 'workflow_step'; ref_id: number; trigger_event: string; workflow_name?: string
  title: string; description: string | null; priority_id: number | null; assignee_rule: string
  resolved_assignee: string | null; due_offset_hours: number
}
export function useOperationSuggestions(operationId: number | null) {
  return useQuery({
    enabled: operationId != null, queryKey: ['op-suggestions', operationId],
    queryFn: async (): Promise<Suggestion[]> => {
      const [tpl, wf] = await Promise.all([
        supabase.rpc('operation_task_suggestions', { p_operation_id: operationId! }),
        supabase.rpc('operation_workflow_suggestions', { p_operation_id: operationId! }),
      ])
      const a = (tpl.data ?? []).map((r: Record<string, unknown>) => ({ kind: 'template' as const, ref_id: Number(r.template_id), trigger_event: String(r.trigger_event), title: String(r.title), description: (r.description as string) ?? null, priority_id: (r.priority_id as number) ?? null, assignee_rule: String(r.assignee_rule), resolved_assignee: (r.resolved_assignee as string) ?? null, due_offset_hours: Number(r.due_offset_hours) }))
      const b = (wf.data ?? []).map((r: Record<string, unknown>) => ({ kind: 'workflow_step' as const, ref_id: Number(r.step_id), trigger_event: String(r.trigger_event), workflow_name: String(r.workflow_name), title: String(r.title), description: (r.description as string) ?? null, priority_id: (r.priority_id as number) ?? null, assignee_rule: String(r.assignee_rule), resolved_assignee: (r.resolved_assignee as string) ?? null, due_offset_hours: Number(r.due_offset_hours) }))
      return [...a, ...b]
    },
  })
}
export function useAcceptSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { operationId: number; s: Suggestion; title: string; assigned_to: string | null; priority_id: number | null }) => {
      // due = şimdi + şablon offset (callback'te hesaplanır; render'da Date.now yasak)
      const dueAt = new Date(Date.now() + a.s.due_offset_hours * 3600_000).toISOString()
      const { data, error } = await supabase.rpc('accept_task_suggestion', {
        p_operation_id: a.operationId, p_kind: a.s.kind, p_ref_id: a.s.ref_id,
        p_title: a.title, p_description: a.s.description, p_priority_id: a.priority_id, p_assigned_to: a.assigned_to, p_due_at: dueAt,
      })
      if (error) throw error
      return data
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['op-suggestions', v.operationId] }); qc.invalidateQueries({ queryKey: ['tasks'] }) },
  })
}
export function useDismissSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { operationId: number; s: Suggestion; reason?: string }) => {
      const { error } = await supabase.rpc('dismiss_task_suggestion', { p_operation_id: a.operationId, p_kind: a.s.kind, p_ref_id: a.s.ref_id, p_reason: a.reason ?? null })
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['op-suggestions', v.operationId] }),
  })
}

export interface Workload { open_count: number; estimated_hours: number }
export function useUserWorkload(userId: string | null) {
  return useQuery({
    enabled: !!userId, queryKey: ['user-workload', userId],
    queryFn: async (): Promise<Workload> => {
      const { data, error } = await supabase.rpc('user_workload', { p_user_id: userId! })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return { open_count: Number(row?.open_count ?? 0), estimated_hours: Number(row?.estimated_hours ?? 0) }
    },
  })
}
