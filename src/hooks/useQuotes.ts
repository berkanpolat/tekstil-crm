import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'
import { useUploadFile } from './useFiles'

// ---------- Tipler ----------
export interface Quote {
  id: number
  operation_id: number
  version: number
  status_id: number | null
  status_key: string | null
  status_label: string | null
  status_color: string | null
  valid_until: string
  currency: string
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
  payment_term_id: number | null
  lead_time_days: number | null
  technical_notes: string | null
  commercial_notes: string | null
  internal_notes: string | null
  sent_at: string | null
  sent_channel: string | null
  responded_at: string | null
  rejection_reason_id: number | null
  rejection_note: string | null
  follow_up_at: string | null
  follow_up_reason: string | null
  supersedes_quote_id: number | null
  quote_file_id: number | null
  file_name: string | null
  file_path: string | null
  deleted_at: string | null
  created_at: string
}

export interface QuoteItem {
  id: number
  quote_id: number
  operation_item_id: number | null
  name: string
  description: string | null
  quantity: number
  unit: string | null
  unit_price: number
  discount_rate: number
  line_total: number
  sort_order: number
}

interface RawQuote extends Omit<Quote, 'status_key' | 'status_label' | 'status_color' | 'file_name' | 'file_path'> {
  quote_statuses: { key: string; label: string; color: string | null } | null
  file: { original_name: string; storage_path: string } | null
}

const QUOTE_SELECT =
  'id, operation_id, version, status_id, valid_until, currency, subtotal, tax_rate, tax_amount, total,' +
  ' payment_term_id, lead_time_days, technical_notes, commercial_notes, internal_notes,' +
  ' sent_at, sent_channel, responded_at, rejection_reason_id, rejection_note, follow_up_at, follow_up_reason, supersedes_quote_id, quote_file_id,' +
  ' deleted_at, created_at, quote_statuses(key, label, color),' +
  ' file:files!quotes_quote_file_id_fkey(original_name, storage_path)'

function mapQuote(r: RawQuote): Quote {
  const { quote_statuses, file, ...rest } = r
  return {
    ...rest,
    status_key: quote_statuses?.key ?? null,
    status_label: quote_statuses?.label ?? null,
    status_color: quote_statuses?.color ?? null,
    file_name: file?.original_name ?? null,
    file_path: file?.storage_path ?? null,
  }
}

// ---------- Teklif listesi (silinmişler dahil — "vN (silindi)" gösterimi) ----------
export function useOperationQuotes(operationId: number | null) {
  return useQuery({
    queryKey: ['quotes', operationId],
    enabled: operationId != null,
    queryFn: async (): Promise<Quote[]> => {
      const { data, error } = await supabase
        .from('quotes')
        .select(QUOTE_SELECT)
        .eq('operation_id', operationId as number)
        .order('version', { ascending: true })
      if (error) throw error
      return ((data ?? []) as unknown as RawQuote[]).map(mapQuote)
    },
  })
}

export function useQuoteItems(quoteId: number | null) {
  return useQuery({
    queryKey: ['quote-items', quoteId],
    enabled: quoteId != null,
    queryFn: async (): Promise<QuoteItem[]> => {
      const { data, error } = await supabase
        .from('quote_items')
        .select('id, quote_id, operation_item_id, name, description, quantity, unit, unit_price, discount_rate, line_total, sort_order')
        .eq('quote_id', quoteId as number)
        .is('deleted_at', null)
        .order('sort_order').order('id')
      if (error) throw error
      return (data ?? []) as QuoteItem[]
    },
  })
}

// ---------- Çapraz-operasyon liste (Teklifler ekranı) ----------
export interface QuoteListRow {
  id: number
  operation_id: number
  version: number
  valid_until: string | null
  total: number
  currency: string
  status_key: string | null
  status_label: string | null
  status_color: string | null
  sent_at: string | null
  responded_at: string | null
  follow_up_at: string | null
  created_at: string
  operation_code: string
  customer_name: string | null
  prepared_by: string | null
}
interface RawQuoteListRow {
  id: number; operation_id: number; version: number; valid_until: string | null; total: number; currency: string
  sent_at: string | null; responded_at: string | null; follow_up_at: string | null; created_at: string
  quote_statuses: { key: string; label: string; color: string | null } | null
  preparer: { full_name: string } | null
  operations: { code: string; customers: { company_name: string | null; full_name: string | null } | null } | null
}
/** Tüm teklifler (silinmemiş) — operasyon kodu + müşteri + hazırlayan ile. İstemci tarafı filtre/sıralama. */
export function useAllQuotes() {
  return useQuery({
    queryKey: ['quotes-all'],
    queryFn: async (): Promise<QuoteListRow[]> => {
      const { data, error } = await supabase
        .from('quotes')
        .select(
          'id, operation_id, version, valid_until, total, currency, sent_at, responded_at, follow_up_at, created_at,' +
          ' quote_statuses(key, label, color),' +
          ' preparer:users!quotes_created_by_fkey(full_name),' +
          ' operations!quotes_operation_id_fkey(code, customers(company_name, full_name))',
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(2000)
      if (error) throw error
      return ((data ?? []) as unknown as RawQuoteListRow[]).map((r) => ({
        id: r.id, operation_id: r.operation_id, version: r.version, valid_until: r.valid_until, total: r.total, currency: r.currency,
        status_key: r.quote_statuses?.key ?? null, status_label: r.quote_statuses?.label ?? null, status_color: r.quote_statuses?.color ?? null,
        sent_at: r.sent_at, responded_at: r.responded_at, follow_up_at: r.follow_up_at, created_at: r.created_at,
        operation_code: r.operations?.code ?? '—',
        customer_name: r.operations?.customers?.company_name ?? r.operations?.customers?.full_name ?? null,
        prepared_by: r.preparer?.full_name ?? null,
      }))
    },
  })
}

// ---------- Mutasyonlar ----------
export function useCreateQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (operationId: number): Promise<number> => {
      const rows = ensureRows(await supabase.from('quotes').insert({ operation_id: operationId } as never).select('id'))
      return (rows as { id: number }[])[0]!.id
    },
    onSuccess: (_d, operationId) => qc.invalidateQueries({ queryKey: ['quotes', operationId] }),
  })
}

export function useCreateQuoteRevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ quoteId }: { quoteId: number; operationId: number }): Promise<number> => {
      const { data, error } = await supabase.rpc('create_quote_revision', { p_quote_id: quoteId })
      if (error) throw error
      return data as number
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['quotes', v.operationId] }),
  })
}

export interface QuotePatch {
  status_id?: number | null
  valid_until?: string
  tax_rate?: number
  payment_term_id?: number | null
  lead_time_days?: number | null
  technical_notes?: string | null
  commercial_notes?: string | null
  internal_notes?: string | null
  sent_at?: string | null
  sent_by?: string | null
  sent_channel?: string | null
  responded_at?: string | null
  rejection_reason_id?: number | null
  rejection_note?: string | null
}

export function useUpdateQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, operationId: _op, ...patch }: QuotePatch & { id: number; operationId: number }) => {
      ensureRows(await supabase.from('quotes').update(patch as never).eq('id', id).select('id'))
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['quotes', v.operationId] }),
  })
}

export function useDeleteQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: number; operationId: number }) => {
      const { data: { user } } = await supabase.auth.getUser()
      ensureRows(await supabase.from('quotes')
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
        .eq('id', id).select('id'))
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['quotes', v.operationId] }),
  })
}

export interface QuoteItemInput {
  quote_id: number
  operation_item_id?: number | null
  name: string
  description?: string | null
  quantity?: number
  unit?: string | null
  unit_price?: number
  discount_rate?: number
  sort_order?: number
}

export function useAddQuoteItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: QuoteItemInput) => {
      ensureRows(await supabase.from('quote_items').insert(input as never).select('id'))
    },
    onSuccess: (_d, v) => invalidateQuote(qc, v.quote_id),
  })
}

export function useUpdateQuoteItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, quote_id: _q, ...fields }: QuoteItemInput & { id: number }) => {
      ensureRows(await supabase.from('quote_items').update(fields as never).eq('id', id).select('id'))
    },
    onSuccess: (_d, v) => invalidateQuote(qc, v.quote_id),
  })
}

export function useDeleteQuoteItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: number; quote_id: number }) => {
      const { data: { user } } = await supabase.auth.getUser()
      ensureRows(await supabase.from('quote_items')
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
        .eq('id', id).select('id'))
    },
    onSuccess: (_d, v) => invalidateQuote(qc, v.quote_id),
  })
}

/** Kalem değişince hem kalem listesi hem teklif (subtotal/total trigger'la güncellenir) tazelenir. */
function invalidateQuote(qc: ReturnType<typeof useQueryClient>, quoteId: number) {
  qc.invalidateQueries({ queryKey: ['quote-items', quoteId] })
  qc.invalidateQueries({ queryKey: ['quotes'] })
}

// ---------- Seçenekler ----------
export function useQuoteStatusOptions() {
  return useQuery({
    queryKey: ['quote-status-options'],
    queryFn: async () => (await supabase.from('quote_statuses').select('id, key, label, color, is_closed').eq('is_active', true).order('sort_order')).data ?? [],
  })
}
export function usePaymentTermOptions() {
  return useQuery({
    queryKey: ['payment-term-options'],
    queryFn: async () => (await supabase.from('payment_terms').select('id, key, label').eq('is_active', true).order('sort_order')).data ?? [],
  })
}
export function useQuoteRejectionReasonOptions() {
  return useQuery({
    queryKey: ['quote-rejection-options'],
    queryFn: async () => (await supabase.from('quote_rejection_reasons').select('id, key, label').eq('is_active', true).order('sort_order')).data ?? [],
  })
}

// ---------- Teklif dosya-yükleme akışı (Faz 3 revizyon) ----------
/** Teklif dosyası (PDF/Excel) yükle → quote oluştur (quote_file_id) → trigger durumu teklif_iletildi yapar. */
export function useUploadQuoteFile() {
  const qc = useQueryClient()
  const upload = useUploadFile()
  return useMutation({
    mutationFn: async ({ operationId, file }: { operationId: number; file: File }) => {
      const f = await upload.mutateAsync({ file, bucket: 'documents', category: 'document', entityType: 'operation', entityId: String(operationId) })
      ensureRows(await supabase.from('quotes').insert({ operation_id: operationId, quote_file_id: f.id } as never).select('id'))
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['quotes', v.operationId] })
      qc.invalidateQueries({ queryKey: ['operation', v.operationId] })
    },
  })
}

/** Teklif sonucu: kabul_edildi / reddedildi / geri bekliyor. */
export function useSetQuoteResult() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, statusKey, rejectionReasonId, rejectionNote, followUpAt, followUpReason }: { id: number; operationId: number; statusKey: string; rejectionReasonId?: number | null; rejectionNote?: string | null; followUpAt?: string | null; followUpReason?: string | null }) => {
      const { data: st } = await supabase.from('quote_statuses').select('id').eq('key', statusKey).single()
      const patch: Record<string, unknown> = { status_id: st?.id ?? null, responded_at: new Date().toISOString() }
      if (statusKey === 'reddedildi') { patch.rejection_reason_id = rejectionReasonId ?? null; patch.rejection_note = rejectionNote ?? null }
      // H6: Olumlu—Beklemede → sebep + tekrar-bak tarihi (zorunlu, UI'da doğrulanır).
      if (statusKey === 'olumlu_beklemede') { patch.follow_up_at = followUpAt ?? null; patch.follow_up_reason = followUpReason ?? null }
      ensureRows(await supabase.from('quotes').update(patch as never).eq('id', id).select('id'))
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['quotes', v.operationId] })
      qc.invalidateQueries({ queryKey: ['operation', v.operationId] })
    },
  })
}

/** Operasyon aşamasını anahtarla ilerlet (teklif kabulünde numune/sipariş seçimi). */
export function useAdvanceStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ operationId, stageKey }: { operationId: number; stageKey: string }) => {
      const { data: s } = await supabase.from('operation_stages').select('id').eq('key', stageKey).single()
      ensureRows(await supabase.from('operations').update({ stage_id: s?.id ?? null } as never).eq('id', operationId).select('id'))
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['operation', v.operationId] })
      qc.invalidateQueries({ queryKey: ['operations'] })
    },
  })
}

// ---------- E.2 — Katalogdan gelen taslak teklif ----------
export interface DraftQuote { id: number; data: Record<string, unknown> }
/** Operasyonda onay bekleyen taslak fiyat teklifi (is_draft). */
export function useDraftQuote(operationId: number | null) {
  return useQuery({
    queryKey: ['draft-quote', operationId],
    enabled: !!operationId,
    queryFn: async (): Promise<DraftQuote | null> => {
      const { data, error } = await supabase.from('documents')
        .select('id, data, document_types!inner(key)')
        .eq('operation_id', operationId as number).eq('is_draft' as never, true as never)
        .eq('document_types.key', 'fiyat_teklifi').is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (error) throw error
      return data ? { id: (data as { id: number }).id, data: ((data as { data: Record<string, unknown> }).data ?? {}) } : null
    },
  })
}
/** Taslağı onayla → gerçek teklif + durum ilerler. */
export function useApproveDraftQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ documentId }: { documentId: number; operationId: number }): Promise<number> => {
      const { data, error } = await supabase.rpc('approve_draft_quote' as never, { p_document_id: documentId } as never)
      if (error) throw error
      return data as number
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['draft-quote', v.operationId] })
      qc.invalidateQueries({ queryKey: ['quotes', v.operationId] })
      qc.invalidateQueries({ queryKey: ['operation', v.operationId] })
    },
  })
}
