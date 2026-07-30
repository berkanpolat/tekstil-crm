import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { normalizeTr } from '@/lib/normalize'
import type { SortState } from '@/components/shared/DataTable'

export interface DocumentListRow {
  id: number
  type_key: string
  type_label: string
  language: string
  operation_id: number | null
  operation_code: string
  customer_name: string | null
  file_id: number | null
  file_name: string | null
  storage_path: string | null
  generated_at: string | null
  created_at: string
}

export interface DocumentFilters {
  search?: string
  typeId?: number | null
  language?: string | null
  customerId?: number | null
  from?: string | null   // ISO date
  to?: string | null
  page: number
  pageSize: number
  sort?: SortState | null
}

const SELECT =
  'id, language, generated_at, created_at, document_type_id, file_id, operation_id,' +
  ' operation:operations(code, customer_id, customers(company_name, full_name)),' +
  ' document_types(key, label_tr), files(original_name, storage_path)'

interface Raw {
  id: number; language: string; generated_at: string | null; created_at: string
  document_type_id: number; file_id: number | null; operation_id: number | null
  operation: { code: string; customer_id: number; customers: { company_name: string | null; full_name: string | null } | null } | null
  document_types: { key: string; label_tr: string } | null
  files: { original_name: string; storage_path: string } | null
}

/** Operasyonları koda/müşteriye göre bul → belge araması için id listesi. */
async function operationMatchIds(search: string): Promise<number[]> {
  const norm = normalizeTr(search)
  const up = search.replace(/[^A-Za-z0-9-]/g, '').toUpperCase()
  const clauses: string[] = []
  if (up) clauses.push(`code.ilike.%${up}%`)
  if (norm) clauses.push(`title_normalized.ilike.%${norm}%`)
  if (!clauses.length) return []
  const { data } = await supabase.from('operations').select('id').is('deleted_at', null).or(clauses.join(',')).limit(500)
  return (data ?? []).map((o) => o.id as number)
}

export function useDocumentsList(filters: DocumentFilters) {
  return useQuery({
    queryKey: ['documents-list', filters],
    queryFn: async (): Promise<{ rows: DocumentListRow[]; total: number }> => {
      let query = supabase.from('documents').select(SELECT, { count: 'exact' }).is('deleted_at', null)

      if (filters.typeId != null) query = query.eq('document_type_id', filters.typeId)
      if (filters.language) query = query.eq('language', filters.language)
      if (filters.customerId != null) query = query.eq('operation.customer_id', filters.customerId)
      if (filters.from) query = query.gte('created_at', filters.from)
      if (filters.to) query = query.lte('created_at', filters.to + 'T23:59:59')

      if (filters.search) {
        const norm = normalizeTr(filters.search)
        const clauses: string[] = []
        if (norm) clauses.push(`content_search.ilike.%${norm}%`)  // belge içeriğinde arama
        const opIds = await operationMatchIds(filters.search)
        if (opIds.length) clauses.push(`operation_id.in.(${opIds.join(',')})`)
        if (clauses.length) query = query.or(clauses.join(','))
      }

      const col = filters.sort?.key === 'type' ? 'document_type_id' : 'created_at'
      query = query.order(col, { ascending: filters.sort?.dir === 'asc', nullsFirst: false })
      const from = (filters.page - 1) * filters.pageSize
      const { data, error, count } = await query.range(from, from + filters.pageSize - 1)
      if (error) throw error
      const rows: DocumentListRow[] = ((data ?? []) as unknown as Raw[]).map((d) => ({
        id: d.id, language: d.language, generated_at: d.generated_at, created_at: d.created_at,
        type_key: d.document_types?.key ?? '', type_label: d.document_types?.label_tr ?? '',
        operation_id: d.operation_id, operation_code: d.operation?.code ?? (d.operation_id ? '—' : 'Bağımsız'),
        customer_name: d.operation?.customers?.company_name ?? d.operation?.customers?.full_name ?? null,
        file_id: d.file_id, file_name: d.files?.original_name ?? null, storage_path: d.files?.storage_path ?? null,
      }))
      return { rows, total: count ?? 0 }
    },
  })
}
