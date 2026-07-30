import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Müşteri kartı sekmeleri: o müşterinin operasyonları üzerinden teklif/numune/sipariş. */

export interface CustomerOperationRow {
  id: number; code: string; title: string | null
  stage_label: string | null; stage_color: string | null; status_label: string | null
  created_at: string
}
export function useCustomerOperations(customerId: number | null) {
  return useQuery({
    queryKey: ['customer-operations', customerId],
    enabled: customerId != null,
    queryFn: async (): Promise<CustomerOperationRow[]> => {
      const { data, error } = await supabase.from('operations')
        .select('id, code, title, created_at, operation_stages(label, color), request_statuses(label)')
        .eq('customer_id', customerId as number).is('deleted_at', null).order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as unknown as { id: number; code: string; title: string | null; created_at: string; operation_stages: { label: string; color: string | null } | null; request_statuses: { label: string } | null }[])
        .map((o) => ({ id: o.id, code: o.code, title: o.title, created_at: o.created_at,
          stage_label: o.operation_stages?.label ?? null, stage_color: o.operation_stages?.color ?? null, status_label: o.request_statuses?.label ?? null }))
    },
  })
}

export interface CustomerChildRow {
  id: number; operation_id: number; operation_code: string; label: string
  status_label: string | null; status_color: string | null; amount: string | null; created_at: string
}

async function fetchChild(table: 'quotes' | 'samples' | 'orders', statusTable: string, customerId: number): Promise<CustomerChildRow[]> {
  const money = (n: number, cur: string) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: cur || 'TRY' }).format(n ?? 0)
  const sel = table === 'orders'
    ? `id, created_at, total, currency, operation:operations!inner(id, code, customer_id), ${statusTable}(label, color)`
    : table === 'quotes'
    ? `id, created_at, version, total, currency, operation:operations!inner(id, code, customer_id), ${statusTable}(label, color)`
    : `id, created_at, version, operation:operations!inner(id, code, customer_id), ${statusTable}(label, color)`
  const { data, error } = await supabase.from(table).select(sel).eq('operation.customer_id', customerId).is('deleted_at', null).order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const op = r.operation as { id: number; code: string } | null
    const st = r[statusTable] as { label: string; color: string | null } | null
    const version = r.version as number | undefined
    return {
      id: r.id as number,
      operation_id: op?.id ?? 0,
      operation_code: op?.code ?? '—',
      label: table === 'orders' ? 'Sipariş' : `${table === 'quotes' ? 'Teklif' : 'Numune'} v${version ?? '?'}`,
      status_label: st?.label ?? null, status_color: st?.color ?? null,
      amount: table === 'samples' ? null : money(Number(r.total ?? 0), String(r.currency ?? 'TRY')),
      created_at: r.created_at as string,
    }
  })
}

export function useCustomerChildRecords(kind: 'quotes' | 'samples' | 'orders', customerId: number | null) {
  const statusTable = kind === 'quotes' ? 'quote_statuses' : kind === 'samples' ? 'sample_statuses' : 'order_statuses'
  return useQuery({
    queryKey: ['customer-children', kind, customerId],
    enabled: customerId != null,
    queryFn: () => fetchChild(kind, statusTable, customerId as number),
  })
}
