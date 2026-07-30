import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'

// ---------- Operasyona bağlı etkileşimler (interactions.operation_id) ----------
export interface OperationInteraction {
  id: number
  direction: string
  occurred_at: string
  summary: string | null
  channel_label: string | null
  outcome_label: string | null
  author_name: string | null
}

interface RawOpInteraction {
  id: number; direction: string; occurred_at: string; summary: string | null
  channel: { label: string } | null; outcome: { label: string } | null; author: { full_name: string } | null
}

export function useOperationInteractions(operationId: number | null) {
  return useQuery({
    queryKey: ['operation-interactions', operationId],
    enabled: operationId != null,
    queryFn: async (): Promise<OperationInteraction[]> => {
      const { data, error } = await supabase.from('interactions')
        .select('id, direction, occurred_at, summary, channel:interaction_channels(label), outcome:interaction_outcomes(label), author:users!interactions_created_by_fkey(full_name)')
        .eq('operation_id', operationId as number).is('deleted_at', null)
        .order('occurred_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as unknown as RawOpInteraction[]).map((r) => ({
        id: r.id, direction: r.direction, occurred_at: r.occurred_at, summary: r.summary,
        channel_label: r.channel?.label ?? null, outcome_label: r.outcome?.label ?? null, author_name: r.author?.full_name ?? null,
      }))
    },
  })
}

export function useAddOperationInteraction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { operation_id: number; customer_id: number; channel_id: number; outcome_id: number | null; direction: string; occurred_at: string; summary: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser()
      ensureRows(await supabase.from('interactions').insert({
        entity_type: 'customer', entity_id: input.customer_id, operation_id: input.operation_id,
        channel_id: input.channel_id, outcome_id: input.outcome_id, direction: input.direction,
        occurred_at: input.occurred_at, summary: input.summary, created_by: user?.id ?? null,
      } as never).select('id'))
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['operation-interactions', v.operation_id] })
      qc.invalidateQueries({ queryKey: ['timeline', 'operation', v.operation_id] })
    },
  })
}

// ---------- Revizyon geçmişi (audit_log okuma katmanı) ----------
export interface RevisionRow {
  id: number
  table_name: string
  action: string
  changed_fields: string[] | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  actor_email: string | null
  created_at: string
}

export function useOperationRevisions(operationId: number | null) {
  return useQuery({
    queryKey: ['operation-revisions', operationId],
    enabled: operationId != null,
    queryFn: async (): Promise<RevisionRow[]> => {
      const { data, error } = await supabase.rpc('operation_revisions', { p_operation_id: operationId as number })
      if (error) throw error
      return (data ?? []) as RevisionRow[]
    },
  })
}
