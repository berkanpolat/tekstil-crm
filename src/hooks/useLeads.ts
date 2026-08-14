import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useReferenceQuery } from '@/hooks/useReferenceQuery'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'
import { normalizeTr } from '@/lib/normalize'
import { normalizePhone } from '@/lib/phone'
import type { SortState } from '@/components/shared/DataTable'

/** Arama terimi telefon/e-posta ise contact_points'ten eşleşen entity id'leri. */
export async function contactMatchIds(entityType: 'lead' | 'customer', search: string): Promise<number[]> {
  const phoneNorm = normalizePhone(search)
  const isEmail = search.includes('@')
  const or2: string[] = []
  if (phoneNorm) or2.push(`value_normalized.eq.${phoneNorm}`)
  if (isEmail) or2.push(`value_normalized.ilike.%${search.toLowerCase().replace(/[%,()]/g, '')}%`)
  if (!or2.length) return []
  const { data } = await supabase
    .from('contact_points')
    .select('entity_id')
    .eq('entity_type', entityType)
    .or(or2.join(','))
  return [...new Set((data ?? []).map((c) => c.entity_id as number))]
}

export interface LeadRow {
  id: number
  full_name: string | null
  company_name: string | null
  city: string | null
  country: string | null
  status_id: number
  source_id: number | null
  assigned_to: string | null
  next_action_at: string | null
  last_interaction_at: string | null
  created_at: string
  external_source: string | null
  external_id: string | null
  status_key: string | null
  status_label: string | null
  source_label: string | null
  assignee_name: string | null
}

export interface LeadFilters {
  search?: string
  statusId?: number | null
  sourceId?: number | null
  /** Belirli kullanıcı id'si, ya da 'unassigned' (atanmamış). */
  assignedTo?: string | null
  city?: string | null
  /** Dönüştürülmüş potansiyeller varsayılan GİZLİ; true ise gösterilir. */
  showConverted?: boolean
  page: number
  pageSize: number
  sort?: SortState | null
}

// Yalnızca izin verilen kolonlarla sıralanır (istemciden gelen key doğrulanır).
const SORT_COLUMN: Record<string, string> = {
  company: 'company_name_normalized',
  full_name: 'full_name',
  city: 'city',
  next_action_at: 'next_action_at',
  last_interaction_at: 'last_interaction_at',
  created_at: 'created_at',
}

const SELECT =
  'id, full_name, company_name, city, country, status_id, source_id, assigned_to,' +
  ' next_action_at, last_interaction_at, created_at, external_source, external_id,' +
  ' lead_statuses(key, label), lead_sources(label),' +
  ' assignee:users!leads_assigned_to_fkey(full_name)'

// Gömülü select'in ham satır şekli (tipli istemci FK-hint'i çözemediği için elle).
interface RawLead {
  id: number
  full_name: string | null
  company_name: string | null
  city: string | null
  country: string | null
  status_id: number
  source_id: number | null
  assigned_to: string | null
  next_action_at: string | null
  last_interaction_at: string | null
  created_at: string
  external_source: string | null
  external_id: string | null
  lead_statuses: { key: string; label: string } | null
  lead_sources: { label: string } | null
  assignee: { full_name: string } | null
}

export function useLeadList(filters: LeadFilters) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: async (): Promise<{ rows: LeadRow[]; total: number }> => {
      let query = supabase
        .from('leads')
        .select(SELECT, { count: 'exact' })
        .is('deleted_at', null)

      // Dönüştürülenler varsayılan gizli (arşiv). Filtreyle gösterilir.
      if (!filters.showConverted) query = query.is('converted_customer_id', null)

      if (filters.search) {
        // Firma+kişi+şehir NORMALIZE sütunlardan (Türkçe duyarsız) + telefon/e-posta
        // contact_points üzerinden. Eşleşen kayıt id'leri or'a eklenir.
        const norm = normalizeTr(filters.search)
        const clauses: string[] = []
        if (norm) {
          clauses.push(
            `full_name_normalized.ilike.%${norm}%`,
            `company_name_normalized.ilike.%${norm}%`,
            `city_normalized.ilike.%${norm}%`,
          )
        }
        const ids = await contactMatchIds('lead', filters.search)
        if (ids.length) clauses.push(`id.in.(${ids.join(',')})`)
        if (clauses.length) query = query.or(clauses.join(','))
      }
      if (filters.statusId != null) query = query.eq('status_id', filters.statusId)
      if (filters.sourceId != null) query = query.eq('source_id', filters.sourceId)
      if (filters.assignedTo === 'unassigned') query = query.is('assigned_to', null)
      else if (filters.assignedTo) query = query.eq('assigned_to', filters.assignedTo)
      if (filters.city) query = query.eq('city', filters.city)

      const col = SORT_COLUMN[filters.sort?.key ?? 'created_at'] ?? 'created_at'
      const ascending = filters.sort?.dir === 'asc'
      // Tarih sıralamalarında null'lar sona (planlı/etkileşimli kayıtlar önce görünür).
      query = query.order(col, { ascending, nullsFirst: false })
      if (col !== 'id') query = query.order('id', { ascending: false }) // stabil ikincil

      const from = (filters.page - 1) * filters.pageSize
      query = query.range(from, from + filters.pageSize - 1)

      const { data, error, count } = await query
      if (error) throw error

      // Tipli istemci FK-hint'li gömülü select'i çözemiyor; ham şekle cast ederiz.
      const raw = (data ?? []) as unknown as RawLead[]
      const rows: LeadRow[] = raw.map((l) => {
        const status = l.lead_statuses
        const source = l.lead_sources
        const assignee = l.assignee
        return {
          id: l.id,
          full_name: l.full_name,
          company_name: l.company_name,
          city: l.city,
          country: l.country,
          status_id: l.status_id,
          source_id: l.source_id,
          assigned_to: l.assigned_to,
          next_action_at: l.next_action_at,
          last_interaction_at: l.last_interaction_at,
          created_at: l.created_at,
          external_source: l.external_source,
          external_id: l.external_id,
          status_key: status?.key ?? null,
          status_label: status?.label ?? null,
          source_label: source?.label ?? null,
          assignee_name: assignee?.full_name ?? null,
        }
      })
      return { rows, total: count ?? 0 }
    },
  })
}

/** Dışa aktarma için satırlar (mevcut filtre ya da seçili id'ler). Sayfalamasız (5000 tavan). */
export async function fetchLeadsForExport(
  filters: LeadFilters,
  ids?: number[],
): Promise<{ headers: string[]; rows: (string | null)[][] }> {
  let q = supabase
    .from('leads')
    .select(
      'id, company_name, full_name, city, district, country, next_action_at, created_at,' +
        ' lead_statuses(label), lead_sources(label), assignee:users!leads_assigned_to_fkey(full_name)',
    )
    .is('deleted_at', null)
  if (!filters.showConverted) q = q.is('converted_customer_id', null)
  if (ids && ids.length) {
    q = q.in('id', ids)
  } else {
    if (filters.search) {
      const norm = normalizeTr(filters.search)
      const clauses: string[] = []
      if (norm) clauses.push(`full_name_normalized.ilike.%${norm}%`, `company_name_normalized.ilike.%${norm}%`, `city_normalized.ilike.%${norm}%`)
      const cids = await contactMatchIds('lead', filters.search)
      if (cids.length) clauses.push(`id.in.(${cids.join(',')})`)
      if (clauses.length) q = q.or(clauses.join(','))
    }
    if (filters.statusId != null) q = q.eq('status_id', filters.statusId)
    if (filters.sourceId != null) q = q.eq('source_id', filters.sourceId)
    if (filters.assignedTo === 'unassigned') q = q.is('assigned_to', null)
    else if (filters.assignedTo) q = q.eq('assigned_to', filters.assignedTo)
    if (filters.city) q = q.eq('city', filters.city)
  }
  const { data, error } = await q.order('created_at', { ascending: false }).limit(5000)
  if (error) throw error
  const raw = (data ?? []) as unknown as RawLead[]
  const headers = ['Firma', 'Kişi', 'Şehir', 'İlçe', 'Ülke', 'Durum', 'Kaynak', 'Atanan', 'Sonraki aksiyon', 'Oluşturulma']
  const rows = raw.map((r) => [
    r.company_name, r.full_name, r.city, (r as RawLead & { district: string | null }).district, r.country,
    r.lead_statuses?.label ?? null, r.lead_sources?.label ?? null, r.assignee?.full_name ?? null,
    r.next_action_at, r.created_at,
  ])
  return { headers, rows }
}

// --- Tekil kayıt (kart sayfası) ---
export interface LeadDetail {
  id: number
  full_name: string | null
  company_name: string | null
  country: string | null
  city: string | null
  district: string | null
  address: string | null
  source_id: number | null
  status_id: number
  assigned_to: string | null
  next_action_at: string | null
  first_contact_channel_id: number | null
  first_contact_date: string | null
  last_interaction_at: string | null
  external_source: string | null
  external_id: string | null
  converted_customer_id: number | null
  converted_at: string | null
  created_at: string
  updated_at: string
  status_key: string | null
  status_label: string | null
  source_label: string | null
  assignee_name: string | null
}

export function useLead(id: number | null) {
  return useQuery({
    queryKey: ['lead', id],
    enabled: id != null,
    queryFn: async (): Promise<LeadDetail | null> => {
      const { data, error } = await supabase
        .from('leads')
        .select(
          'id, full_name, company_name, country, city, district, address, source_id,' +
            ' first_contact_channel_id, first_contact_date,' +
            ' status_id, assigned_to, next_action_at, last_interaction_at, external_source,' +
            ' external_id, converted_customer_id, converted_at, created_at, updated_at,' +
            ' lead_statuses(key, label), lead_sources(label),' +
            ' assignee:users!leads_assigned_to_fkey(full_name)',
          {},
        )
        .eq('id', id as number)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const l = data as unknown as RawLead & {
        district: string | null
        address: string | null
        first_contact_channel_id: number | null
        first_contact_date: string | null
        converted_customer_id: number | null
        converted_at: string | null
        updated_at: string
      }
      return {
        id: l.id,
        full_name: l.full_name,
        company_name: l.company_name,
        country: l.country,
        city: l.city,
        district: l.district,
        address: l.address,
        source_id: l.source_id,
        first_contact_channel_id: l.first_contact_channel_id,
        first_contact_date: l.first_contact_date,
        status_id: l.status_id,
        assigned_to: l.assigned_to,
        next_action_at: l.next_action_at,
        last_interaction_at: l.last_interaction_at,
        external_source: l.external_source,
        external_id: l.external_id,
        converted_customer_id: l.converted_customer_id,
        converted_at: l.converted_at,
        created_at: l.created_at,
        updated_at: l.updated_at,
        status_key: l.lead_statuses?.key ?? null,
        status_label: l.lead_statuses?.label ?? null,
        source_label: l.lead_sources?.label ?? null,
        assignee_name: l.assignee?.full_name ?? null,
      }
    },
  })
}

// --- Mutasyonlar (hepsi ensureRows ile: RLS 0-satır sessiz reddi görünür olur) ---
export interface LeadInput {
  full_name: string | null
  company_name: string | null
  country: string | null
  city: string | null
  district: string | null
  address: string | null
  source_id: number | null
  status_id: number | null
  assigned_to: string | null
  next_action_at: string | null
  first_contact_channel_id: number | null
  first_contact_date: string | null // YYYY-MM-DD ya da null
}

const invalidateLeads = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['leads'] })
  qc.invalidateQueries({ queryKey: ['lead-city-options'] })
}

export function useCreateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: LeadInput): Promise<number> => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      // status_id null → anahtarı ATLA; DB trigger varsayılan durumu atar.
      const { status_id, ...rest } = input
      const row = { ...rest, created_by: user?.id ?? null }
      // as never: üretilen Insert tipi trigger'la dolan status_id'yi zorunlu sayar.
      const res = await supabase
        .from('leads')
        .insert((status_id != null ? { ...row, status_id } : row) as never)
        .select('id')
      ensureRows(res)
      return (res.data as { id: number }[])[0]!.id
    },
    onSuccess: () => invalidateLeads(qc),
  })
}

export function useUpdateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status_id, ...rest }: LeadInput & { id: number }) => {
      // status_id null gelmez (düzenlemede zorunlu) ama tip gereği güvenceye al.
      const fields = status_id != null ? { ...rest, status_id } : rest
      ensureRows(await supabase.from('leads').update(fields).eq('id', id).select('id'))
    },
    onSuccess: (_d, v) => {
      invalidateLeads(qc)
      qc.invalidateQueries({ queryKey: ['lead', v.id] })
    },
  })
}

/** Yumuşak silme (deleted_at/by) — tek veya toplu. Fiziksel silme yok. */
export function useSoftDeleteLeads() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: number[]) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      ensureRows(
        await supabase
          .from('leads')
          .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
          .in('id', ids)
          .is('deleted_at', null)
          .select('id'),
      )
    },
    onSuccess: () => invalidateLeads(qc),
  })
}

/** Toplu atama (assigned_to = kullanıcı ya da null). */
export function useBulkAssignLeads() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, assignedTo }: { ids: number[]; assignedTo: string | null }) => {
      ensureRows(
        await supabase
          .from('leads')
          .update({ assigned_to: assignedTo })
          .in('id', ids)
          .is('deleted_at', null)
          .select('id'),
      )
    },
    onSuccess: () => invalidateLeads(qc),
  })
}

/** Toplu durum değiştirme. */
export function useBulkStatusLeads() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, statusId }: { ids: number[]; statusId: number }) => {
      ensureRows(
        await supabase
          .from('leads')
          .update({ status_id: statusId })
          .in('id', ids)
          .is('deleted_at', null)
          .select('id'),
      )
    },
    onSuccess: () => invalidateLeads(qc),
  })
}

// --- Dönüşüm (potansiyel → müşteri) ---
export interface ConvertLeadInput {
  leadId: number
  customerTypeId: number
  taxOffice?: string | null
  taxNumber?: string | null
  iban?: string | null
}

export function useConvertLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ConvertLeadInput): Promise<number> => {
      const { data, error } = await supabase.rpc('convert_lead_to_customer', {
        p_lead_id: input.leadId,
        p_customer_type_id: input.customerTypeId,
        p_tax_office: input.taxOffice ?? undefined,
        p_tax_number: input.taxNumber ?? undefined,
        p_iban: input.iban ?? undefined,
      })
      if (error) throw error
      return data as number
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead', v.leadId] })
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

// --- Filtre seçenekleri (aktif referans kayıtları) ---
export function useLeadStatusOptions() {
  return useReferenceQuery({
    queryKey: ['lead-status-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_statuses')
        .select('id, key, label')
        .eq('is_active', true)
        .order('sort_order')
        .order('label')
      if (error) throw error
      return data
    },
  })
}

export function useLeadSourceOptions() {
  return useReferenceQuery({
    queryKey: ['lead-source-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_sources')
        .select('id, key, label')
        .eq('is_active', true)
        .order('sort_order')
        .order('label')
      if (error) throw error
      return data
    },
  })
}

export function useAssigneeOptions() {
  return useReferenceQuery({
    queryKey: ['assignee-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('full_name')
      if (error) throw error
      return data
    },
  })
}

// Şehir listesi: mevcut leads'ten benzersiz (filtre için). RPC yok; distinct alalım.
export function useLeadCityOptions() {
  return useReferenceQuery({
    queryKey: ['lead-city-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
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
