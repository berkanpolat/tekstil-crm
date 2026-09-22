import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useReferenceQuery } from '@/hooks/useReferenceQuery'
import { supabase } from '@/lib/supabase'

// ── Dönem (URL'de kalıcı) ──────────────────────────────────────────────
export type PeriodKey = 'today' | 'last2' | 'last3' | 'last7' | 'week' | 'month' | 'quarter' | 'last_month' | 'custom'
// Rapor ön tanımları. `last2`/`week`/`last_month` geçmiş URL'lerle uyumluluk için
// PeriodKey + computeRange'de kalır ama ön tanım butonu olarak gösterilmez.
export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Bugün' },
  { key: 'last3', label: 'Son 3 gün' },
  { key: 'last7', label: 'Son 7 gün' },
  { key: 'month', label: 'Bu ay' },
  { key: 'quarter', label: 'Bu çeyrek' },
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
    case 'last3': { start = startOfDay(now); start.setDate(start.getDate() - 2); break }
    case 'last7': { start = startOfDay(now); start.setDate(start.getDate() - 6); break }
    case 'week': { start = startOfDay(now); const dow = (start.getDay() + 6) % 7; start.setDate(start.getDate() - dow); break }
    case 'quarter': start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); break
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
  /** Teklif verilmiş görünen ama CRM'de teklif kaydı olmayan (geri yüklenen) — 24 saat sözünde sayılmaz */
  sla_unknown_count?: number
  avg_response_hours: number
  by_landing: Labeled[]; by_city: Labeled[]; by_channel: Labeled[]; by_category: Labeled[]
  /** Pazarlama kanalı (Meta/Search/Organik/Data…) — marketing_channels */
  by_marketing: (Labeled & { key: string })[]
  /** Katalogdan seçim / görsel-manuel ürün */
  by_product_source: Labeled[]
  by_hour: { hour: number; count: number }[]
  /** ISO gün: 1=Pazartesi … 7=Pazar */
  by_dow: { dow: number; count: number }[]
  /** Gün×saat ısı haritası (yalnız count>0 hücreler) */
  by_dow_hour: { dow: number; hour: number; count: number }[]
}
export interface FunnelMetric { requests: number; quotes: number; samples: number; orders: number; conversion_rates: { step: string; rate: number }[] }
/** Huninin her adımında İLERLEYEN / BEKLEYEN / DÜŞEN (red-iptal). Özdeşlik: reached = advanced + waiting + dead. */
export interface PipelineStep {
  key: string; label: string
  reached: number; advanced: number; waiting: number; dead: number
  advance_rate: number | null; stuck_rate: number | null
}
export interface PipelineMetric { total: number; steps: PipelineStep[] }
export interface QuotesMetric { sent: number; pending: number; accepted: number; rejected: number; prev_sent: number; change_pct: number | null; avg_response_hours: number; by_rejection_reason: Labeled[] }
export interface FinanceMetric { revenue_usd: number; revenue_try: number; collected_usd: number; outstanding_usd: number; overdue_usd: number; by_month: { month: string; revenue_usd: number; revenue_try: number }[] }
export interface EmployeeRow { user_id: string; name: string; email: string; requests_handled: number; interactions: number; quotes_sent: number; quotes_accepted: number; quotes_rejected: number; quotes_pending: number; conversion_rate: number | null; avg_response_hours: number | null; snooze_count: number }
export interface TrendPoint { day: string; count: number }

const p2 = (period: Period) => ({ p_from: period.from, p_to: period.to })

export interface RequestFilters { channel?: number | null; category?: number | null; province?: number | null; marketing?: number | null }
export const useInteractionsMetric = (period: Period, on = true) => useMetric<InteractionsMetric>('metric_interactions', p2(period), on)
export const useRequestsMetric = (period: Period, filters?: RequestFilters, on = true) =>
  useMetric<RequestsMetric>('metric_requests', { ...p2(period), p_channel: filters?.channel ?? null, p_category: filters?.category ?? null, p_province: filters?.province ?? null, p_marketing: filters?.marketing ?? null }, on)
export const useFunnelMetric = (period: Period, on = true) => useMetric<FunnelMetric>('metric_funnel', p2(period), on)
export const usePipelineMetric = (period: Period, on = true) => useMetric<PipelineMetric>('metric_pipeline', p2(period), on)
export const useQuotesMetric = (period: Period, on = true) => useMetric<QuotesMetric>('metric_quotes', p2(period), on)
export const useFinanceMetric = (period: Period, on = true) => useMetric<FinanceMetric>('metric_finance', p2(period), on)
export const useEmployeesMetric = (period: Period, on = true) => useMetric<EmployeeRow[]>('metric_employees', p2(period), on)
/** Kanal / kampanya / il huni satırı (metrics.huni_satiri). Oranlar payda 0 → null. */
export interface HuniSatiri {
  key: string; label: string
  talep: number; onceki_talep: number; degisim_pct: number | null
  teklif: number; teklif_orani: number | null
  numune: number; numune_orani: number | null
  siparis: number; siparis_orani: number | null; numune_siparis_orani: number | null
  reddedilen: number; red_orani: number | null
  bekleyen: number; gecersiz: number
  ilk_yanit_saat: number | null; sla_orani: number | null; sla_met: number; sla_missed: number
  teklif_yanit_saat: number | null
  /** Faz 3 — reklam harcaması (yalnız reports.finance; aksi hâlde null) */
  harcama?: number | null; cpl?: number | null; cpa?: number | null
}
export interface EgilimNoktasi { gun: string; count: number; onceki_count: number }
/** Genel rapor (metric_genel v2): talep bazlı sayılar, önceki dönem, kanal/kampanya/il hunileri, eğilim. */
export interface GenelMetric {
  talep: number; teklif_verilen: number; teklif_verilmeyen: number; reddedilen: number; kabul: number
  numune: number; siparis: number; numune_sayisi: number; siparis_sayisi: number
  teklif_numune_orani: number | null; numune_siparis_orani: number | null
  red_sebepleri: Labeled[]; red_il: Labeled[]; kabul_il: Labeled[]
  red_sebebi_il: { sebep: string; il: string; count: number }[]
  huni: { label: string; value: number }[]
  onceki: { talep: number; teklif_verilen: number; reddedilen: number; kabul: number; numune: number; siparis: number; siparis_orani: number | null }
  ilk_yanit_saat: number | null; teklif_yanit_saat: number | null
  kanal_huni: HuniSatiri[]; kampanya_huni: HuniSatiri[]; il_huni: HuniSatiri[]
  red_sebebi_kanal: { sebep: string; kanal: string; count: number }[]
  egilim: EgilimNoktasi[]; egilim_birim: 'gun' | 'hafta'
  min_rate_base: number
  toplam_harcama?: number | null; cpl?: number | null; cpa?: number | null; harcama_para_birimi?: string
}
export const useGenelMetric = (period: Period, marketing?: number | null, on = true) =>
  useMetric<GenelMetric>('metric_genel', { ...p2(period), p_marketing: marketing ?? null }, on)
export const useRequestTrend = (period: Period, on = true) => useMetric<TrendPoint[]>('metric_request_trend', p2(period), on)

/** Anlık durum sayıları — dönemden BAĞIMSIZ, operasyonun güncel aşamasına bakar.
 *  "Şu an kaç iş numunede/siparişte" — akış (metric_funnel) ile karıştırma. */
export interface ActiveFunnelMetric { samples: number; orders: number }
export const useActiveFunnel = (on = true) => useMetric<ActiveFunnelMetric>('metric_active_funnel', {}, on)

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
  return useReferenceQuery({
    queryKey: ['report-filter-options'],
    staleTime: 600_000,
    queryFn: async () => {
      const [ch, cat, prov, mk] = await Promise.all([
        supabase.from('request_channels').select('id, key').eq('is_active', true).order('sort_order'),
        supabase.from('product_categories').select('id, label').eq('is_active', true).is('parent_id', null).order('sort_order'),
        supabase.from('provinces').select('id, name').eq('is_active', true).order('plate_code'),
        supabase.from('marketing_channels').select('id, label').eq('is_active', true).order('sort_order'),
      ])
      return {
        channels: (ch.data ?? []).map((r) => ({ value: r.id, label: r.key })) as FilterOpt[],
        categories: (cat.data ?? []).map((r) => ({ value: r.id, label: r.label })) as FilterOpt[],
        provinces: (prov.data ?? []).map((r) => ({ value: r.id, label: r.name })) as FilterOpt[],
        marketing: (mk.data ?? []).map((r) => ({ value: r.id, label: r.label })) as FilterOpt[],
      }
    },
  })
}

export const useInterventions = (on = true) => useLive<Intervention[]>('manager_interventions', {}, on)
export const usePendingRequests = (limit = 6, on = true) => useLive<PendingRequest[]>('manager_pending_requests', { p_limit: limit }, on)
export const usePendingQuotes = (limit = 6, on = true) => useLive<PendingQuote[]>('manager_pending_quotes', { p_limit: limit }, on)
