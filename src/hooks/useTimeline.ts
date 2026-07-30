import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/lib/database.types'

export type TimelineEntity = 'lead' | 'customer' | 'operation'

export interface TimelineEvent {
  id: number
  event_type: string
  payload: Record<string, Json>
  actor_id: string | null
  actor_name: string | null
  occurred_at: string // olay ne zaman OLDU (sıralama + gösterim)
  created_at: string // ne zaman LOGLANDI (backdate notu için)
}

/**
 * Timeline TEK KAYNAKTAN okur: event_log. Kaynak tablolardan birleştirme YOK —
 * Faz 3+'ta yeni olaylar (teklif/sipariş/ödeme) sadece log_event ile eklenir,
 * bu sorgu değişmez. Sayfalı (limit); "daha fazla" ile büyür.
 */
export function useTimeline(entityType: TimelineEntity, entityId: number | null, limit: number) {
  return useQuery({
    queryKey: ['timeline', entityType, entityId, limit],
    enabled: entityId != null,
    queryFn: async (): Promise<{ rows: TimelineEvent[]; total: number }> => {
      const { data, error, count } = await supabase
        .from('event_log')
        .select('id, event_type, payload, actor_id, occurred_at, created_at', { count: 'exact' })
        .eq('entity_type', entityType)
        .eq('entity_id', String(entityId))
        // "Ne zaman OLDU" sıralaması; aynı ana denk gelenler için ikincil created_at/id.
        .order('occurred_at', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(0, limit - 1)
      if (error) throw error

      const rows = (data ?? []) as Omit<TimelineEvent, 'actor_name'>[]
      // Aktör adları (FK yok; tek ek sorgu).
      const ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[]
      const names: Record<string, string> = {}
      if (ids.length) {
        const { data: users } = await supabase.from('users').select('id, full_name').in('id', ids)
        for (const u of users ?? []) names[u.id] = u.full_name
      }
      return {
        rows: rows.map((r) => ({ ...r, actor_name: r.actor_id ? (names[r.actor_id] ?? null) : null })),
        total: count ?? 0,
      }
    },
  })
}
