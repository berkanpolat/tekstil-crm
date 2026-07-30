import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'

export type TagEntity = 'lead' | 'customer'

export interface EntityTag {
  id: number
  tag_id: number
  label: string
  color: string | null
}

/** Aktif etiketler (seçenek listesi). */
export function useTagOptions() {
  return useQuery({
    queryKey: ['tag-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('id, key, label, color')
        .eq('is_active', true)
        .order('sort_order')
        .order('label')
      if (error) throw error
      return data
    },
  })
}

/** Bir varlığa bağlı etiketler. */
export function useEntityTags(entityType: TagEntity, entityId: number | null) {
  return useQuery({
    queryKey: ['entity-tags', entityType, entityId],
    enabled: entityId != null,
    queryFn: async (): Promise<EntityTag[]> => {
      const { data, error } = await supabase
        .from('entity_tags')
        .select('id, tag_id, tags(label, color)')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId as number)
        .order('id')
      if (error) throw error
      return ((data ?? []) as unknown as { id: number; tag_id: number; tags: { label: string; color: string | null } | null }[]).map(
        (r) => ({ id: r.id, tag_id: r.tag_id, label: r.tags?.label ?? '—', color: r.tags?.color ?? null }),
      )
    },
  })
}

const invalidate = (qc: ReturnType<typeof useQueryClient>, t: TagEntity, id: number) => {
  qc.invalidateQueries({ queryKey: ['entity-tags', t, id] })
  qc.invalidateQueries({ queryKey: ['timeline', t, id] })
}

export function useAddEntityTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { entity_type: TagEntity; entity_id: number; tag_id: number }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      ensureRows(await supabase.from('entity_tags').insert({ ...input, created_by: user?.id ?? null }).select('id'))
    },
    onSuccess: (_d, v) => invalidate(qc, v.entity_type, v.entity_id),
  })
}

/** Toplu etiket ekleme (seçili kayıtlara). Zaten etiketli olanlar atlanır. */
export function useBulkAddTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ entityType, ids, tagId }: { entityType: TagEntity; ids: number[]; tagId: number }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const rows = ids.map((id) => ({ entity_type: entityType, entity_id: id, tag_id: tagId, created_by: user?.id ?? null }))
      const { error } = await supabase
        .from('entity_tags')
        .upsert(rows, { onConflict: 'entity_type,entity_id,tag_id', ignoreDuplicates: true })
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['entity-tags'] })
      qc.invalidateQueries({ queryKey: [v.entityType === 'lead' ? 'leads' : 'customers'] })
    },
  })
}

/** entity_tags fiziksel silinir (P1.1 kararı: etiket kaldırma gerçek silme). */
export function useRemoveEntityTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: number; entity_type: TagEntity; entity_id: number }) => {
      ensureRows(await supabase.from('entity_tags').delete().eq('id', input.id).select('id'))
    },
    onSuccess: (_d, v) => invalidate(qc, v.entity_type, v.entity_id),
  })
}
