import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'
import type { Json } from '@/lib/database.types'

export interface SettingRow {
  key: string
  value: Json
  category: string
  is_sensitive: boolean
  is_deprecated: boolean
  description: string | null
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async (): Promise<Record<string, SettingRow>> => {
      const { data, error } = await supabase
        .from('settings')
        .select('key, value, category, is_sensitive, is_deprecated, description')
      if (error) throw error
      const map: Record<string, SettingRow> = {}
      for (const row of data ?? []) map[row.key] = row as SettingRow
      return map
    },
  })
}

/** Kullanım dışı (emekliye ayrılmış) ayarlar — UI'da varsayılan gizli, toggle ile gösterilir. */
export function useDeprecatedSettings() {
  return useQuery({
    queryKey: ['settings-deprecated'],
    queryFn: async (): Promise<SettingRow[]> => {
      const { data, error } = await supabase
        .from('settings')
        .select('key, value, category, is_sensitive, is_deprecated, description')
        .eq('is_deprecated', true)
        .order('key')
      if (error) throw error
      return (data ?? []) as SettingRow[]
    },
  })
}

export function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (updates: { key: string; value: Json }[]) => {
      for (const u of updates) {
        ensureRows(await supabase.from('settings').update({ value: u.value }).eq('key', u.key).select('key'))
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['setting-history'] })
    },
  })
}

export interface SettingHistoryEntry {
  id: number
  old_value: Json
  new_value: Json
  changed_at: string
  changed_by: string | null
  changed_by_name: string | null
}

export function useSettingHistory(key: string | null) {
  return useQuery({
    queryKey: ['setting-history', key],
    enabled: !!key,
    queryFn: async (): Promise<SettingHistoryEntry[]> => {
      const { data, error } = await supabase
        .from('setting_history')
        .select('id, old_value, new_value, changed_at, changed_by')
        .eq('setting_key', key as string)
        .order('changed_at', { ascending: false })
        .limit(50)
      if (error) throw error

      // changed_by (uuid) → ad çözümü (FK yok; ayrı sorgu).
      const ids = [...new Set((data ?? []).map((r) => r.changed_by).filter(Boolean))] as string[]
      const names: Record<string, string> = {}
      if (ids.length) {
        const { data: users } = await supabase.from('users').select('id, full_name').in('id', ids)
        for (const u of users ?? []) names[u.id] = u.full_name
      }
      return (data ?? []).map((r) => ({
        id: r.id,
        old_value: r.old_value,
        new_value: r.new_value,
        changed_at: r.changed_at,
        changed_by: r.changed_by,
        changed_by_name: r.changed_by ? (names[r.changed_by] ?? null) : null,
      }))
    },
  })
}
