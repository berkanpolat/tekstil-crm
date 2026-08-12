import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ── Dönem (URL'de kalıcı) ──────────────────────────────────────────────
export type PeriodKey = 'today' | 'last2' | 'week' | 'month' | 'last_month' | 'custom'
export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Bugün' },
  { key: 'week', label: 'Bu hafta' },
  { key: 'month', label: 'Bu ay' },
  { key: 'last_month', label: 'Geçen ay' },
  { key: 'custom', label: 'Özel' },
]

export interface Period { key: PeriodKey; from: string; to: string; label: string }

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
export function computeRange(key: PeriodKey, nowMs: number, from?: string | null, to?: string | null): Period {
  const now = new Date(nowMs)
  const end = new Date(nowMs)
  let start: Date
  switch (key) {
    case 'today': start = startOfDay(now); break
    case 'last2': { start = startOfDay(now); start.setDate(start.getDate() - 1); return { key, from: start.toISOString(), to: end.toISOString(), label: 'Son 2 gün' } }
    case 'week': { start = startOfDay(now); const dow = (start.getDay() + 6) % 7; start.setDate(start.getDate() - dow); break }
    case 'last_month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const e = new Date(now.getFullYear(), now.getMonth(), 1)
      return { key, from: s.toISOString(), to: e.toISOString(), label: 'Geçen ay' }
    }
    case 'custom': {
      const s = from ? new Date(from) : startOfDay(now)
      const e = to ? new Date(to) : end
      return { key, from: s.toISOString(), to: e.toISOString(), label: 'Özel dönem' }
    }
    case 'month':
    default: start = new Date(now.getFullYear(), now.getMonth(), 1)
  }
  return { key, from: start.toISOString(), to: end.toISOString(), label: PERIODS.find((p) => p.key === key)?.label ?? 'Bu ay' }
}

/** Dönem seçici — URL query'sinde saklanır (paylaşılabilir link, raporlarla tutarlı). */
export function usePeriod() {
  const [sp, setSp] = useSearchParams()
  const key = (sp.get('donem') as PeriodKey) || 'month'
  const [nowMs] = useState(() => Date.now())
  const period = useMemo(() => computeRange(key, nowMs, sp.get('from'), sp.get('to')), [key, nowMs, sp])
  function setPeriod(next: PeriodKey, range?: { from: string; to: string }) {
    const p = new URLSearchParams(sp)
    p.set('donem', next)
    if (next === 'custom' && range) { p.set('from', range.from); p.set('to', range.to) }
    else { p.delete('from'); p.delete('to') }
    setSp(p, { replace: true })
  }
  return { period, setPeriod, nowMs }
}

// ── Metrik RPC hook'ları ───────────────────────────────────────────────
function useMetric<T>(fn: string, params: Record<string, unknown>, enabled = true) {
  return useQuery({
    queryKey: ['metric', fn, params],
    enabled,
    refetchInterval: 60_000,
    queryFn: async (): Promise<T> => {
      const { data, error } = await supabase.rpc(fn as never, params as never)
      if (error) throw error
      return data as unknown as T
    },
  })
}

export interface ChangeBlock { total: number; prev_total: number; change_pct: number | null }
export interface Labeled { label: string; count: number }

export interface InteractionsMetric extends ChangeBlock { positive_rate: number }
export interface RequestsMetric extends ChangeBlock {
  sla_rate: number; sla_met_count: number; sla_missed_count: number; sla_pending_count: number
  avg_response_hours: number
  by_landing: Labeled[]; by_city: Labeled[]; by_channel: Labeled[]; by_category: Labeled[]; by_province: Labeled[]
  by_hour: { hour: number; count: number }[]
}
export interface FunnelMetric { requests: number; quotes: number; samples: number; orders: number; conversion_rates: { step: string; rate: number }[] }
export interface QuotesMetric { sent: number; pending: number; accepted: number; rejected: number; prev_sent: number; change_pct: number | null; avg_response_hours: number; by_rejection_reason: Labeled[] }
export interface FinanceMetric { revenue_usd: number; revenue_try: number; collected_usd: number; outstanding_usd: number; overdue_usd: number; by_month: { month: string; revenue_usd: number; revenue_try: number }[] }
export interface EmployeeRow { user_id: string; name: string; email: string; requests_handled: number; interactions: number; quotes_sent: number; quotes_accepted: number; quotes_rejected: number; quotes_pending: number; conversion_rate: number | null; avg_response_hours: number | null; snooze_count: number }
export interface TrendPoint { day: string; count: number }

const p2 = (period: Period) => ({ p_from: period.from, p_to: period.to })

export interface RequestFilters { channel?: number | null; category?: number | null; province?: number | null }
export const useInteractionsMetric = (period: Period, on = true) => useMetric<InteractionsMetric>('metric_interactions', p2(period), on)
export const useRequestsMetric = (period: Period, filters?: RequestFilters, on = true) =>
  useMetric<RequestsMetric>('metric_requests', { ...p2(period), p_channel: filters?.channel ?? null, p_category: filters?.category ?? null, p_province: filters?.province ?? null }, on)
export const useFunnelMetric = (period: Period, on = true) => useMetric<FunnelMetric>('metric_funnel', p2(period), on)
export const useQuotesMetric = (period: Period, on = true) => useMetric<QuotesMetric>('metric_quotes', p2(period), on)
export const useFinanceMetric = (period: Period, on = true) => useMetric<FinanceMetric>('metric_finance', p2(period), on)
export const useEmployeesMetric = (period: Period, on = true) => useMetric<EmployeeRow[]>('metric_employees', p2(period), on)
export const useRequestTrend = (period: Period, on = true) => useMetric<TrendPoint[]>('metric_request_trend', p2(period), on)

// ── Yönetici canlı listeleri (dönemden bağımsız, "şimdi") ──────────────
export interface Intervention { key: string; label: string; href: string; count: number }
export interface PendingRequest { operation_id: number; code: string; customer: string | null; category: string | null; owner_name: string | null; unowned: boolean; sla_deadline: string | null; requested_at: string | null; image_path?: string | null }
export interface PendingQuote { operation_id: number; quote_id: number; code: string; customer: string | null; owner_name: string | null; created_at: string; hours: number }

function useLive<T>(fn: string, params: Record<string, unknown>, enabled = true) {
  return useQuery({
    queryKey: ['manager-live', fn, params],
    enabled,
    refetchInterval: 60_000,
    queryFn: async (): Promise<T> => {
      const { data, error } = await supabase.rpc(fn as never, params as never)
      if (error) throw error
      return (data ?? []) as unknown as T
    },
  })
}
/** Değişim yüzdesi eşiği — önceki dönem bunun altındaysa ham sayı gösterilir. */
export function useChangeMinBase() {
  return useQuery({
    queryKey: ['setting', 'dashboard.change_min_base'],
    staleTime: 600_000,
    queryFn: async (): Promise<number> => {
      const { data } = await supabase.from('settings').select('value').eq('key', 'dashboard.change_min_base').maybeSingle()
      const v = Number(data?.value)
      return Number.isFinite(v) ? v : 10
    },
  })
}

export interface FilterOpt { value: number; label: string }
/** Talep raporu kırılım filtreleri için referans listeleri (kanal/kategori/il). */
export function useFilterOptions() {
  return useQuery({
    queryKey: ['report-filter-options'],
    staleTime: 600_000,
    queryFn: async () => {
      const [ch, cat, prov] = await Promise.all([
        supabase.from('request_channels').select('id, key').eq('is_active', true).order('sort_order'),
        supabase.from('product_categories').select('id, label').eq('is_active', true).is('parent_id', null).order('sort_order'),
        supabase.from('provinces').select('id, name').eq('is_active', true).order('plate_code'),
      ])
      return {
        channels: (ch.data ?? []).map((r) => ({ value: r.id, label: r.key })) as FilterOpt[],
        categories: (cat.data ?? []).map((r) => ({ value: r.id, label: r.label })) as FilterOpt[],
        provinces: (prov.data ?? []).map((r) => ({ value: r.id, label: r.name })) as FilterOpt[],
      }
    },
  })
}

export const useInterventions = (on = true) => useLive<Intervention[]>('manager_interventions', {}, on)
export const usePendingRequests = (limit = 6, on = true) => useLive<PendingRequest[]>('manager_pending_requests', { p_limit: limit }, on)
export const usePendingQuotes = (limit = 6, on = true) => useLive<PendingQuote[]>('manager_pending_quotes', { p_limit: limit }, on)
