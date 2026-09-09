import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Hızlı Çalışma Ekranı — listeyi zenginleştiren salt-okunur yardımcı sorgular.
// useOperationList'e DOKUNMADAN, sayfadaki operasyon id'leri için ek veri getirir.

export interface LastNote {
  summary: string | null
  occurred_at: string
  author_name: string | null
}

interface RawLastNote {
  operation_id: number | null
  summary: string | null
  occurred_at: string
  author: { full_name: string } | null
}

/**
 * Verilen operasyon id'leri için EN SON etkileşimi (not) toplu getirir. Tek sorgu,
 * occurred_at DESC; her operasyonun ilk (en yeni) kaydı alınır. Liste sütunundaki
 * "Son not" ve "Bekleme süresi" (son temas) bundan beslenir.
 */
export function useLastNotes(operationIds: number[]) {
  const key = operationIds.slice().sort((a, b) => a - b).join(',')
  return useQuery({
    queryKey: ['calisma-last-notes', key],
    enabled: operationIds.length > 0,
    queryFn: async (): Promise<Map<number, LastNote>> => {
      const { data, error } = await supabase
        .from('interactions')
        .select('operation_id, summary, occurred_at, author:users!interactions_created_by_fkey(full_name)')
        .in('operation_id', operationIds)
        .is('deleted_at', null)
        .order('occurred_at', { ascending: false })
      if (error) throw error
      const map = new Map<number, LastNote>()
      for (const r of (data ?? []) as unknown as RawLastNote[]) {
        if (r.operation_id != null && !map.has(r.operation_id)) {
          map.set(r.operation_id, {
            summary: r.summary,
            occurred_at: r.occurred_at,
            author_name: r.author?.full_name ?? null,
          })
        }
      }
      return map
    },
  })
}
