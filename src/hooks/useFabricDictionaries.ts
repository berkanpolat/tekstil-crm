import { useReferenceQuery } from '@/hooks/useReferenceQuery'
import { supabase } from '@/lib/supabase'

/**
 * Katalog özellik sözlükleri — M1.1/M1.2 ile gelen kumaş / kalıp / baskı tabloları.
 *
 * Kumaş iki kademeli: grup (Dokuma, Örme, Denim …) → tip (Süprem, Compact Penye …).
 * Aynı kumaş adı birden çok grupta geçebildiği için (Polyester 4 grupta) tip anahtarı
 * yalnız grubu içinde benzersizdir; seçim her zaman ÖNCE grup, sonra tip sırasıyla yapılır.
 *
 * `database.types.ts` M1.3'te yeniden üretildi; bu tablolar artık tiplerde var, cast gerekmiyor.
 */

export interface DictRow { id: number; key: string; label: string }

export interface FabricOptions {
  groups: DictRow[]
  typesByGroup: Record<number, DictRow[]>
  /** tip id → ait olduğu grup id (düzenlemede grubu otomatik seçmek için) */
  groupOfType: Record<number, number>
}

/** Kumaş grupları + gruba bağlı tipler (tek istek). */
export function useFabricOptions() {
  return useReferenceQuery({
    queryKey: ['fabric-options'],
    queryFn: async (): Promise<FabricOptions> => {
      const [g, t] = await Promise.all([
        supabase.from('fabric_groups').select('id, key, label').eq('is_active', true).order('sort_order').order('label'),
        supabase.from('fabric_types').select('id, key, label, group_id').eq('is_active', true).order('sort_order').order('label'),
      ])
      if (g.error) throw g.error
      if (t.error) throw t.error
      const groups = (g.data ?? []) as DictRow[]
      const types = (t.data ?? []) as (DictRow & { group_id: number })[]
      const typesByGroup: Record<number, DictRow[]> = {}
      const groupOfType: Record<number, number> = {}
      for (const r of types) {
        ;(typesByGroup[r.group_id] ??= []).push({ id: r.id, key: r.key, label: r.label })
        groupOfType[r.id] = r.group_id
      }
      return { groups, typesByGroup, groupOfType }
    },
  })
}

/** Kalıp (fit) tipleri. */
export function useFitOptions() {
  return useReferenceQuery({
    queryKey: ['fit-options'],
    queryFn: async (): Promise<DictRow[]> => {
      const { data, error } = await supabase.from('fit_types')
        .select('id, key, label').eq('is_active', true).order('sort_order').order('label')
      if (error) throw error
      return (data ?? []) as DictRow[]
    },
  })
}

/** Baskı teknikleri. */
export function usePrintOptions() {
  return useReferenceQuery({
    queryKey: ['print-options'],
    queryFn: async (): Promise<DictRow[]> => {
      const { data, error } = await supabase.from('print_types')
        .select('id, key, label').eq('is_active', true).order('sort_order').order('label')
      if (error) throw error
      return (data ?? []) as DictRow[]
    },
  })
}
