import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'
import { parseDecimal } from '@/lib/money'
import { useUploadFile } from './useFiles'

export interface Order {
  id: number
  operation_id: number
  quote_id: number | null
  sample_id: number | null
  status_id: number | null
  status_key: string | null
  status_label: string | null
  status_color: string | null
  order_date: string
  promised_delivery: string | null
  planned_delivery: string | null
  actual_delivery: string | null
  currency: string
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
  payment_term_id: number | null
  production_notes: string | null
  delivery_address: string | null
  delivery_notes: string | null
  shipped_at: string | null
  tracking_number: string | null
  carrier: string | null
  held_at: string | null
  hold_reason: string | null
  advance_due_date: string | null
  balance_due_date: string | null
  order_file_id: number | null
  file_name: string | null
  file_path: string | null
  extracted_data: Record<string, unknown> | null
  extraction_source: string
  deleted_at: string | null
  created_at: string
}

export interface OrderItem {
  id: number
  order_id: number
  operation_item_id: number | null
  name: string
  description: string | null
  quantity: number
  produced_quantity: number
  unit: string | null
  unit_price: number
  discount_rate: number
  line_total: number
  sort_order: number
}

interface RawOrder extends Omit<Order, 'status_key' | 'status_label' | 'status_color' | 'file_name' | 'file_path'> {
  order_statuses: { key: string; label: string; color: string | null } | null
  file: { original_name: string; storage_path: string } | null
}

const SELECT =
  'id, operation_id, quote_id, sample_id, status_id, order_date, promised_delivery, planned_delivery, actual_delivery,' +
  ' currency, subtotal, tax_rate, tax_amount, total, payment_term_id, production_notes, delivery_address, delivery_notes,' +
  ' shipped_at, tracking_number, carrier, held_at, hold_reason, advance_due_date, balance_due_date, order_file_id, extracted_data, extraction_source,' +
  ' deleted_at, created_at, order_statuses(key, label, color),' +
  ' file:files!orders_order_file_id_fkey(original_name, storage_path)'

function mapOrder(r: RawOrder): Order {
  const { order_statuses, file, ...rest } = r
  return { ...rest, status_key: order_statuses?.key ?? null, status_label: order_statuses?.label ?? null, status_color: order_statuses?.color ?? null,
    file_name: file?.original_name ?? null, file_path: file?.storage_path ?? null }
}

export function useOperationOrders(operationId: number | null) {
  return useQuery({
    queryKey: ['orders', operationId],
    enabled: operationId != null,
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await supabase.from('orders').select(SELECT)
        .eq('operation_id', operationId as number).is('deleted_at', null).order('created_at', { ascending: true })
      if (error) throw error
      return ((data ?? []) as unknown as RawOrder[]).map(mapOrder)
    },
  })
}

// ---------- Çapraz-operasyon liste (Siparişler ekranı) ----------
export interface OrderListRow {
  id: number
  operation_id: number
  status_key: string | null
  status_label: string | null
  status_color: string | null
  order_date: string
  promised_delivery: string | null
  actual_delivery: string | null
  currency: string
  total: number
  tracking_number: string | null
  carrier: string | null
  shipped_at: string | null
  created_at: string
  operation_code: string
  customer_name: string | null
}
interface RawOrderListRow {
  id: number; operation_id: number; order_date: string; promised_delivery: string | null; actual_delivery: string | null
  currency: string; total: number; tracking_number: string | null; carrier: string | null; shipped_at: string | null; created_at: string
  order_statuses: { key: string; label: string; color: string | null } | null
  operations: { code: string; customers: { company_name: string | null; full_name: string | null } | null } | null
}
/** Tüm siparişler (silinmemiş) — operasyon kodu + müşteri ile. İstemci tarafı filtre/sıralama. */
export function useAllOrders() {
  return useQuery({
    queryKey: ['orders-all'],
    queryFn: async (): Promise<OrderListRow[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, operation_id, order_date, promised_delivery, actual_delivery, currency, total, tracking_number, carrier, shipped_at, created_at,' +
          ' order_statuses(key, label, color),' +
          ' operations!orders_operation_id_fkey(code, customers(company_name, full_name))',
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(2000)
      if (error) throw error
      return ((data ?? []) as unknown as RawOrderListRow[]).map((r) => ({
        id: r.id, operation_id: r.operation_id,
        status_key: r.order_statuses?.key ?? null, status_label: r.order_statuses?.label ?? null, status_color: r.order_statuses?.color ?? null,
        order_date: r.order_date, promised_delivery: r.promised_delivery, actual_delivery: r.actual_delivery,
        currency: r.currency, total: r.total, tracking_number: r.tracking_number, carrier: r.carrier, shipped_at: r.shipped_at, created_at: r.created_at,
        operation_code: r.operations?.code ?? '—',
        customer_name: r.operations?.customers?.company_name ?? r.operations?.customers?.full_name ?? null,
      }))
    },
  })
}

export function useOrderItems(orderId: number | null) {
  return useQuery({
    queryKey: ['order-items', orderId],
    enabled: orderId != null,
    queryFn: async (): Promise<OrderItem[]> => {
      const { data, error } = await supabase.from('order_items')
        .select('id, order_id, operation_item_id, name, description, quantity, produced_quantity, unit, unit_price, discount_rate, line_total, sort_order')
        .eq('order_id', orderId as number).is('deleted_at', null).order('sort_order').order('id')
      if (error) throw error
      return (data ?? []) as OrderItem[]
    },
  })
}

/** Sipariş oluştur; teklif verilmişse kalemleri kopyala. */
export function useCreateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ operationId, quoteId, sampleId }: { operationId: number; quoteId?: number | null; sampleId?: number | null }): Promise<number> => {
      const rows = ensureRows(await supabase.from('orders')
        .insert({ operation_id: operationId, quote_id: quoteId ?? null, sample_id: sampleId ?? null } as never).select('id'))
      const orderId = (rows as { id: number }[])[0]!.id
      if (quoteId) {
        const { data: qi } = await supabase.from('quote_items')
          .select('operation_item_id, name, description, quantity, unit, unit_price, discount_rate, sort_order')
          .eq('quote_id', quoteId).is('deleted_at', null)
        if (qi && qi.length) {
          const { data: { user } } = await supabase.auth.getUser()
          await supabase.from('order_items').insert(qi.map((r) => ({ ...r, order_id: orderId, created_by: user?.id ?? null })) as never)
        }
      }
      return orderId
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['orders', v.operationId] }),
  })
}

export interface OrderPatch {
  status_id?: number | null
  order_date?: string
  promised_delivery?: string | null
  planned_delivery?: string | null
  actual_delivery?: string | null
  tax_rate?: number
  payment_term_id?: number | null
  production_notes?: string | null
  delivery_address?: string | null
  delivery_notes?: string | null
  shipped_at?: string | null
  tracking_number?: string | null
  carrier?: string | null
  held_at?: string | null
  hold_reason?: string | null
  advance_due_date?: string | null
  balance_due_date?: string | null
}

export function useUpdateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, operationId: _op, ...patch }: OrderPatch & { id: number; operationId: number }) => {
      ensureRows(await supabase.from('orders').update(patch as never).eq('id', id).select('id'))
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['orders', v.operationId] }),
  })
}

export function useDeleteOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: number; operationId: number }) => {
      const { data: { user } } = await supabase.auth.getUser()
      ensureRows(await supabase.from('orders')
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null }).eq('id', id).select('id'))
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['orders', v.operationId] }),
  })
}

export interface OrderItemInput {
  order_id: number
  operation_item_id?: number | null
  name: string
  description?: string | null
  quantity?: number
  produced_quantity?: number
  unit?: string | null
  unit_price?: number
  discount_rate?: number
  sort_order?: number
}

export function useAddOrderItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: OrderItemInput) => { ensureRows(await supabase.from('order_items').insert(input as never).select('id')) },
    onSuccess: (_d, v) => invalidate(qc, v.order_id),
  })
}
export function useUpdateOrderItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, order_id: _o, ...fields }: OrderItemInput & { id: number }) => {
      ensureRows(await supabase.from('order_items').update(fields as never).eq('id', id).select('id'))
    },
    onSuccess: (_d, v) => invalidate(qc, v.order_id),
  })
}
export function useDeleteOrderItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: number; order_id: number }) => {
      const { data: { user } } = await supabase.auth.getUser()
      ensureRows(await supabase.from('order_items')
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null }).eq('id', id).select('id'))
    },
    onSuccess: (_d, v) => invalidate(qc, v.order_id),
  })
}

function invalidate(qc: ReturnType<typeof useQueryClient>, orderId: number) {
  qc.invalidateQueries({ queryKey: ['order-items', orderId] })
  qc.invalidateQueries({ queryKey: ['orders'] })
}

export function useOrderStatusOptions() {
  return useQuery({
    queryKey: ['order-status-options'],
    queryFn: async () => (await supabase.from('order_statuses').select('id, key, label, color, is_closed').eq('is_active', true).order('sort_order')).data ?? [],
  })
}

// ---------- Sipariş dosya-yükleme akışı (Faz 3 revizyon) ----------
/** Sipariş formu (PDF) yükle → sipariş oluştur (order_file_id). Dosyasız sipariş oluşmaz. */
export function useUploadOrderFile() {
  const qc = useQueryClient()
  const upload = useUploadFile()
  return useMutation({
    mutationFn: async ({ operationId, file }: { operationId: number; file: File }): Promise<number> => {
      const f = await upload.mutateAsync({ file, bucket: 'documents', category: 'document', entityType: 'operation', entityId: String(operationId) })
      const rows = ensureRows(await supabase.from('orders').insert({ operation_id: operationId, order_file_id: f.id } as never).select('id'))
      return (rows as { id: number }[])[0]!.id
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['orders', v.operationId] }),
  })
}

/** extracted_data kaydedildikten sonra kalem yazma sonucu. */
export type ExtractedItemOutcome = 'created' | 'exists' | 'no_price' | 'no_qty'

/**
 * extracted_data'dan TEK kalemlik order_items yazar (belge→sipariş / dış PDF yolları).
 * A yolundaki (quote→order) insert desenini kaynak değiştirerek kullanır: kaynak = extracted.
 * - Fiyat parse edilemezse (Türkçe biçim) 0 YAZMAZ → kalem oluşturmaz, çağırana bildirir.
 * - Aynı sipariş için kalem zaten varsa tekrar yazmaz (mükerrer koruma).
 * - Kalem yazılınca total + cari trigger zinciriyle kendiliğinden güncellenir (dokunulmaz).
 */
async function writeExtractedItem(orderId: number, extracted: Record<string, unknown>): Promise<ExtractedItemOutcome> {
  const { data: existing } = await supabase.from('order_items').select('id').eq('order_id', orderId).is('deleted_at', null).limit(1)
  if (existing && existing.length) return 'exists'
  const price = parseDecimal(extracted.fiyat as string | number | null | undefined)
  if (price == null || price <= 0) return 'no_price'
  const qty = parseDecimal(extracted.adet as string | number | null | undefined)
  if (qty == null || qty <= 0) return 'no_qty'
  const parts: string[] = []
  if (extracted.renk) parts.push(`Renk: ${String(extracted.renk)}`)
  if (extracted.beden) parts.push(`Beden: ${String(extracted.beden)}`)
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('order_items').insert({
    order_id: orderId, name: 'Sipariş kalemi', description: parts.length ? parts.join(' · ') : null,
    quantity: qty, unit: 'adet', unit_price: price, discount_rate: 0, sort_order: 0, created_by: user?.id ?? null,
  } as never)
  return 'created'
}

/** Sipariş formundan ELLE çekilen alanlar (adet/fiyat/renk/teslimat/ödeme). Faz 6 AI: extraction_source='ai'. */
export function useUpdateOrderExtracted() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, extracted, source }: { id: number; operationId: number; extracted: Record<string, unknown>; source?: 'manuel' | 'ai' | 'belge' }): Promise<ExtractedItemOutcome> => {
      ensureRows(await supabase.from('orders').update({ extracted_data: extracted, extraction_source: source ?? 'manuel' } as never).eq('id', id).select('id'))
      return writeExtractedItem(id, extracted)
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['orders', v.operationId] })
      qc.invalidateQueries({ queryKey: ['order-items'] })
    },
  })
}
