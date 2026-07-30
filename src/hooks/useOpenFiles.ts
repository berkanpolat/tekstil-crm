import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type OpenFileType = 'teklif_bekleniyor' | 'sonuc_bekleniyor' | 'olumlu_beklemede'

export interface OpenFile {
  id: number
  operation_id: number
  file_type: OpenFileType
  opened_at: string
  due_at: string
  assigned_to: string | null
  snooze_until: string | null
  snooze_count: number
  last_level: number
}

export interface OpenFileSnooze { id: number; reason: string; snoozed_until: string; snoozed_by: string | null; created_at: string; by_name: string | null }

const OF_LABEL: Record<OpenFileType, string> = {
  teklif_bekleniyor: 'Teklif bekleniyor', sonuc_bekleniyor: 'Sonuç bekleniyor', olumlu_beklemede: 'Olumlu — beklemede',
}
export const openFileLabel = (t: string) => OF_LABEL[t as OpenFileType] ?? t

/** Bir operasyonun açık dosyaları + erteleme geçmişi (operasyon kartı bandı). */
export function useOperationOpenFiles(operationId: number | null) {
  return useQuery({
    queryKey: ['open-files', operationId],
    enabled: operationId != null,
    queryFn: async (): Promise<{ files: OpenFile[]; snoozes: OpenFileSnooze[] }> => {
      const { data: files, error } = await supabase.from('open_files')
        .select('id, operation_id, file_type, opened_at, due_at, assigned_to, snooze_until, snooze_count, last_level')
        .eq('operation_id', operationId as number).is('closed_at', null).order('due_at')
      if (error) throw error
      const ids = (files ?? []).map((f) => f.id)
      let snoozes: OpenFileSnooze[] = []
      if (ids.length) {
        const { data: sn } = await supabase.from('open_file_snoozes')
          .select('id, reason, snoozed_until, snoozed_by, created_at, users:snoozed_by(full_name)')
          .in('open_file_id', ids).order('created_at', { ascending: false })
        snoozes = ((sn ?? []) as unknown as { id: number; reason: string; snoozed_until: string; snoozed_by: string | null; created_at: string; users: { full_name: string } | null }[])
          .map((s) => ({ id: s.id, reason: s.reason, snoozed_until: s.snoozed_until, snoozed_by: s.snoozed_by, created_at: s.created_at, by_name: s.users?.full_name ?? null }))
      }
      return { files: (files ?? []) as OpenFile[], snoozes }
    },
  })
}

/** Üst çubuk rozetleri (B.7): BANA ait açık dosyalar (süresi dolmuş/bugün) + SAHİPSİZ havuz. */
export function useOpenFileCounts(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['open-file-counts', userId],
    enabled: !!userId,
    refetchInterval: 120_000,
    queryFn: async (): Promise<{ mine: number; unassigned: number }> => {
      const end = new Date(); end.setHours(23, 59, 59, 999)
      const base = () => supabase.from('open_files').select('id', { count: 'exact', head: true }).is('closed_at', null).lte('due_at', end.toISOString())
      const mine = await base().eq('assigned_to', userId as string)
      const unassigned = await base().is('assigned_to', null)
      return { mine: mine.count ?? 0, unassigned: unassigned.count ?? 0 }
    },
  })
}

/** Ertele (B.3): sebep + tarih zorunlu (RPC doğrular). */
export function useSnoozeOpenFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason, until }: { id: number; operationId: number; reason: string; until: string }) => {
      const { error } = await supabase.rpc('snooze_open_file', { p_open_file_id: id, p_reason: reason, p_until: until })
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['open-files', v.operationId] })
      qc.invalidateQueries({ queryKey: ['open-file-counts'] })
    },
  })
}
