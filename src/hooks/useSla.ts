import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { DEFAULT_WORKING_HOURS, type WorkingHoursConfig } from '@/lib/workingHours'

export interface SlaConfig {
  working: WorkingHoursConfig
  responseHours: number
  warnAtPercent: number
  escalateAfterHours: number
}

const jval = <T,>(rows: { key: string; value: unknown }[], key: string, fallback: T): T => {
  const r = rows.find((x) => x.key === key)
  return (r ? (r.value as T) : fallback)
}

/** working_hours.* + sla.* ayarlarını okur. sla_deadline hesabı bununla yapılır. */
export function useSlaConfig() {
  return useQuery({
    queryKey: ['sla-config'],
    staleTime: 300_000,
    queryFn: async (): Promise<SlaConfig> => {
      const { data } = await supabase.from('settings').select('key, value')
        .or('key.like.working_hours.%,key.like.sla.%')
      const rows = (data ?? []) as { key: string; value: unknown }[]
      return {
        working: {
          days: jval(rows, 'working_hours.days', DEFAULT_WORKING_HOURS.days),
          start: jval(rows, 'working_hours.start', DEFAULT_WORKING_HOURS.start),
          end: jval(rows, 'working_hours.end', DEFAULT_WORKING_HOURS.end),
          holidays: jval(rows, 'working_hours.holidays', DEFAULT_WORKING_HOURS.holidays),
        },
        responseHours: Number(jval(rows, 'sla.request_response_hours', 24)),
        warnAtPercent: Number(jval(rows, 'sla.warn_at_percent', 50)),
        escalateAfterHours: Number(jval(rows, 'sla.escalate_after_hours', 48)),
      }
    },
  })
}

/** Talep tarihinden SLA son tarihini hesaplar — DÜZ takvim saati (H1; iş-saati yok). */
export function computeSlaDeadline(requestedAt: Date, cfg: SlaConfig): Date {
  return new Date(requestedAt.getTime() + cfg.responseHours * 3600 * 1000)
}

/**
 * Üst çubuk rozeti (havuz modeli): toplam değil, KULLANICIYA AİT açık dosyalar
 * (sorumlu = ben + süresi dolmuş/bugün) + ayrı SAHİPSİZ talep sayısı.
 */
export function useSlaCounts(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['sla-counts', userId],
    enabled: !!userId,
    refetchInterval: 120_000,
    queryFn: async (): Promise<{ mine: number; unassigned: number }> => {
      await supabase.rpc('sla_sweep') // eşik olayları (Faz 6 bildirim merkezi)
      const end = new Date(); end.setHours(23, 59, 59, 999)
      const active = () => supabase.from('operations').select('id', { count: 'exact', head: true })
        .is('deleted_at', null).is('cancelled_at', null)
      // Bana ait + teklif süresi dolmuş/bugün dolacak
      const mine = await active().eq('owner_id', userId as string)
        .not('sla_deadline', 'is', null).lte('sla_deadline', end.toISOString())
      // Sahipsiz + hâlâ teklif bekleyen (havuzda bekleyen talep)
      const unassigned = await active().is('owner_id', null)
        .not('sla_deadline', 'is', null).lte('sla_deadline', end.toISOString())
      return { mine: mine.count ?? 0, unassigned: unassigned.count ?? 0 }
    },
  })
}
