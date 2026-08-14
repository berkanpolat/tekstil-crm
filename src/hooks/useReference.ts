import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useReferenceQuery } from '@/hooks/useReferenceQuery'
import { supabase } from '@/lib/supabase'
import { AppError, ensureRows } from '@/lib/errors'

export type ReferenceTable =
  | 'interaction_channels'
  | 'interaction_outcomes'
  | 'lead_sources'
  | 'lead_statuses'
  | 'customer_types'
  | 'tags'
  // Operasyon Tanımları (Faz 3)
  | 'operation_stages'
  | 'request_statuses'
  | 'quote_statuses'
  | 'sample_statuses'
  | 'order_statuses'
  | 'request_channels'
  | 'cancellation_reasons'
  | 'quote_rejection_reasons'
  | 'payment_terms'

export interface ReferenceRow {
  id: number
  key: string
  label: string
  sort_order: number
  color: string | null
  is_active: boolean
  is_system: boolean
  is_positive?: boolean
  is_closed?: boolean
}

export function useReferenceList(table: ReferenceTable) {
  return useReferenceQuery({
    queryKey: ['reference', table],
    queryFn: async (): Promise<ReferenceRow[]> => {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order('sort_order')
        .order('label')
      if (error) throw error
      return (data ?? []) as unknown as ReferenceRow[]
    },
  })
}

export interface ReferenceInput {
  key: string
  label: string
  sort_order: number
  color: string | null
  is_active: boolean
  is_positive?: boolean
  is_closed?: boolean
}

export function useSaveReference(table: ReferenceTable) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...fields }: ReferenceInput & { id?: number }) => {
      // Dinamik tablo (union) — payload tipini gevşetiyoruz; alanlar config'e göre doğru.
      const res = id
        ? await supabase.from(table).update(fields as never).eq('id', id).select('id')
        : await supabase.from(table).insert(fields as never).select('id')
      if (res.error?.code === '23505') throw new AppError('Bu anahtar (key) zaten kullanılıyor.')
      ensureRows(res)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reference', table] }),
  })
}

export function useSetReferenceActive(table: ReferenceTable) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      ensureRows(await supabase.from(table).update({ is_active }).eq('id', id).select('id'))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reference', table] }),
  })
}
