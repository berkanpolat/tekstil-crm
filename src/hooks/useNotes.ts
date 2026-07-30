import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'

export type NoteEntity = 'lead' | 'customer' | 'operation' | 'task'

export interface Note {
  id: number
  entity_type: NoteEntity
  entity_id: number
  body: string
  is_internal: boolean
  created_by: string | null
  created_at: string
  author_name: string | null
}

interface RawNote {
  id: number
  entity_type: NoteEntity
  entity_id: number
  body: string
  is_internal: boolean
  created_by: string | null
  created_at: string
  author: { full_name: string } | null
}

export function useNotes(entityType: NoteEntity, entityId: number | null) {
  return useQuery({
    queryKey: ['notes', entityType, entityId],
    enabled: entityId != null,
    queryFn: async (): Promise<Note[]> => {
      const { data, error } = await supabase
        .from('notes')
        .select('id, entity_type, entity_id, body, is_internal, created_by, created_at, author:users!notes_created_by_fkey(full_name)')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId as number)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as unknown as RawNote[]).map((n) => ({
        id: n.id,
        entity_type: n.entity_type,
        entity_id: n.entity_id,
        body: n.body,
        is_internal: n.is_internal,
        created_by: n.created_by,
        created_at: n.created_at,
        author_name: n.author?.full_name ?? null,
      }))
    },
  })
}

const invalidate = (qc: ReturnType<typeof useQueryClient>, t: NoteEntity, id: number) => {
  qc.invalidateQueries({ queryKey: ['notes', t, id] })
  qc.invalidateQueries({ queryKey: ['timeline', t, id] })
}

export function useAddNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { entity_type: NoteEntity; entity_id: number; body: string; is_internal?: boolean }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      ensureRows(
        await supabase.from('notes').insert({ ...input, created_by: user?.id ?? null }).select('id'),
      )
    },
    onSuccess: (_d, v) => invalidate(qc, v.entity_type, v.entity_id),
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (note: Note) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      ensureRows(
        await supabase
          .from('notes')
          .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
          .eq('id', note.id)
          .is('deleted_at', null)
          .select('id'),
      )
    },
    onSuccess: (_d, n) => invalidate(qc, n.entity_type, n.entity_id),
  })
}
