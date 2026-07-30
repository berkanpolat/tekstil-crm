import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'

export type InteractionEntity = 'lead' | 'customer'
export type Direction = 'inbound' | 'outbound'

export interface Interaction {
  id: number
  entity_type: InteractionEntity
  entity_id: number
  channel_id: number
  outcome_id: number | null
  direction: Direction
  occurred_at: string
  summary: string | null
  created_by: string | null
  channel_label: string | null
  outcome_label: string | null
  outcome_positive: boolean | null
  created_by_name: string | null
}

interface RawInteraction {
  id: number
  entity_type: InteractionEntity
  entity_id: number
  channel_id: number
  outcome_id: number | null
  direction: Direction
  occurred_at: string
  summary: string | null
  created_by: string | null
  interaction_channels: { label: string } | null
  interaction_outcomes: { label: string; is_positive: boolean } | null
  author: { full_name: string } | null
}

export function useInteractions(entityType: InteractionEntity, entityId: number | null) {
  return useQuery({
    queryKey: ['interactions', entityType, entityId],
    enabled: entityId != null,
    queryFn: async (): Promise<Interaction[]> => {
      const { data, error } = await supabase
        .from('interactions')
        .select(
          'id, entity_type, entity_id, channel_id, outcome_id, direction, occurred_at, summary, created_by,' +
            ' interaction_channels(label), interaction_outcomes(label, is_positive),' +
            ' author:users!interactions_created_by_fkey(full_name)',
        )
        .eq('entity_type', entityType)
        .eq('entity_id', entityId as number)
        .is('deleted_at', null)
        .order('occurred_at', { ascending: false })
      if (error) throw error
      const raw = (data ?? []) as unknown as RawInteraction[]
      return raw.map((r) => ({
        id: r.id,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        channel_id: r.channel_id,
        outcome_id: r.outcome_id,
        direction: r.direction,
        occurred_at: r.occurred_at,
        summary: r.summary,
        created_by: r.created_by,
        channel_label: r.interaction_channels?.label ?? null,
        outcome_label: r.interaction_outcomes?.label ?? null,
        outcome_positive: r.interaction_outcomes?.is_positive ?? null,
        created_by_name: r.author?.full_name ?? null,
      }))
    },
  })
}

export interface InteractionInput {
  entity_type: InteractionEntity
  entity_id: number
  channel_id: number
  outcome_id: number | null
  direction: Direction
  occurred_at: string
  summary: string | null
}

const invalidate = (qc: ReturnType<typeof useQueryClient>, t: InteractionEntity, id: number) => {
  qc.invalidateQueries({ queryKey: ['interactions', t, id] })
  // last_interaction_at parent'ta trigger ile değişti → liste/kart tazelensin.
  qc.invalidateQueries({ queryKey: [t === 'lead' ? 'leads' : 'customers'] })
  qc.invalidateQueries({ queryKey: [t === 'lead' ? 'lead' : 'customer', id] })
}

export function useAddInteraction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: InteractionInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      ensureRows(
        await supabase
          .from('interactions')
          .insert({ ...input, created_by: user?.id ?? null })
          .select('id'),
      )
    },
    onSuccess: (_d, v) => invalidate(qc, v.entity_type, v.entity_id),
  })
}

export function useDeleteInteraction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (it: Interaction) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      ensureRows(
        await supabase
          .from('interactions')
          .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
          .eq('id', it.id)
          .is('deleted_at', null)
          .select('id'),
      )
    },
    onSuccess: (_d, it) => invalidate(qc, it.entity_type, it.entity_id),
  })
}

// --- Referans seçenekleri ---
export function useChannelOptions() {
  return useQuery({
    queryKey: ['interaction-channel-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('interaction_channels')
        .select('id, key, label')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return data
    },
  })
}

export function useOutcomeOptions() {
  return useQuery({
    queryKey: ['interaction-outcome-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('interaction_outcomes')
        .select('id, key, label, is_positive')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return data
    },
  })
}
