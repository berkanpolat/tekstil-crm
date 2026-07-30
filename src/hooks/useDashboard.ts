import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** P7.2 — Çalışan gösterge paneli satırı (açık dosya / havuz / erteleme). */
export interface DashRow {
  key: string
  operation_id: number
  code: string
  customer_name: string | null
  category_label: string | null
  due_at: string | null        // açık dosya due_at ya da operasyon sla_deadline
  opened_at: string | null
  file_type: string | null
  snooze_count: number
  owner_name: string | null    // havuzda null (sahipsiz)
}

const OP_SELECT =
  'operations!inner(code, customers(company_name, full_name),' +
  ' cat:product_categories!operations_category_id_fkey(label), typ:product_categories!operations_type_id_fkey(label))'

interface RawOF {
  id: number; operation_id: number; file_type: string; opened_at: string; due_at: string; snooze_count: number
  operations: { code: string; customers: { company_name: string | null; full_name: string | null } | null; cat: { label: string } | null; typ: { label: string } | null } | null
}
const mapOF = (r: RawOF): DashRow => ({
  key: 'of' + r.id, operation_id: r.operation_id, code: r.operations?.code ?? '—',
  customer_name: r.operations?.customers?.company_name ?? r.operations?.customers?.full_name ?? null,
  category_label: [r.operations?.cat?.label, r.operations?.typ?.label].filter(Boolean).join(' · ') || null,
  due_at: r.due_at, opened_at: r.opened_at, file_type: r.file_type, snooze_count: r.snooze_count, owner_name: null,
})

/** 1. Açık dosyalarım — sorumlusu ben, ertelenmemiş; süresi dolmaya yakın üstte. */
export function useMyOpenFiles(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['dash-my-openfiles', userId],
    enabled: !!userId,
    refetchInterval: 45_000,
    queryFn: async (): Promise<DashRow[]> => {
      const { data, error } = await supabase.from('open_files')
        .select('id, operation_id, file_type, opened_at, due_at, snooze_count, ' + OP_SELECT)
        .eq('assigned_to', userId as string).is('closed_at', null).is('snooze_until', null).order('due_at').limit(50)
      if (error) throw error
      return ((data ?? []) as unknown as RawOF[]).map(mapOF)
    },
  })
}

/** 4. Ertelediklerim — erteleme süresi DOLMUŞ (geri gelen) açık dosyalarım. */
export function useMySnoozed(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['dash-my-snoozed', userId],
    enabled: !!userId,
    refetchInterval: 45_000,
    queryFn: async (): Promise<DashRow[]> => {
      const nowIso = new Date().toISOString()
      const { data, error } = await supabase.from('open_files')
        .select('id, operation_id, file_type, opened_at, due_at, snooze_count, ' + OP_SELECT)
        .eq('assigned_to', userId as string).is('closed_at', null)
        .not('snooze_until', 'is', null).lt('snooze_until', nowIso).order('due_at').limit(50)
      if (error) throw error
      return ((data ?? []) as unknown as RawOF[]).map(mapOF)
    },
  })
}

interface RawPool {
  id: number; code: string; sla_deadline: string | null; requested_at: string | null
  customers: { company_name: string | null; full_name: string | null } | null
  cat: { label: string } | null; typ: { label: string } | null
}
/** 2. Havuzda bekleyenler — sahipsiz + teklif bekleyen talepler; süreye göre. */
export function usePoolRequests() {
  return useQuery({
    queryKey: ['dash-pool'],
    refetchInterval: 45_000,
    queryFn: async (): Promise<DashRow[]> => {
      const { data, error } = await supabase.from('operations')
        .select('id, code, sla_deadline, requested_at, customers(company_name, full_name), cat:product_categories!operations_category_id_fkey(label), typ:product_categories!operations_type_id_fkey(label)')
        .is('deleted_at', null).is('cancelled_at', null).is('owner_id', null)
        .not('sla_deadline', 'is', null).order('sla_deadline').limit(50)
      if (error) throw error
      return ((data ?? []) as unknown as RawPool[]).map((r) => ({
        key: 'op' + r.id, operation_id: r.id, code: r.code,
        customer_name: r.customers?.company_name ?? r.customers?.full_name ?? null,
        category_label: [r.cat?.label, r.typ?.label].filter(Boolean).join(' · ') || null,
        due_at: r.sla_deadline, opened_at: r.requested_at, file_type: null, snooze_count: 0, owner_name: null,
      }))
    },
  })
}
