import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'
import { normalizeContactValue } from '@/lib/phone'

export type ContactType = 'phone' | 'email' | 'whatsapp' | 'instagram' | 'telegram' | 'website'
export type EntityType = 'lead' | 'customer'

export interface ContactPoint {
  id: number
  entity_type: EntityType
  entity_id: number
  type: ContactType
  value: string
  value_normalized: string | null
  label: string | null
  is_primary: boolean
}

export function useContactPoints(entityType: EntityType, entityId: number | null) {
  return useQuery({
    queryKey: ['contact-points', entityType, entityId],
    enabled: entityId != null,
    queryFn: async (): Promise<ContactPoint[]> => {
      const { data, error } = await supabase
        .from('contact_points')
        .select('id, entity_type, entity_id, type, value, value_normalized, label, is_primary')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId as number)
        .order('is_primary', { ascending: false })
        .order('id')
      if (error) throw error
      return data as ContactPoint[]
    },
  })
}

export interface ContactPointInput {
  entity_type: EntityType
  entity_id: number
  type: ContactType
  value: string
  label?: string | null
  is_primary?: boolean
}

export function useAddContactPoint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ContactPointInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      ensureRows(
        await supabase
          .from('contact_points')
          .insert({
            entity_type: input.entity_type,
            entity_id: input.entity_id,
            type: input.type,
            value: input.value.trim(),
            value_normalized: normalizeContactValue(input.type, input.value),
            label: input.label ?? null,
            is_primary: input.is_primary ?? false,
            created_by: user?.id ?? null,
          })
          .select('id'),
      )
    },
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ['contact-points', v.entity_type, v.entity_id] }),
  })
}

export function useUpdateContactPoint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cp: ContactPoint) => {
      ensureRows(
        await supabase
          .from('contact_points')
          .update({
            type: cp.type,
            value: cp.value.trim(),
            value_normalized: normalizeContactValue(cp.type, cp.value),
            label: cp.label,
            is_primary: cp.is_primary,
          })
          .eq('id', cp.id)
          .select('id'),
      )
    },
    onSuccess: (_d, cp) =>
      qc.invalidateQueries({ queryKey: ['contact-points', cp.entity_type, cp.entity_id] }),
  })
}

export function useDeleteContactPoint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cp: ContactPoint) => {
      ensureRows(await supabase.from('contact_points').delete().eq('id', cp.id).select('id'))
    },
    onSuccess: (_d, cp) =>
      qc.invalidateQueries({ queryKey: ['contact-points', cp.entity_type, cp.entity_id] }),
  })
}
