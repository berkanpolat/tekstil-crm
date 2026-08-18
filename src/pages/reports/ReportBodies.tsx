import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { formatMoney } from '@/lib/money'
import {
  Kpi, Insight, ReportSection, DataTable, ReportLoading,
  Funnel, HourHistogram, Donut, SwatchLegend, LowDataNotice, type ReportProps,
} from '@/components/reports/ReportKit'
import { BarList, TrendLine } from '@/components/dashboard/MiniCharts'
import {
  useRequestsMetric, useRequestTrend, useQuotesMetric, useEmployeesMetric,
  useInteractionsMetric, useFilterOptions, useFunnelMetric, useActiveFunnel, type Labeled,
} from '@/hooks/useMetrics'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'

const labeledRows = (arr: Labeled[] | undefined) => (arr ?? []).map((x) => ({ label: x.label, count: x.count }))
const pct = (n: number | null | undefined) => (n == null ? '—' : `%${n.toFixed(0)}`)

// Geçmiş tekliflerde created_by, Süreç Takip aktarımı sırasında operasyon sahibinden türetildi
// (gerçek oluşturan kayıtlı değil). Çalışan bazlı teklif metriklerinin altında görünür.
function TuretilmisAtifNotu() {
  return (
    <p className="rounded-md border border-warning-foreground/30 bg-warning/10 px-3 py-2 text-xs text-text-muted">
      Geçmiş teklifler (Süreç Takip aktarımı) operasyon sahibinden türetilmiştir; teklifi gerçekte
      kimin oluşturduğu kayıtlı değildir.
    </p>
  )
}

// Basit metrik RPC hook'u (samples/orders/leads/finance — filtre almayan)
function useSimpleMetric<T>(fn: string, period: ReportProps['period'], on = true) {
  return useQuery({
    queryKey: ['metric', fn, period.from, period.to],
    enabled: on,
    refetchInterval: 60_000,
    queryFn: async (): Promise<T> => {
      const { data, error } = await supabase.rpc(fn as never, { p_from: period.from, p_to: period.to } as never)
      if (error) throw error
      return data as unknown as T
    },
  })
}

// ── 1) TALEP RAPORU ────────────────────────────────────────────────────
export function TalepRaporu({ period, setCsv }: ReportProps) {
  const [sp, setSp] = useSearchParams()
  const opts = useFilterOptions()
  const f = { channel: numOrNull(sp.get('ch')), category: numOrNull(sp.get('cat')), province: numOrNull(sp.get('prov')) }
  const { data, isLoading } = useRequestsMetric(period, f)
  const trend = useRequestTrend(period)
  useEffect(() => {
    if (!data) { setCsv(null); return }
    setCsv({ filename: `talep-raporu-${period.key}`, headers: ['Kanal', 'Talep'], rows: (data.by_channel ?? []).map((x) => [x.label, x.count]) })
    return () => setCsv(null)
  }, [data, period.key, setCsv])
  function setF(key: string, v: string) { const p = new URLSearchParams(sp); if (v) p.set(key, v); else p.delete(key); setSp(p, { replace: true }) }
  if (isLoading) return <ReportLoading />
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 print:hidden">
        <Sel label="Kanal" value={sp.get('ch') ?? ''} onChange={(v) => setF('ch', v)} options={opts.data?.channels ?? []} />
        <Sel label="Kategori" value={sp.get('cat') ?? ''} onChange={(v) => setF('cat', v)} options={opts.data?.categories ?? []} />
        <Sel label="İl" value={sp.get('prov') ?? ''} onChange={(v) => setF('prov', v)} options={opts.data?.provinces ?? []} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Toplam talep" value={String(data?.total ?? 0)} sub={`önceki dönem: ${data?.prev_total ?? 0}`} />
        <Kpi label="24 saat sözü" value={pct(data?.sla_rate)} tone={(data?.sla_rate ?? 0) >= 80 ? 'text-success-foreground' : (data?.sla_rate ?? 0) >= 50 ? 'text-warning-foreground' : 'text-danger-foreground'}
          sub={`${data?.sla_met_count ?? 0} tuttu · ${data?.sla_missed_count ?? 0} kaçtı · ${data?.sla_pending_count ?? 0} sürüyor`} />
        <Kpi label="Ort. ilk yanıt" value={data?.avg_response_hours != null ? `${data.avg_response_hours.toFixed(1)} sa` : '—'} />
        <Kpi label="Süresi sürenler" value={String(data?.sla_pending_count ?? 0)} sub="henüz SLA dolmadı" />
      </div>
      <ReportSection title="Talep eğilimi (günlük)"><TrendLine points={trend.data ?? []} /></ReportSection>
      <ReportSection title="Saate göre talep dağılımı">
        <HourHistogram data={data?.by_hour ?? []} />
        <p className="text-text-muted text-xs">Taleplerin günün hangi saatlerinde yoğunlaştığını gösterir (0–23, yerel saat).</p>
      </ReportSection>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportSection title="Kanala göre"><BarList rows={labeledRows(data?.by_channel)} /></ReportSection>
        <ReportSection title="Kategoriye göre"><BarList rows={labeledRows(data?.by_category)} /></ReportSection>
        <ReportSection title="İle göre"><BarList rows={labeledRows(data?.by_province)} empty="İl verisi yok." /></ReportSection>
        <ReportSection title="Açılış sayfasına göre"><BarList rows={labeledRows(data?.by_landing)} empty="Henüz veri yok — site entegrasyonu bağlanınca dolacak." /></ReportSection>
      </div>
    </div>
  )
}

// ── 2) TEKLİF RAPORU ───────────────────────────────────────────────────
export function TeklifRaporu({ period, setCsv }: ReportProps) {
  const { data, isLoading } = useQuotesMetric(period)
  const decided = (data?.accepted ?? 0) + (data?.rejected ?? 0)
  const conv = decided > 0 ? (100 * (data?.accepted ?? 0)) / decided : null
  useEffect(() => {
    if (!data) { setCsv(null); return }
    setCsv({ filename: `teklif-raporu-${period.key}`, headers: ['Red sebebi', 'Adet'], rows: (data.by_rejection_reason ?? []).map((x) => [x.label, x.count]) })
    return () => setCsv(null)
  }, [data, period.key, setCsv])
  if (isLoading) return <ReportLoading />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Gönderilen teklif" value={String(data?.sent ?? 0)} sub={`önceki dönem: ${data?.prev_sent ?? 0}`} />
        <Kpi label="Dönüşüm (sonuçlanan)" value={pct(conv)} tone={(conv ?? 0) >= 50 ? 'text-success-foreground' : (conv ?? 0) >= 25 ? 'text-warning-foreground' : 'text-danger-foreground'}
          sub={`${data?.accepted ?? 0} kabul / ${decided} sonuçlanan`} />
        <Kpi label="Cevap bekleyen" value={String(data?.pending ?? 0)} sub="payda dışında" />
        <Kpi label="Ort. yanıt süresi" value={data?.avg_response_hours != null ? `${data.avg_response_hours.toFixed(1)} sa` : '—'} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportSection title="Sonuç dağılımı">
          <div className="flex flex-wrap items-center gap-6">
            <Donut centerLabel="teklif" segments={[
              { label: 'Kabul', value: data?.accepted ?? 0 },
              { label: 'Reddedildi', value: data?.rejected ?? 0 },
              { label: 'Cevap bekleyen', value: data?.pending ?? 0 },
            ]} />
            <SwatchLegend items={[
              { label: 'Kabul (numuneye geçildi)', value: data?.accepted ?? 0 },
              { label: 'Reddedildi', value: data?.rejected ?? 0 },
              { label: 'Cevap bekleyen', value: data?.pending ?? 0 },
            ]} />
          </div>
        </ReportSection>
        <ReportSection title="Red sebepleri"><BarList rows={labeledRows(data?.by_rejection_reason)} barClass="bg-danger-foreground" empty="Bu dönemde red yok." /></ReportSection>
      </div>
      <TuretilmisAtifNotu />
    </div>
  )
}

// ── 3) DÖNÜŞÜM HUNİSİ (numune + sipariş birleşik) ──────────────────────
// Akış: Talep → Teklif → Numune → Sipariş. Her adımda ilerleyen (mor) vs takılıp
// geçmeyen (amber). "Şu an numunede" güncel durumdur (dönemden bağımsız).
// NOT (Paket B): adım-adım BEKLEYEN kesinliği için metric_pipeline RPC gelecek;
// şimdilik bekleyen = değer − sonraki adım değeri (yaklaşık) olarak gösteriliyor.
export function DonusumRaporu({ period, setCsv }: ReportProps) {
  const { data, isLoading } = useFunnelMetric(period)
  const active = useActiveFunnel()
  const steps = useMemo(() => {
    if (!data) return []
    const base = [
      { label: 'Talep', value: data.requests },
      { label: 'Teklif', value: data.quotes },
      { label: 'Numune', value: data.samples },
      { label: 'Sipariş', value: data.orders },
    ]
    return base.map((s, i) => {
      const next = base[i + 1]
      const stuck = next ? Math.max(0, s.value - next.value) : 0
      return { label: s.label, value: s.value, note: next && s.value > 0 ? `${next.value} ilerledi · ${stuck} geçmedi` : undefined }
    })
  }, [data])
  useEffect(() => {
    if (!data) { setCsv(null); return }
    setCsv({ filename: `donusum-raporu-${period.key}`, headers: ['Adım', 'Adet'], rows: steps.map((s) => [s.label, s.value]) })
    return () => setCsv(null)
  }, [data, steps, period.key, setCsv])
  if (isLoading) return <ReportLoading />
  const requests = data?.requests ?? 0
  const quotes = data?.quotes ?? 0
  const orders = data?.orders ?? 0
  const overall = requests > 0 ? (100 * orders) / requests : null
  const lowData = (data?.samples ?? 0) < 20
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Insight label="Talep (giriş)" value={String(requests)} sentence="Huninin girişi: bu dönemki toplam talep." />
        <Insight label="Teklife dönen" value={quotes ? `%${((100 * quotes) / Math.max(1, requests)).toFixed(0)}` : '—'}
          sentence={`${requests} talebin ${quotes}'ine teklif çıkıldı.`} />
        <Insight label="Şu an numunede" value={String(active.data?.samples ?? 0)}
          sentence="Güncelde numune aşamasında bekleyen iş (dönemden bağımsız)." />
        <Insight label="Uçtan uca dönüşüm" value={overall == null ? '—' : `%${overall.toFixed(1)}`}
          tone={(overall ?? 0) >= 20 ? 'text-success-foreground' : 'text-warning-foreground'}
          sentence={`${requests} talebin ${orders}'i siparişe ulaştı.`} />
      </div>
      <ReportSection title="Dönüşüm hunisi">
        <Funnel steps={steps} />
        <p className="text-text-muted text-xs">
          <span className="inline-block size-2 translate-y-px rounded-sm" style={{ background: '#6e55ff' }} /> mor = sonraki adıma ilerleyen ·{' '}
          <span className="inline-block size-2 translate-y-px rounded-sm" style={{ background: '#f59e0b' }} /> amber = o adımda takılıp geçmeyen.
        </p>
      </ReportSection>
      {lowData && (
        <LowDataNotice title="Numune/sipariş verisi henüz sığ">
          Bu dönemde {data?.samples ?? 0} numune ve {data?.orders ?? 0} sipariş kaydı var. Anlamlı bir
          numune→sipariş dönüşüm oranı için en az ~20 sipariş gerekiyor; şimdilik alt adımlar yön göstermez,
          yalnızca giriş (talep→teklif) güvenilirdir.
        </LowDataNotice>
      )}
    </div>
  )
}

// ── 4) FİNANS RAPORU (reports.finance) ─────────────────────────────────
interface FinanceMetricR { revenue_usd: number; revenue_try: number; collected_usd: number; outstanding_usd: number; overdue_usd: number; by_month: { month: string; revenue_usd: number; revenue_try: number }[] }
export function FinansRaporu({ period, setCsv }: ReportProps) {
  const { data, isLoading } = useSimpleMetric<FinanceMetricR>('metric_finance', period)
  useEffect(() => {
    if (!data) { setCsv(null); return }
    setCsv({ filename: `finans-raporu-${period.key}`, headers: ['Ay', 'Ciro (USD)', 'Ciro (TRY)'], rows: (data.by_month ?? []).map((x) => [x.month, x.revenue_usd, x.revenue_try]) })
    return () => setCsv(null)
  }, [data, period.key, setCsv])
  if (isLoading) return <ReportLoading />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Ciro (USD)" value={formatMoney(data?.revenue_usd ?? 0, 'USD')} sub={formatMoney(data?.revenue_try ?? 0, 'TRY')} />
        <Kpi label="Tahsil edilen" value={formatMoney(data?.collected_usd ?? 0, 'USD')} tone="text-success-foreground" />
        <Kpi label="Açık alacak" value={formatMoney(data?.outstanding_usd ?? 0, 'USD')} tone="text-warning-foreground" />
        <Kpi label="Gecikmiş" value={formatMoney(data?.overdue_usd ?? 0, 'USD')} tone={(data?.overdue_usd ?? 0) > 0 ? 'text-danger-foreground' : undefined} />
      </div>
      <ReportSection title="Aya göre ciro">
        <DataTable cols={[{ key: 'm', label: 'Ay' }, { key: 'u', label: 'USD', align: 'right' }, { key: 't', label: 'TRY', align: 'right' }]}
          rows={(data?.by_month ?? []).map((x) => ({ m: x.month, u: formatMoney(x.revenue_usd, 'USD'), t: formatMoney(x.revenue_try, 'TRY') }))} />
      </ReportSection>
    </div>
  )
}

// ── 5) EKİP & ETKİLEŞİM RAPORU ─────────────────────────────────────────
export function EkipRaporu({ period, setCsv }: ReportProps) {
  const emp = useEmployeesMetric(period)
  const inter = useInteractionsMetric(period)
  const empData = emp.data
  const rows = useMemo(() => (empData ?? []).slice().sort((a, b) => (b.requests_handled ?? 0) - (a.requests_handled ?? 0)), [empData])
  useEffect(() => {
    if (!empData) { setCsv(null); return }
    const sorted = (empData ?? []).slice().sort((a, b) => (b.requests_handled ?? 0) - (a.requests_handled ?? 0))
    setCsv({
      filename: `ekip-raporu-${period.key}`,
      headers: ['Çalışan', 'E-posta', 'Talep', 'Teklif', 'Kabul', 'Red', 'Bekleyen', 'Dönüşüm %', 'Etkileşim'],
      rows: sorted.map((e) => [e.name, e.email, e.requests_handled, e.quotes_sent, e.quotes_accepted, e.quotes_rejected, e.quotes_pending, e.conversion_rate ?? '', e.interactions]),
    })
    return () => setCsv(null)
  }, [empData, period.key, setCsv])
  if (emp.isLoading) return <ReportLoading />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Toplam etkileşim" value={String(inter.data?.total ?? 0)} sub={`önceki dönem: ${inter.data?.prev_total ?? 0}`} />
        <Kpi label="Olumlu oran" value={pct(inter.data?.positive_rate)} />
        <Kpi label="Aktif çalışan" value={String(rows.length)} />
        <Kpi label="Toplam teklif" value={String(rows.reduce((s, e) => s + (e.quotes_sent ?? 0), 0))} />
      </div>
      <ReportSection title="Çalışan performansı">
        <DataTable
          cols={[
            { key: 'name', label: 'Çalışan' }, { key: 'req', label: 'Talep', align: 'right' },
            { key: 'sent', label: 'Teklif', align: 'right' }, { key: 'pend', label: 'Bekleyen', align: 'right' },
            { key: 'conv', label: 'Dönüşüm', align: 'right' }, { key: 'inter', label: 'Etkileşim', align: 'right' },
          ]}
          rows={rows.map((e) => ({
            name: e.name, req: e.requests_handled, sent: e.quotes_sent, pend: e.quotes_pending,
            conv: e.conversion_rate == null ? '—' : `%${e.conversion_rate.toFixed(0)}`, inter: e.interactions,
          }))} />
        <p className="text-text-muted text-xs">Dönüşüm = kabul ÷ sonuçlanan (kabul + red). Cevap bekleyen teklifler hariç.</p>
      </ReportSection>
      <TuretilmisAtifNotu />
    </div>
  )
}

// ── Yardımcılar ────────────────────────────────────────────────────────
function numOrNull(v: string | null): number | null { const n = Number(v); return v && Number.isFinite(n) ? n : null }
function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: number; label: string }[] }) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-text-secondary">{label}:</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground">
        <option value="">Tümü</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

