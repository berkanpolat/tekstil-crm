import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'
import { normalizeTr } from '@/lib/normalize'
import type { SortState } from '@/components/shared/DataTable'

// ---------- Liste ----------
export interface OperationRow {
  id: number
  code: string
  legacy_code: string | null
  title: string
  customer_id: number
  customer_name: string | null
  stage_key: string | null
  stage_label: string | null
  stage_color: string | null
  status_key: string | null
  status_label: string | null
  channel_label: string | null
  channel_color: string | null
  province_name: string | null
  owner_name: string | null
  photo_path: string | null
  category_label: string | null
  type_label: string | null
  expected_delivery: string | null
  sla_deadline: string | null
  requested_at: string | null
  created_at: string
  possible_merge_with: number | null
}

export interface OperationFilters {
  search?: string
  stageId?: number | null
  statusId?: number | null
  channelId?: number | null
  ownerId?: string | null
  customerId?: number | null
  /** 'overdue' | 'today' | null — sla_deadline'a göre (P3.8 sonrası dolar). */
  slaState?: 'overdue' | 'today' | null
  page: number
  pageSize: number
  sort?: SortState | null
}

const SORT_COLUMN: Record<string, string> = {
  code: 'code',
  title: 'title_normalized',
  created_at: 'created_at',
  expected_delivery: 'expected_delivery',
  sla_deadline: 'sla_deadline',
}

const LIST_SELECT =
  'id, code, legacy_code, title, customer_id, expected_delivery, sla_deadline, requested_at, created_at, possible_merge_with, merged_into,' +
  ' operation_stages(key, label, color), request_statuses(key, label),' +
  ' request_channels(label, color), provinces(name),' +
  ' owner:users!operations_owner_id_fkey(full_name),' +
  ' category:product_categories!operations_category_id_fkey(label),' +
  ' type:product_categories!operations_type_id_fkey(label),' +
  ' customers(company_name, full_name)'

interface RawOp {
  id: number; code: string; legacy_code: string | null; title: string; customer_id: number
  expected_delivery: string | null; sla_deadline: string | null; requested_at: string | null; created_at: string
  possible_merge_with: number | null
  operation_stages: { key: string; label: string; color: string | null } | null
  request_statuses: { key: string; label: string } | null
  request_channels: { label: string; color: string | null } | null
  provinces: { name: string } | null
  category: { label: string } | null
  type: { label: string } | null
  owner: { full_name: string } | null
  customers: { company_name: string | null; full_name: string | null } | null
}

/** Müşteri adına göre arama → eşleşen customer id'leri (operations join yerine ön-sorgu). */
async function customerMatchIds(search: string): Promise<number[]> {
  const norm = normalizeTr(search)
  if (!norm) return []
  const { data } = await supabase
    .from('customers')
    .select('id')
    .is('deleted_at', null)
    .or(`company_name_normalized.ilike.%${norm}%,full_name_normalized.ilike.%${norm}%`)
    .limit(500)
  return (data ?? []).map((c) => c.id as number)
}

export function useOperationList(filters: OperationFilters) {
  return useQuery({
    queryKey: ['operations', filters],
    queryFn: async (): Promise<{ rows: OperationRow[]; total: number }> => {
      // Birleştirilmiş talepler listede görünmez (merged_into dolu)
      let query = supabase.from('operations').select(LIST_SELECT, { count: 'exact' }).is('deleted_at', null).is('merged_into' as never, null)

      if (filters.search) {
        const norm = normalizeTr(filters.search)
        const up = filters.search.replace(/[^A-Za-z0-9-]/g, '').toUpperCase()
        const clauses: string[] = []
        if (norm) clauses.push(`title_normalized.ilike.%${norm}%`)
        if (up) clauses.push(`code.ilike.%${up}%`, `legacy_code.ilike.%${up}%`)
        const cids = await customerMatchIds(filters.search)
        if (cids.length) clauses.push(`customer_id.in.(${cids.join(',')})`)
        if (clauses.length) query = query.or(clauses.join(','))
      }
      if (filters.stageId != null) query = query.eq('stage_id', filters.stageId)
      if (filters.statusId != null) query = query.eq('request_status_id', filters.statusId)
      if (filters.channelId != null) query = query.eq('channel_id', filters.channelId)
      if (filters.ownerId === 'unassigned') query = query.is('owner_id', null)
      else if (filters.ownerId) query = query.eq('owner_id', filters.ownerId)
      if (filters.customerId != null) query = query.eq('customer_id', filters.customerId)
      if (filters.slaState === 'overdue') query = query.lt('sla_deadline', new Date().toISOString())
      else if (filters.slaState === 'today') {
        const end = new Date(); end.setHours(23, 59, 59, 999)
        query = query.gte('sla_deadline', new Date().toISOString()).lte('sla_deadline', end.toISOString())
      }

      const col = SORT_COLUMN[filters.sort?.key ?? 'created_at'] ?? 'created_at'
      query = query.order(col, { ascending: filters.sort?.dir === 'asc', nullsFirst: false })
      if (col !== 'id') query = query.order('id', { ascending: false })

      const from = (filters.page - 1) * filters.pageSize
      const { data, error, count } = await query.range(from, from + filters.pageSize - 1)
      if (error) throw error
      const raw = (data ?? []) as unknown as RawOp[]

      // Fotoğraf önizleme: sayfadaki operasyonların ilk GÖRSEL dosyasının YOLU (kategoriye
      // değil mime'a bakılır — yanlış kategorilenmiş görseller de yakalanır). İmzalama +
      // thumbnail dönüşümü satır bazında (OpThumb) yapılır; katalogdaki yaklaşımın aynısı.
      const photoByOp = new Map<number, string>()
      const opIds = raw.map((o) => o.id)
      if (opIds.length) {
        const { data: imgs } = await supabase.from('files')
          .select('entity_id, storage_path, created_at')
          .eq('entity_type', 'operation').eq('bucket', 'documents').like('mime_type', 'image/%')
          .in('entity_id', opIds.map(String)).order('created_at', { ascending: true })
        for (const f of (imgs ?? []) as { entity_id: string; storage_path: string }[]) {
          if (!photoByOp.has(Number(f.entity_id))) photoByOp.set(Number(f.entity_id), f.storage_path)
        }
      }

      const rows: OperationRow[] = raw.map((o) => ({
        id: o.id, code: o.code, legacy_code: o.legacy_code, title: o.title, customer_id: o.customer_id,
        customer_name: o.customers?.company_name ?? o.customers?.full_name ?? null,
        stage_key: o.operation_stages?.key ?? null, stage_label: o.operation_stages?.label ?? null,
        stage_color: o.operation_stages?.color ?? null,
        status_key: o.request_statuses?.key ?? null, status_label: o.request_statuses?.label ?? null,
        channel_label: o.request_channels?.label ?? null, channel_color: o.request_channels?.color ?? null,
        province_name: o.provinces?.name ?? null,
        owner_name: o.owner?.full_name ?? null, photo_path: photoByOp.get(o.id) ?? null,
        category_label: o.category?.label ?? null, type_label: o.type?.label ?? null,
        expected_delivery: o.expected_delivery,
        sla_deadline: o.sla_deadline, requested_at: o.requested_at, created_at: o.created_at,
        possible_merge_with: o.possible_merge_with ?? null,
      }))
      return { rows, total: count ?? 0 }
    },
  })
}

// ---------- Tekil ----------
export interface OperationDetail {
  id: number; code: string; legacy_code: string | null; customer_id: number; customer_name: string | null
  title: string; description: string | null; stage_id: number | null; stage_key: string | null
  request_status_id: number | null; status_key: string | null; owner_id: string | null; owner_name: string | null
  source: string
  channel_id: number | null; channel_label: string | null
  province_id: number | null; province_name: string | null; district: string | null
  product_source: string | null
  expected_delivery: string | null; sla_deadline: string | null; requested_at: string | null
  category_id: number | null; type_id: number | null; category_label: string | null; type_label: string | null
  cancelled_at: string | null; cancellation_reason_id: number | null; cancellation_note: string | null
  status_label: string | null; created_at: string; updated_at: string
}

export function useOperation(id: number | null) {
  return useQuery({
    queryKey: ['operation', id],
    enabled: id != null,
    queryFn: async (): Promise<OperationDetail | null> => {
      const { data, error } = await supabase
        .from('operations')
        .select(
          'id, code, legacy_code, customer_id, title, description, stage_id, request_status_id, owner_id,' +
            ' source, channel_id, province_id, district, product_source,' +
            ' expected_delivery, sla_deadline, requested_at,' +
            ' category_id, type_id, cancelled_at,' +
            ' cancellation_reason_id, cancellation_note, created_at, updated_at,' +
            ' operation_stages(key), request_statuses(key, label),' +
            ' request_channels(label), provinces(name),' +
            ' owner:users!operations_owner_id_fkey(full_name),' +
            ' category:product_categories!operations_category_id_fkey(label),' +
            ' type:product_categories!operations_type_id_fkey(label),' +
            ' customers(company_name, full_name)',
        )
        .eq('id', id as number)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const o = data as unknown as OperationDetail & {
        operation_stages: { key: string } | null; request_statuses: { key: string; label: string } | null
        request_channels: { label: string } | null; provinces: { name: string } | null
        owner: { full_name: string } | null
        category: { label: string } | null; type: { label: string } | null
        customers: { company_name: string | null; full_name: string | null } | null
      }
      return {
        ...o,
        customer_name: o.customers?.company_name ?? o.customers?.full_name ?? null,
        stage_key: o.operation_stages?.key ?? null,
        status_key: o.request_statuses?.key ?? null,
        status_label: o.request_statuses?.label ?? null,
        channel_label: o.request_channels?.label ?? null,
        province_name: o.provinces?.name ?? null,
        owner_name: o.owner?.full_name ?? null,
        category_label: o.category?.label ?? null,
        type_label: o.type?.label ?? null,
      }
    },
  })
}

// ---------- Mutasyonlar ----------
export interface OperationInput {
  customer_id: number
  /** Boş bırakılırsa trigger üretir: "<Kategori> <Tür> — GG.AA.YYYY". */
  title?: string | null
  description?: string | null
  category_id?: number | null
  type_id?: number | null
  channel_id?: number | null
  province_id?: number | null
  district?: string | null
  product_source?: string | null
  /** Talep tarihi (ISO). Boşsa now(). Geçmişe girilebilir. */
  requested_at?: string | null
  owner_id?: string | null
  source?: string
  expected_delivery?: string | null
  legacy_code?: string | null
}

export function useCreateOperation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: OperationInput): Promise<number> => {
      const { data: { user } } = await supabase.auth.getUser()
      const res = await supabase.from('operations').insert({ ...input, created_by: user?.id ?? null } as never).select('id')
      ensureRows(res)
      return (res.data as { id: number }[])[0]!.id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operations'] }),
  })
}

export function useUpdateOperation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...fields }: Partial<OperationInput> & { id: number }) => {
      ensureRows(await supabase.from('operations').update(fields as never).eq('id', id).select('id'))
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['operations'] })
      qc.invalidateQueries({ queryKey: ['operation', v.id] })
    },
  })
}

// ---------- Seçenekler ----------
export function useOperationStageOptions() {
  return useQuery({
    queryKey: ['operation-stage-options'],
    queryFn: async () => (await supabase.from('operation_stages').select('id, key, label, color, sort_order').eq('is_active', true).order('sort_order')).data ?? [],
  })
}
export function useRequestStatusOptions() {
  return useQuery({
    queryKey: ['request-status-options'],
    queryFn: async () => (await supabase.from('request_statuses').select('id, key, label').eq('is_active', true).order('sort_order')).data ?? [],
  })
}
/** Havuz: talebi atomik üstlen. Yarışta ikinci kişi ezmez, mevcut sahibi döner. */
export function useClaimOperation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (operationId: number): Promise<{ claimed: boolean; owner_name?: string | null; already?: boolean; gone?: boolean }> => {
      const { data, error } = await supabase.rpc('claim_operation', { p_operation_id: operationId })
      if (error) throw error
      return data as { claimed: boolean; owner_name?: string | null }
    },
    onSuccess: (_d, operationId) => {
      qc.invalidateQueries({ queryKey: ['operations'] })
      qc.invalidateQueries({ queryKey: ['operation', operationId] })
      qc.invalidateQueries({ queryKey: ['sla-counts'] })
    },
  })
}

export function useChannelOptions() {
  return useQuery({
    queryKey: ['request-channel-options'],
    queryFn: async () => (await supabase.from('request_channels').select('id, key, label, color').eq('is_active', true).order('sort_order')).data ?? [],
  })
}
export function useProvinceOptions() {
  return useQuery({
    queryKey: ['province-options'],
    staleTime: 600_000,
    queryFn: async () => (await supabase.from('provinces').select('id, name, plate_code').eq('is_active', true).order('name')).data ?? [],
  })
}

// ---------- Ürün kalemleri ----------
export interface OperationItem {
  id: number
  operation_id: number
  name: string
  description: string | null
  fabric: string | null
  colors: string[] | null
  quantity: number | null
  print_embroidery: string | null
  technical_notes: string | null
  sort_order: number
}
export interface OperationItemInput {
  operation_id: number
  name: string
  description?: string | null
  fabric?: string | null
  colors?: string[] | null
  quantity?: number | null
  print_embroidery?: string | null
  technical_notes?: string | null
}

export function useOperationItems(operationId: number | null) {
  return useQuery({
    queryKey: ['operation-items', operationId],
    enabled: operationId != null,
    queryFn: async (): Promise<OperationItem[]> => {
      const { data, error } = await supabase
        .from('operation_items')
        .select('id, operation_id, name, description, fabric, colors, quantity, print_embroidery, technical_notes, sort_order')
        .eq('operation_id', operationId as number)
        .is('deleted_at', null)
        .order('sort_order')
        .order('id')
      if (error) throw error
      return (data ?? []) as OperationItem[]
    },
  })
}

export function useAddOperationItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: OperationItemInput) => {
      ensureRows(await supabase.from('operation_items').insert(input as never).select('id'))
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['operation-items', v.operation_id] }),
  })
}

export function useUpdateOperationItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, operation_id: _operation_id, ...fields }: OperationItemInput & { id: number }) => {
      ensureRows(await supabase.from('operation_items').update(fields as never).eq('id', id).select('id'))
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['operation-items', v.operation_id] }),
  })
}

export function useDeleteOperationItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (item: { id: number; operation_id: number }) => {
      const { data: { user } } = await supabase.auth.getUser()
      ensureRows(
        await supabase.from('operation_items')
          .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
          .eq('id', item.id).select('id'),
      )
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['operation-items', v.operation_id] }),
  })
}

// Müşteri seçici (talep formu) — aktif müşteriler önden yüklenir; SearchableSelect
// istemci tarafında filtreler. (Büyük ölçekte server-search'e geçilebilir.)
export function useAllCustomerOptions() {
  return useQuery({
    queryKey: ['all-customer-options'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, customer_code, company_name, full_name')
        .is('deleted_at', null)
        .order('company_name')
        .limit(2000)
      return (data ?? []).map((c) => ({
        value: String(c.id),
        label: `${c.company_name ?? c.full_name ?? '—'}${c.customer_code ? ` · ${c.customer_code}` : ''}`,
      }))
    },
  })
}

// ---------- E.4 — Birleştirme önerisi (aynı müşterinin açık talebi) ----------
export interface MergeSuggestion { sourceId: number; targetId: number; targetCode: string; targetCreatedAt: string }
export function useMergeSuggestion(operationId: number | null) {
  return useQuery({
    queryKey: ['merge-suggestion', operationId],
    enabled: !!operationId,
    queryFn: async (): Promise<MergeSuggestion | null> => {
      const { data } = await supabase.from('operations').select('possible_merge_with, merged_into').eq('id', operationId as number).maybeSingle()
      const d = data as { possible_merge_with: number | null; merged_into: number | null } | null
      if (!d?.possible_merge_with || d.merged_into) return null
      const { data: tgt } = await supabase.from('operations').select('id, code, created_at').eq('id', d.possible_merge_with).is('deleted_at', null).maybeSingle()
      return tgt ? { sourceId: operationId as number, targetId: tgt.id, targetCode: tgt.code, targetCreatedAt: tgt.created_at } : null
    },
  })
}
export function useMergeOperations() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: number; targetId: number }) => {
      const { error } = await supabase.rpc('merge_operations' as never, { p_source: sourceId, p_target: targetId } as never)
      if (error) throw error
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['merge-suggestion', v.sourceId] }); qc.invalidateQueries({ queryKey: ['operations'] }); qc.invalidateQueries({ queryKey: ['operation', v.sourceId] }) },
  })
}
export function useDismissMerge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ operationId }: { operationId: number }) => {
      const { error } = await supabase.rpc('dismiss_merge' as never, { p_operation: operationId } as never)
      if (error) throw error
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['merge-suggestion', v.operationId] }); qc.invalidateQueries({ queryKey: ['operations'] }) },
  })
}
