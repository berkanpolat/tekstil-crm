import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'
import { normalizeTr } from '@/lib/normalize'
import { contactMatchIds } from '@/hooks/useLeads'
import type { SortState } from '@/components/shared/DataTable'

export interface CustomerRow {
  id: number
  customer_code: string | null
  full_name: string | null
  company_name: string | null
  city: string | null
  status_id: number
  customer_type_id: number | null
  assigned_to: string | null
  tax_number: string | null
  next_action_at: string | null
  last_interaction_at: string | null
  created_at: string
  status_key: string | null
  status_label: string | null
  type_label: string | null
  assignee_name: string | null
}

export interface CustomerFilters {
  search?: string
  statusId?: number | null
  typeId?: number | null
  assignedTo?: string | null
  city?: string | null
  page: number
  pageSize: number
  sort?: SortState | null
}

const SORT_COLUMN: Record<string, string> = {
  company: 'company_name_normalized',
  customer_code: 'customer_code',
  city: 'city',
  next_action_at: 'next_action_at',
  last_interaction_at: 'last_interaction_at',
  created_at: 'created_at',
}

const LIST_SELECT =
  'id, customer_code, full_name, company_name, city, status_id, customer_type_id,' +
  ' assigned_to, tax_number, next_action_at, last_interaction_at, created_at,' +
  ' customer_statuses(key, label), customer_types(label),' +
  ' assignee:users!customers_assigned_to_fkey(full_name)'

interface RawCustomer {
  id: number
  customer_code: string | null
  full_name: string | null
  company_name: string | null
  city: string | null
  status_id: number
  customer_type_id: number | null
  assigned_to: string | null
  tax_number: string | null
  next_action_at: string | null
  last_interaction_at: string | null
  created_at: string
  customer_statuses: { key: string; label: string } | null
  customer_types: { label: string } | null
  assignee: { full_name: string } | null
}

export function useCustomerList(filters: CustomerFilters) {
  return useQuery({
    queryKey: ['customers', filters],
    queryFn: async (): Promise<{ rows: CustomerRow[]; total: number }> => {
      let query = supabase
        .from('customers')
        .select(LIST_SELECT, { count: 'exact' })
        .is('deleted_at', null)

      if (filters.search) {
        // Firma/kişi/şehir normalize (Türkçe duyarsız); ayrıca müşteri kodu ve
        // VERGİ NUMARASI (doküman 3.12). normalize_tr çıktısı a-z0-9+boşluk → or() güvenli.
        const norm = normalizeTr(filters.search)
        const code = filters.search.replace(/[^A-Za-z0-9-]/g, '').toUpperCase()
        const digits = filters.search.replace(/\D/g, '')
        const clauses: string[] = []
        if (norm)
          clauses.push(
            `full_name_normalized.ilike.%${norm}%`,
            `company_name_normalized.ilike.%${norm}%`,
            `city_normalized.ilike.%${norm}%`,
          )
        if (code) clauses.push(`customer_code.ilike.%${code}%`)
        if (digits) clauses.push(`tax_number_normalized.ilike.%${digits}%`)
        const ids = await contactMatchIds('customer', filters.search)
        if (ids.length) clauses.push(`id.in.(${ids.join(',')})`)
        if (clauses.length) query = query.or(clauses.join(','))
      }
      if (filters.statusId != null) query = query.eq('status_id', filters.statusId)
      if (filters.typeId != null) query = query.eq('customer_type_id', filters.typeId)
      if (filters.assignedTo === 'unassigned') query = query.is('assigned_to', null)
      else if (filters.assignedTo) query = query.eq('assigned_to', filters.assignedTo)
      if (filters.city) query = query.eq('city', filters.city)

      const col = SORT_COLUMN[filters.sort?.key ?? 'created_at'] ?? 'created_at'
      const ascending = filters.sort?.dir === 'asc'
      query = query.order(col, { ascending, nullsFirst: false })
      if (col !== 'id') query = query.order('id', { ascending: false })

      const from = (filters.page - 1) * filters.pageSize
      query = query.range(from, from + filters.pageSize - 1)

      const { data, error, count } = await query
      if (error) throw error
      const raw = (data ?? []) as unknown as RawCustomer[]
      const rows: CustomerRow[] = raw.map((c) => ({
        id: c.id,
        customer_code: c.customer_code,
        full_name: c.full_name,
        company_name: c.company_name,
        city: c.city,
        status_id: c.status_id,
        customer_type_id: c.customer_type_id,
        assigned_to: c.assigned_to,
        tax_number: c.tax_number,
        next_action_at: c.next_action_at,
        last_interaction_at: c.last_interaction_at,
        created_at: c.created_at,
        status_key: c.customer_statuses?.key ?? null,
        status_label: c.customer_statuses?.label ?? null,
        type_label: c.customer_types?.label ?? null,
        assignee_name: c.assignee?.full_name ?? null,
      }))
      return { rows, total: count ?? 0 }
    },
  })
}

/** Dışa aktarma satırları (mevcut filtre ya da seçili). Sayfalamasız (5000 tavan). */
export async function fetchCustomersForExport(
  filters: CustomerFilters,
  ids?: number[],
): Promise<{ headers: string[]; rows: (string | null)[][] }> {
  let q = supabase
    .from('customers')
    .select(
      'id, customer_code, company_name, full_name, city, district, country, tax_office, tax_number, iban,' +
        ' next_action_at, created_at, customer_statuses(label), customer_types(label), assignee:users!customers_assigned_to_fkey(full_name)',
    )
    .is('deleted_at', null)
  if (ids && ids.length) {
    q = q.in('id', ids)
  } else {
    if (filters.search) {
      const norm = normalizeTr(filters.search)
      const code = filters.search.replace(/[^A-Za-z0-9-]/g, '').toUpperCase()
      const digits = filters.search.replace(/\D/g, '')
      const clauses: string[] = []
      if (norm) clauses.push(`full_name_normalized.ilike.%${norm}%`, `company_name_normalized.ilike.%${norm}%`, `city_normalized.ilike.%${norm}%`)
      if (code) clauses.push(`customer_code.ilike.%${code}%`)
      if (digits) clauses.push(`tax_number_normalized.ilike.%${digits}%`)
      const cids = await contactMatchIds('customer', filters.search)
      if (cids.length) clauses.push(`id.in.(${cids.join(',')})`)
      if (clauses.length) q = q.or(clauses.join(','))
    }
    if (filters.statusId != null) q = q.eq('status_id', filters.statusId)
    if (filters.typeId != null) q = q.eq('customer_type_id', filters.typeId)
    if (filters.assignedTo === 'unassigned') q = q.is('assigned_to', null)
    else if (filters.assignedTo) q = q.eq('assigned_to', filters.assignedTo)
    if (filters.city) q = q.eq('city', filters.city)
  }
  const { data, error } = await q.order('created_at', { ascending: false }).limit(5000)
  if (error) throw error
  const raw = (data ?? []) as unknown as (RawCustomer & {
    district: string | null; country: string | null; tax_office: string | null; tax_number: string | null; iban: string | null
  })[]
  const headers = ['Kod', 'Firma', 'Kişi', 'Tür', 'Şehir', 'İlçe', 'Ülke', 'Durum', 'Vergi dairesi', 'Vergi no', 'IBAN', 'Atanan', 'Oluşturulma']
  const rows = raw.map((r) => [
    r.customer_code, r.company_name, r.full_name, r.customer_types?.label ?? null, r.city, r.district, r.country,
    r.customer_statuses?.label ?? null, r.tax_office, r.tax_number, r.iban, r.assignee?.full_name ?? null, r.created_at,
  ])
  return { headers, rows }
}

// --- Tekil (kart) ---
export interface CustomerDetail {
  id: number
  customer_code: string | null
  full_name: string | null
  company_name: string | null
  customer_type_id: number | null
  status_id: number
  country: string | null
  city: string | null
  district: string | null
  address: string | null
  tax_office: string | null
  tax_number: string | null
  iban: string | null
  bank_name: string | null
  account_holder: string | null
  assigned_to: string | null
  next_action_at: string | null
  first_contact_channel_id: number | null
  first_contact_date: string | null
  last_interaction_at: string | null
  converted_from_lead_id: number | null
  converted_at: string | null
  created_at: string
  updated_at: string
  status_key: string | null
  status_label: string | null
  type_label: string | null
  assignee_name: string | null
}

export function useCustomer(id: number | null) {
  return useQuery({
    queryKey: ['customer', id],
    enabled: id != null,
    queryFn: async (): Promise<CustomerDetail | null> => {
      const { data, error } = await supabase
        .from('customers')
        .select(
          'id, customer_code, full_name, company_name, customer_type_id, status_id,' +
            ' country, city, district, address, tax_office, tax_number, iban, bank_name,' +
            ' account_holder, assigned_to, next_action_at, first_contact_channel_id,' +
            ' first_contact_date, last_interaction_at,' +
            ' converted_from_lead_id, converted_at, created_at, updated_at,' +
            ' customer_statuses(key, label), customer_types(label),' +
            ' assignee:users!customers_assigned_to_fkey(full_name)',
        )
        .eq('id', id as number)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const c = data as unknown as CustomerDetail & {
        customer_statuses: { key: string; label: string } | null
        customer_types: { label: string } | null
        assignee: { full_name: string } | null
      }
      return {
        ...c,
        status_key: c.customer_statuses?.key ?? null,
        status_label: c.customer_statuses?.label ?? null,
        type_label: c.customer_types?.label ?? null,
        assignee_name: c.assignee?.full_name ?? null,
      }
    },
  })
}

// --- Mutasyonlar ---
export interface CustomerInput {
  full_name: string | null
  company_name: string | null
  customer_type_id: number | null
  status_id: number | null
  country: string | null
  city: string | null
  district: string | null
  address: string | null
  tax_office: string | null
  tax_number: string | null
  iban: string | null
  bank_name: string | null
  account_holder: string | null
  assigned_to: string | null
  next_action_at: string | null
  first_contact_channel_id: number | null
  first_contact_date: string | null // YYYY-MM-DD ya da null
}

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['customers'] })
  qc.invalidateQueries({ queryKey: ['customer-city-options'] })
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CustomerInput): Promise<number> => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { status_id, ...rest } = input
      const row = { ...rest, created_by: user?.id ?? null }
      // as never: üretilen Insert tipi trigger'la dolan status_id/customer_code'u zorunlu sayar.
      const res = await supabase
        .from('customers')
        .insert((status_id != null ? { ...row, status_id } : row) as never)
        .select('id')
      ensureRows(res)
      return (res.data as { id: number }[])[0]!.id
    },
    onSuccess: () => invalidate(qc),
  })
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status_id, ...rest }: CustomerInput & { id: number }) => {
      const fields = status_id != null ? { ...rest, status_id } : rest
      ensureRows(await supabase.from('customers').update(fields).eq('id', id).select('id'))
    },
    onSuccess: (_d, v) => {
      invalidate(qc)
      qc.invalidateQueries({ queryKey: ['customer', v.id] })
    },
  })
}

export function useSoftDeleteCustomers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: number[]) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      ensureRows(
        await supabase
          .from('customers')
          .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
          .in('id', ids)
          .is('deleted_at', null)
          .select('id'),
      )
    },
    onSuccess: () => invalidate(qc),
  })
}

export function useBulkAssignCustomers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, assignedTo }: { ids: number[]; assignedTo: string | null }) => {
      ensureRows(
        await supabase
          .from('customers')
          .update({ assigned_to: assignedTo })
          .in('id', ids)
          .is('deleted_at', null)
          .select('id'),
      )
    },
    onSuccess: () => invalidate(qc),
  })
}

export function useBulkStatusCustomers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, statusId }: { ids: number[]; statusId: number }) => {
      ensureRows(
        await supabase
          .from('customers')
          .update({ status_id: statusId })
          .in('id', ids)
          .is('deleted_at', null)
          .select('id'),
      )
    },
    onSuccess: () => invalidate(qc),
  })
}

// --- Filtre seçenekleri ---
export interface CustomerSummaryData {
  talep: number; teklif: number; numune: number; siparis: number; acik_dosya: number
  last_interaction: string | null; ciro_usd: number | null; balance_usd: number | null
}
/** 1.7 — Müşteri özet kartı: sayımlar + son etkileşim (+ ciro/bakiye yalnız finance.view). */
export function useCustomerSummary(customerId: number | null) {
  return useQuery({
    queryKey: ['customer-summary', customerId],
    enabled: customerId != null,
    queryFn: async (): Promise<CustomerSummaryData> => {
      const { data, error } = await supabase.rpc('customer_summary' as never, { p_customer_id: customerId! } as never)
      if (error) throw error
      return data as unknown as CustomerSummaryData
    },
  })
}

export function useCustomerStatusOptions() {
  return useQuery({
    queryKey: ['customer-status-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_statuses')
        .select('id, key, label')
        .eq('is_active', true)
        .order('sort_order')
        .order('label')
      if (error) throw error
      return data
    },
  })
}

export function useCustomerTypeOptions() {
  return useQuery({
    queryKey: ['customer-type-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_types')
        .select('id, key, label')
        .eq('is_active', true)
        .order('sort_order')
        .order('label')
      if (error) throw error
      return data
    },
  })
}

export function useCustomerCityOptions() {
  return useQuery({
    queryKey: ['customer-city-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('city')
        .is('deleted_at', null)
        .not('city', 'is', null)
        .order('city')
      if (error) throw error
      const seen = new Set<string>()
      const cities: string[] = []
      for (const r of data ?? []) {
        const c = (r as { city: string | null }).city
        if (c && !seen.has(c)) {
          seen.add(c)
          cities.push(c)
        }
      }
      return cities
    },
  })
}
