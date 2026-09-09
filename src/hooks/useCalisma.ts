import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'

// Hızlı Çalışma Ekranı — listeyi zenginleştiren salt-okunur yardımcı sorgular +
// panelden yapılan hafif yazımlar. useOperationList'e DOKUNMADAN çalışır.

export interface LastAction {
  summary: string | null
  occurred_at: string
  author_name: string | null
  channel_key: string | null
  channel_label: string | null
  channel_color: string | null
  outcome_label: string | null
  outcome_color: string | null
  outcome_positive: boolean | null
}

interface RawLastAction {
  operation_id: number | null
  summary: string | null
  occurred_at: string
  interaction_channels: { key: string; label: string; color: string | null } | null
  interaction_outcomes: { label: string; is_positive: boolean; color: string | null } | null
  author: { full_name: string } | null
}

/**
 * Verilen operasyon id'leri için EN SON aksiyonu (interactions) toplu getirir. Tek
 * sorgu, occurred_at DESC; her operasyonun ilk (en yeni) kaydı alınır. Liste
 * sütunundaki "Son aksiyon" ve "Bekleme süresi" (son temas) bundan beslenir.
 */
export function useLastNotes(operationIds: number[]) {
  const key = operationIds.slice().sort((a, b) => a - b).join(',')
  return useQuery({
    queryKey: ['calisma-last-notes', key],
    enabled: operationIds.length > 0,
    queryFn: async (): Promise<Map<number, LastAction>> => {
      const { data, error } = await supabase
        .from('interactions')
        .select('operation_id, summary, occurred_at, interaction_channels(key, label, color), interaction_outcomes(label, is_positive, color), author:users!interactions_created_by_fkey(full_name)')
        .in('operation_id', operationIds)
        .is('deleted_at', null)
        .order('occurred_at', { ascending: false })
      if (error) throw error
      const map = new Map<number, LastAction>()
      for (const r of (data ?? []) as unknown as RawLastAction[]) {
        if (r.operation_id != null && !map.has(r.operation_id)) {
          map.set(r.operation_id, {
            summary: r.summary,
            occurred_at: r.occurred_at,
            author_name: r.author?.full_name ?? null,
            channel_key: r.interaction_channels?.key ?? null,
            channel_label: r.interaction_channels?.label ?? null,
            channel_color: r.interaction_channels?.color ?? null,
            outcome_label: r.interaction_outcomes?.label ?? null,
            outcome_color: r.interaction_outcomes?.color ?? null,
            outcome_positive: r.interaction_outcomes?.is_positive ?? null,
          })
        }
      }
      return map
    },
  })
}

// ---- /calisma iş listesi (calisma_worklist RPC) ----
export type WorklistBucket = 'bugun_aranacaklar' | 'arandi' | 'gelen_talep' | 'bekleyen_talep' | 'iletilen_teklif'

export interface Worklist {
  from: string
  to: string
  counts: Record<WorklistBucket, number>
  ids: Record<WorklistBucket, number[]>
}

/**
 * Tek RPC ile 5 kovanın sayısı + operation_id[] listesi. p_from/p_to verilmezse
 * ikisi de bugün (anlık kovalar dönemi yok sayar). id'ler sunucuda sıralı gelir
 * (bugun_aranacaklar: en eski teklif önce).
 */
export function useWorklist(from: string | null, to: string | null) {
  return useQuery({
    queryKey: ['calisma-worklist', from, to],
    queryFn: async (): Promise<Worklist> => {
      const { data, error } = await supabase.rpc('calisma_worklist' as never, { p_from: from, p_to: to } as never)
      if (error) throw error
      return data as unknown as Worklist
    },
  })
}

// ---- Panel aksiyon geçmişi (müşteri seviyesi, kanal/sonuç renkleriyle) ----
export interface CustAction {
  id: number
  occurred_at: string
  summary: string | null
  direction: string
  channel_key: string | null
  channel_label: string | null
  channel_color: string | null
  outcome_label: string | null
  outcome_color: string | null
  outcome_positive: boolean | null
  author_name: string | null
}
interface RawCustAction {
  id: number; occurred_at: string; summary: string | null; direction: string
  interaction_channels: { key: string; label: string; color: string | null } | null
  interaction_outcomes: { label: string; is_positive: boolean; color: string | null } | null
  author: { full_name: string } | null
}
export function useCustomerActions(customerId: number | null) {
  return useQuery({
    queryKey: ['calisma-cust-actions', customerId],
    enabled: customerId != null,
    queryFn: async (): Promise<CustAction[]> => {
      const { data, error } = await supabase.from('interactions')
        .select('id, occurred_at, summary, direction, interaction_channels(key, label, color), interaction_outcomes(label, is_positive, color), author:users!interactions_created_by_fkey(full_name)')
        .eq('entity_type', 'customer').eq('entity_id', customerId as number)
        .is('deleted_at', null).order('occurred_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as unknown as RawCustAction[]).map((r) => ({
        id: r.id, occurred_at: r.occurred_at, summary: r.summary, direction: r.direction,
        channel_key: r.interaction_channels?.key ?? null, channel_label: r.interaction_channels?.label ?? null,
        channel_color: r.interaction_channels?.color ?? null,
        outcome_label: r.interaction_outcomes?.label ?? null, outcome_color: r.interaction_outcomes?.color ?? null,
        outcome_positive: r.interaction_outcomes?.is_positive ?? null,
        author_name: r.author?.full_name ?? null,
      }))
    },
  })
}

// ---- Müşteri geneli çocuk kayıtlar (panelde "bu müşteri nerede kalmış") ----
// Salt-okunur; operasyon id listesine göre tek sorgu. opIds boşsa sorgu kapalı.
const idsKey = (opIds: number[]) => opIds.slice().sort((a, b) => a - b).join(',')

export interface CustQuote {
  id: number; operation_id: number; version: number; total: number; currency: string
  sent_at: string | null; created_at: string
  status_key: string | null; status_label: string | null; status_color: string | null
}
export function useCustomerQuotes(opIds: number[]) {
  return useQuery({
    queryKey: ['calisma-cust-quotes', idsKey(opIds)],
    enabled: opIds.length > 0,
    queryFn: async (): Promise<CustQuote[]> => {
      const { data, error } = await supabase.from('quotes')
        .select('id, operation_id, version, total, currency, sent_at, created_at, quote_statuses(key, label, color)')
        .in('operation_id', opIds).is('deleted_at', null).order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as unknown as (Omit<CustQuote, 'status_key' | 'status_label' | 'status_color'> & { quote_statuses: { key: string; label: string; color: string | null } | null })[])
        .map((r) => { const { quote_statuses: s, ...rest } = r; return { ...rest, status_key: s?.key ?? null, status_label: s?.label ?? null, status_color: s?.color ?? null } })
    },
  })
}

export interface CustSample {
  id: number; operation_id: number; version: number; description: string | null; created_at: string
  status_key: string | null; status_label: string | null; status_color: string | null
}
export function useCustomerSamples(opIds: number[]) {
  return useQuery({
    queryKey: ['calisma-cust-samples', idsKey(opIds)],
    enabled: opIds.length > 0,
    queryFn: async (): Promise<CustSample[]> => {
      const { data, error } = await supabase.from('samples')
        .select('id, operation_id, version, description, created_at, sample_statuses(key, label, color)')
        .in('operation_id', opIds).is('deleted_at', null).order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as unknown as (Omit<CustSample, 'status_key' | 'status_label' | 'status_color'> & { sample_statuses: { key: string; label: string; color: string | null } | null })[])
        .map((r) => { const { sample_statuses: s, ...rest } = r; return { ...rest, status_key: s?.key ?? null, status_label: s?.label ?? null, status_color: s?.color ?? null } })
    },
  })
}

export interface CustOrder {
  id: number; operation_id: number; order_date: string | null; total: number; currency: string; created_at: string
  status_key: string | null; status_label: string | null; status_color: string | null
}
export function useCustomerOrders(opIds: number[]) {
  return useQuery({
    queryKey: ['calisma-cust-orders', idsKey(opIds)],
    enabled: opIds.length > 0,
    queryFn: async (): Promise<CustOrder[]> => {
      const { data, error } = await supabase.from('orders')
        .select('id, operation_id, order_date, total, currency, created_at, order_statuses(key, label, color)')
        .in('operation_id', opIds).is('deleted_at', null).order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as unknown as (Omit<CustOrder, 'status_key' | 'status_label' | 'status_color'> & { order_statuses: { key: string; label: string; color: string | null } | null })[])
        .map((r) => { const { order_statuses: s, ...rest } = r; return { ...rest, status_key: s?.key ?? null, status_label: s?.label ?? null, status_color: s?.color ?? null } })
    },
  })
}

/**
 * Müşterinin "sonraki takip tarihi"ni (customers.next_action_at) ayarlar.
 * "Bugün aranacaklar" sekmesi bu alandan beslenir. Aksiyon eklemede takip tarihi
 * girilince çağrılır. Salt tek kolon güncellemesi (mevcut RLS: müşteri update açık).
 */
export function useSetNextAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ customerId, nextActionAt }: { customerId: number; nextActionAt: string | null }) => {
      ensureRows(await supabase.from('customers').update({ next_action_at: nextActionAt } as never).eq('id', customerId).select('id'))
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['customer', v.customerId] })
    },
  })
}
