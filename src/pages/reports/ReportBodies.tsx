import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { formatMoney } from '@/lib/money'
import {
  Kpi, Insight, ReportSection, DataTable, ReportLoading,
  Funnel, HourHistogram, Donut, SwatchLegend, LowDataNotice, type ReportProps, type FunnelStep,
} from '@/components/reports/ReportKit'
import { BarList, TrendLine } from '@/components/dashboard/MiniCharts'
import {
  useRequestsMetric, useRequestTrend, useQuotesMetric, useEmployeesMetric,
  useInteractionsMetric, useFilterOptions, usePipelineMetric, useActiveFunnel, type Labeled,
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
export function TalepRaporu({ period, setCsv, setPdf }: ReportProps) {
  const [sp, setSp] = useSearchParams()
  const opts = useFilterOptions()
  const f = { channel: numOrNull(sp.get('ch')), category: numOrNull(sp.get('cat')), province: numOrNull(sp.get('prov')) }
  const { data, isLoading } = useRequestsMetric(period, f)
  const trend = useRequestTrend(period)
  useEffect(() => {
    if (!data) { setCsv(null); setPdf(null); return }
    setCsv({ filename: `talep-raporu-${period.key}`, headers: ['Kanal', 'Talep'], rows: (data.by_channel ?? []).map((x) => [x.label, x.count]) })
    setPdf({
      kpis: [
        { label: 'Toplam talep', value: String(data.total ?? 0), sub: `önceki dönem: ${data.prev_total ?? 0}` },
        { label: '24 saat sözü', value: pct(data.sla_rate), sub: `${data.sla_met_count ?? 0} tuttu · ${data.sla_missed_count ?? 0} kaçtı · ${data.sla_pending_count ?? 0} sürüyor` },
        { label: 'Ort. ilk yanıt', value: data.avg_response_hours != null ? `${data.avg_response_hours.toFixed(1)} sa` : '—' },
        { label: 'Süresi sürenler', value: String(data.sla_pending_count ?? 0), sub: 'henüz SLA dolmadı' },
      ],
      blocks: [
        ...((data.total ?? 0) > 0 ? [{ kind: 'sentence' as const, text: `${data.total} talebin ${data.sla_met_count ?? 0}'ine söz verilen sürede (24 saat) teklif çıkıldı (${pct(data.sla_rate)}); ${data.sla_missed_count ?? 0}'i geç kaldı, ${data.sla_pending_count ?? 0}'inde süre henüz dolmadı.` }] : []),
        { kind: 'hist', title: 'Saate göre talep dağılımı', data: data.by_hour ?? [], caption: 'Taleplerin günün hangi saatlerinde yoğunlaştığı (0–23, yerel saat).' },
        { kind: 'bars', title: 'Kanala göre', rows: labeledRows(data.by_channel) },
        { kind: 'bars', title: 'Kategoriye göre', rows: labeledRows(data.by_category) },
        { kind: 'bars', title: 'İle göre', rows: labeledRows(data.by_province), empty: 'İl verisi yok.' },
        { kind: 'notice', variant: 'none', title: 'İlçe kırılımı toplanmıyor', text: 'Coğrafi dağılım yalnızca il bazındadır; ilçe bu metrik için toplanmıyor.' },
      ],
    })
    return () => { setCsv(null); setPdf(null) }
  }, [data, period.key, setCsv, setPdf])
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
      {(data?.total ?? 0) > 0 && (
        <p className="text-text-secondary text-sm leading-snug">
          <strong className="text-foreground">{data?.total ?? 0} talebin</strong>{' '}
          {data?.sla_met_count ?? 0}'ine söz verilen sürede (24 saat) teklif çıkıldı{' '}
          ({pct(data?.sla_rate)}); {data?.sla_missed_count ?? 0}'i geç kaldı,{' '}
          {data?.sla_pending_count ?? 0}'inde süre henüz dolmadı.
        </p>
      )}
      <ReportSection title="Talep eğilimi (günlük)"><TrendLine points={trend.data ?? []} /></ReportSection>
      <ReportSection title="Saate göre talep dağılımı">
        <HourHistogram data={data?.by_hour ?? []} />
        <p className="text-text-muted text-xs">Taleplerin günün hangi saatlerinde yoğunlaştığını gösterir (0–23, yerel saat).</p>
      </ReportSection>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportSection title="Kanala göre"><BarList rows={labeledRows(data?.by_channel)} /></ReportSection>
        <ReportSection title="Kategoriye göre"><BarList rows={labeledRows(data?.by_category)} /></ReportSection>
        <ReportSection title="İle göre">
          <BarList rows={labeledRows(data?.by_province)} empty="İl verisi yok." />
          <p className="text-text-muted text-xs">Yalnızca <strong>il</strong> kırılımı; <strong>ilçe</strong> bazında dağılım bu metrik için toplanmıyor.</p>
        </ReportSection>
        <ReportSection title="Açılış sayfasına göre"><BarList rows={labeledRows(data?.by_landing)} empty="Henüz veri yok — site entegrasyonu bağlanınca dolacak." /></ReportSection>
      </div>
    </div>
  )
}

// ── 2) TEKLİF RAPORU ───────────────────────────────────────────────────
export function TeklifRaporu({ period, setCsv, setPdf }: ReportProps) {
  const { data, isLoading } = useQuotesMetric(period)
  const decided = (data?.accepted ?? 0) + (data?.rejected ?? 0)
  const conv = decided > 0 ? (100 * (data?.accepted ?? 0)) / decided : null
  useEffect(() => {
    if (!data) { setCsv(null); setPdf(null); return }
    setCsv({ filename: `teklif-raporu-${period.key}`, headers: ['Red sebebi', 'Adet'], rows: (data.by_rejection_reason ?? []).map((x) => [x.label, x.count]) })
    setPdf({
      kpis: [
        { label: 'Gönderilen teklif', value: String(data.sent ?? 0), sub: `önceki dönem: ${data.prev_sent ?? 0}` },
        { label: 'Dönüşüm (sonuçlanan)', value: pct(conv), sub: `${data.accepted ?? 0} kabul / ${decided} sonuçlanan` },
        { label: 'Cevap bekleyen', value: String(data.pending ?? 0), sub: 'payda dışında' },
        { label: 'Ort. yanıt süresi', value: data.avg_response_hours != null ? `${data.avg_response_hours.toFixed(1)} sa` : '—' },
      ],
      blocks: [
        ...((data.sent ?? 0) > 0 ? [{ kind: 'sentence' as const, text: `${data.sent} teklifin ${data.accepted ?? 0}'i kabul edildi, ${data.rejected ?? 0}'i reddedildi, ${data.pending ?? 0}'i hâlâ cevap bekliyor. Sonuçlananlar üzerinden dönüşüm ${pct(conv)}.` }] : []),
        { kind: 'donut', title: 'Sonuç dağılımı', centerLabel: 'teklif',
          segments: [{ label: 'Kabul', value: data.accepted ?? 0 }, { label: 'Reddedildi', value: data.rejected ?? 0 }, { label: 'Cevap bekleyen', value: data.pending ?? 0 }],
          legend: [{ label: 'Kabul (numuneye geçildi)', value: data.accepted ?? 0 }, { label: 'Reddedildi', value: data.rejected ?? 0 }, { label: 'Cevap bekleyen', value: data.pending ?? 0 }] },
        { kind: 'bars', title: 'Red sebepleri', rows: labeledRows(data.by_rejection_reason), empty: 'Bu dönemde red yok.' },
        { kind: 'notice', variant: 'none', title: 'Geçmiş tekliflerde atıf türetilmiş', text: 'Süreç Takip aktarımındaki teklifler operasyon sahibinden türetilmiştir; teklifi gerçekte kimin oluşturduğu kayıtlı değildir.' },
      ],
    })
    return () => { setCsv(null); setPdf(null) }
  }, [data, decided, conv, period.key, setCsv, setPdf])
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
      {(data?.sent ?? 0) > 0 && (
        <p className="text-text-secondary text-sm leading-snug">
          <strong className="text-foreground">{data?.sent ?? 0} teklifin</strong> {data?.accepted ?? 0}'i kabul edildi,{' '}
          {data?.rejected ?? 0}'i reddedildi, {data?.pending ?? 0}'i hâlâ cevap bekliyor.{' '}
          Sonuçlananlar üzerinden dönüşüm {pct(conv)}.
        </p>
      )}
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

// ── 3) DÖNÜŞÜM HUNİSİ (metric_pipeline — gerçek bekleyen sayıları) ──────
// Akış: Talep → Teklif → Numune → Sipariş → Üretim → Teslimat. Her adımda
// metric_pipeline üç sayı verir: ilerleyen (mor) · bekleyen (amber) · düşen (red/iptal).
// Özdeşlik: reached = advanced + waiting + dead. "Şu an numunede" güncel durumdur
// (dönemden bağımsız; metric_active_funnel).
export function DonusumRaporu({ period, setCsv, setPdf }: ReportProps) {
  const { data, isLoading } = usePipelineMetric(period)
  const active = useActiveFunnel()
  const steps = useMemo(() => data?.steps ?? [], [data])
  const byKey = useMemo(() => new Map(steps.map((s) => [s.key, s])), [steps])
  const funnelSteps: FunnelStep[] = useMemo(() => steps.map((s) => ({
    label: s.label,
    value: s.reached,
    note: s.reached > 0 && s.key !== 'teslimat'
      ? `${s.advanced} ilerledi · ${s.waiting} bekliyor${s.dead > 0 ? ` · ${s.dead} düştü` : ''}`
      : undefined,
  })), [steps])
  const activeSamples = active.data?.samples ?? 0
  useEffect(() => {
    if (!data) { setCsv(null); setPdf(null); return }
    setCsv({
      filename: `donusum-raporu-${period.key}`,
      headers: ['Adım', 'Ulaşan', 'İlerleyen', 'Bekleyen', 'Düşen (red/iptal)'],
      rows: steps.map((s) => [s.label, s.reached, s.advanced, s.waiting, s.dead]),
    })
    const t = byKey.get('talep'), q = byKey.get('teklif'), n = byKey.get('numune'), o = byKey.get('siparis')
    const total = data.total ?? 0
    const toOrders = o?.reached ?? 0
    const overall = total > 0 ? (100 * toOrders) / total : null
    const qAlive = (q?.advanced ?? 0) + (q?.waiting ?? 0)
    const lowData = (n?.reached ?? 0) < 20 || (o?.reached ?? 0) < 20
    setPdf({
      kpis: [
        { label: 'Talep (giriş)', value: String(total), sub: 'bu dönemde açılan toplam talep' },
        { label: 'Teklife geçen', value: t?.advance_rate == null ? '—' : `%${t.advance_rate.toFixed(0)}`, sub: `${t?.advanced ?? 0} geçti · ${t?.waiting ?? 0} bekliyor` },
        { label: 'Şu an numunede', value: String(activeSamples), sub: 'anlık durum (dönemden bağımsız)' },
        { label: 'Uçtan uca dönüşüm', value: overall == null ? '—' : `%${overall.toFixed(1)}`, sub: `${toOrders}/${total} siparişe ulaştı` },
      ],
      blocks: [
        ...(q && q.reached > 0 ? [{ kind: 'sentence' as const, text: `${q.reached} teklifin ${q.dead}'i reddedildi/iptal edildi, ${qAlive}'i canlı — bunların ${q.advanced}'i numuneye geçti, ${q.waiting}'i henüz numuneye geçmedi.` }] : []),
        { kind: 'funnel', title: 'Dönüşüm hunisi', steps: funnelSteps, caption: 'Her adım notu: ilerleyen · bekleyen · düşen (red/iptal). Mor = ilerleyen, amber = bekleyen/düşen.' },
        ...(lowData ? [{ kind: 'notice' as const, variant: 'low' as const, title: 'Numune/sipariş verisi henüz sığ', text: `Bu dönemde ${n?.reached ?? 0} numune ve ${o?.reached ?? 0} sipariş var. Anlamlı numune→sipariş→teslimat oranı için adım başına en az ~20 kayıt gerekir; şimdilik yalnızca talep→teklif güvenilir.` }] : []),
        { kind: 'notice', variant: 'none', title: 'Teslimat termin uyumu bu huniye dahil değil', text: 'Sipariş→teslimat adımında zamanında teslim oranı ayrıca toplanmıyor; huni yalnızca aşamaya ulaşma akışını gösterir.' },
      ],
    })
    return () => { setCsv(null); setPdf(null) }
  }, [data, steps, byKey, funnelSteps, activeSamples, period.key, setCsv, setPdf])
  if (isLoading) return <ReportLoading />

  const talep = byKey.get('talep')
  const teklif = byKey.get('teklif')
  const numune = byKey.get('numune')
  const siparis = byKey.get('siparis')
  const total = data?.total ?? 0
  const toOrders = siparis?.reached ?? 0
  const overall = total > 0 ? (100 * toOrders) / total : null
  const teklifAlive = (teklif?.advanced ?? 0) + (teklif?.waiting ?? 0)
  // Alt adımlar (numune ve sonrası) için kayıt derinliği eşiği.
  const lowData = (numune?.reached ?? 0) < 20 || (siparis?.reached ?? 0) < 20

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Insight label="Talep (giriş)" value={String(total)}
          sentence="Huninin girişi: bu dönemde açılan toplam talep." />
        <Insight label="Teklife geçen" value={talep?.advance_rate == null ? '—' : `%${talep.advance_rate.toFixed(0)}`}
          sentence={`${total} talebin ${talep?.advanced ?? 0}'i teklife geçti; ${talep?.waiting ?? 0}'i hâlâ teklif bekliyor.`} />
        <Insight label="Şu an numunede" value={String(active.data?.samples ?? 0)}
          sentence="Güncelde numune aşamasında süren iş (dönemden bağımsız anlık durum)." />
        <Insight label="Uçtan uca dönüşüm" value={overall == null ? '—' : `%${overall.toFixed(1)}`}
          tone={(overall ?? 0) >= 20 ? 'text-success-foreground' : 'text-warning-foreground'}
          sentence={`${total} talebin ${toOrders}'i siparişe ulaştı.`} />
      </div>

      {teklif && teklif.reached > 0 && (
        <p className="text-text-secondary text-sm leading-snug">
          <strong className="text-foreground">{teklif.reached} teklifin</strong> {teklif.dead}'i reddedildi/iptal edildi,{' '}
          {teklifAlive}'i canlı — bunların {teklif.advanced}'i numuneye geçti, {teklif.waiting}'i henüz numuneye geçmedi.
        </p>
      )}

      <ReportSection title="Dönüşüm hunisi">
        <Funnel steps={funnelSteps} />
        <p className="text-text-muted text-xs">
          <span className="inline-block size-2 translate-y-px rounded-sm" style={{ background: '#6e55ff' }} /> mor = sonraki adıma ilerleyen ·{' '}
          <span className="inline-block size-2 translate-y-px rounded-sm" style={{ background: '#f59e0b' }} /> amber = o adımda bekleyen/düşen.
          Sağdaki not her adımda ilerleyen · bekleyen · düşen (red/iptal) sayısını verir.
        </p>
      </ReportSection>

      {lowData && (
        <LowDataNotice title="Numune/sipariş verisi henüz sığ">
          Bu dönemde {numune?.reached ?? 0} numune ve {siparis?.reached ?? 0} sipariş kaydı var. Anlamlı bir
          numune→sipariş→teslimat dönüşüm oranı için adım başına en az ~20 kayıt gerekiyor; şimdilik alt adımlar
          yön göstermez, yalnızca giriş (talep→teklif) güvenilirdir.
        </LowDataNotice>
      )}

      <LowDataNotice variant="none" title="Teslimat termin uyumu bu huniye dahil değil">
        Sipariş→teslimat adımında sözlü/gerçek termin karşılaştırması (zamanında teslim oranı) bu metrik için
        ayrıca toplanmıyor; huni yalnızca aşamaya <em>ulaşma</em> akışını gösterir.
      </LowDataNotice>
    </div>
  )
}

// ── 4) FİNANS RAPORU (reports.finance) ─────────────────────────────────
interface FinanceMetricR { revenue_usd: number; revenue_try: number; collected_usd: number; outstanding_usd: number; overdue_usd: number; by_month: { month: string; revenue_usd: number; revenue_try: number }[] }
export function FinansRaporu({ period, setCsv, setPdf }: ReportProps) {
  const { data, isLoading } = useSimpleMetric<FinanceMetricR>('metric_finance', period)
  useEffect(() => {
    if (!data) { setCsv(null); setPdf(null); return }
    setCsv({ filename: `finans-raporu-${period.key}`, headers: ['Ay', 'Ciro (USD)', 'Ciro (TRY)'], rows: (data.by_month ?? []).map((x) => [x.month, x.revenue_usd, x.revenue_try]) })
    const collectRate = (data.revenue_usd ?? 0) > 0 ? ` (%${((100 * (data.collected_usd ?? 0)) / (data.revenue_usd ?? 1)).toFixed(0)})` : ''
    setPdf({
      kpis: [
        { label: 'Ciro (USD)', value: formatMoney(data.revenue_usd ?? 0, 'USD'), sub: formatMoney(data.revenue_try ?? 0, 'TRY') },
        { label: 'Tahsil edilen', value: formatMoney(data.collected_usd ?? 0, 'USD') },
        { label: 'Açık alacak', value: formatMoney(data.outstanding_usd ?? 0, 'USD') },
        { label: 'Gecikmiş', value: formatMoney(data.overdue_usd ?? 0, 'USD') },
      ],
      blocks: [
        { kind: 'sentence', text: `Bu dönem ${formatMoney(data.revenue_usd ?? 0, 'USD')} ciro tahakkuk etti; ${formatMoney(data.collected_usd ?? 0, 'USD')} tahsil edildi${collectRate}. Açık alacak ${formatMoney(data.outstanding_usd ?? 0, 'USD')}, bunun ${formatMoney(data.overdue_usd ?? 0, 'USD')}'ı vadesi geçmiş.` },
        { kind: 'table', title: 'Aya göre ciro', headers: ['Ay', 'USD', 'TRY'], rows: (data.by_month ?? []).map((x) => [x.month, formatMoney(x.revenue_usd, 'USD'), formatMoney(x.revenue_try, 'TRY')]) },
      ],
    })
    return () => { setCsv(null); setPdf(null) }
  }, [data, period.key, setCsv, setPdf])
  if (isLoading) return <ReportLoading />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Ciro (USD)" value={formatMoney(data?.revenue_usd ?? 0, 'USD')} sub={formatMoney(data?.revenue_try ?? 0, 'TRY')} />
        <Kpi label="Tahsil edilen" value={formatMoney(data?.collected_usd ?? 0, 'USD')} tone="text-success-foreground" />
        <Kpi label="Açık alacak" value={formatMoney(data?.outstanding_usd ?? 0, 'USD')} tone="text-warning-foreground" />
        <Kpi label="Gecikmiş" value={formatMoney(data?.overdue_usd ?? 0, 'USD')} tone={(data?.overdue_usd ?? 0) > 0 ? 'text-danger-foreground' : undefined} />
      </div>
      <p className="text-text-secondary text-sm leading-snug">
        Bu dönem <strong className="text-foreground">{formatMoney(data?.revenue_usd ?? 0, 'USD')}</strong> ciro
        tahakkuk etti; {formatMoney(data?.collected_usd ?? 0, 'USD')} tahsil edildi
        {(data?.revenue_usd ?? 0) > 0 && ` (%${((100 * (data?.collected_usd ?? 0)) / (data?.revenue_usd ?? 1)).toFixed(0)})`}.
        Açık alacak {formatMoney(data?.outstanding_usd ?? 0, 'USD')}, bunun {formatMoney(data?.overdue_usd ?? 0, 'USD')}'ı vadesi geçmiş.
      </p>
      <ReportSection title="Aya göre ciro">
        <DataTable cols={[{ key: 'm', label: 'Ay' }, { key: 'u', label: 'USD', align: 'right' }, { key: 't', label: 'TRY', align: 'right' }]}
          rows={(data?.by_month ?? []).map((x) => ({ m: x.month, u: formatMoney(x.revenue_usd, 'USD'), t: formatMoney(x.revenue_try, 'TRY') }))} />
      </ReportSection>
    </div>
  )
}

// ── 5) EKİP & ETKİLEŞİM RAPORU ─────────────────────────────────────────
export function EkipRaporu({ period, setCsv, setPdf }: ReportProps) {
  const emp = useEmployeesMetric(period)
  const inter = useInteractionsMetric(period)
  const empData = emp.data
  const interData = inter.data
  const rows = useMemo(() => (empData ?? []).slice().sort((a, b) => (b.requests_handled ?? 0) - (a.requests_handled ?? 0)), [empData])
  useEffect(() => {
    if (!empData) { setCsv(null); setPdf(null); return }
    setCsv({
      filename: `ekip-raporu-${period.key}`,
      headers: ['Çalışan', 'E-posta', 'Talep', 'Teklif', 'Kabul', 'Red', 'Bekleyen', 'Dönüşüm %', 'Etkileşim'],
      rows: rows.map((e) => [e.name, e.email, e.requests_handled, e.quotes_sent, e.quotes_accepted, e.quotes_rejected, e.quotes_pending, e.conversion_rate ?? '', e.interactions]),
    })
    const top = rows[0]
    setPdf({
      kpis: [
        { label: 'Toplam etkileşim', value: String(interData?.total ?? 0), sub: `önceki dönem: ${interData?.prev_total ?? 0}` },
        { label: 'Olumlu oran', value: pct(interData?.positive_rate) },
        { label: 'Aktif çalışan', value: String(rows.length) },
        { label: 'Toplam teklif', value: String(rows.reduce((s, e) => s + (e.quotes_sent ?? 0), 0)) },
      ],
      blocks: [
        ...(top ? [{ kind: 'sentence' as const, text: `Bu dönem ${rows.length} çalışan aktifti; en çok talebi ${top.name} yürüttü (${top.requests_handled} talep, ${top.quotes_sent} teklif${top.conversion_rate != null ? `, dönüşüm %${top.conversion_rate.toFixed(0)}` : ''}).` }] : []),
        { kind: 'table', title: 'Çalışan performansı',
          headers: ['Çalışan', 'Talep', 'Teklif', 'Bekleyen', 'Dönüşüm', 'Etkileşim'],
          rows: rows.map((e) => [e.name, e.requests_handled, e.quotes_sent, e.quotes_pending, e.conversion_rate == null ? '—' : `%${e.conversion_rate.toFixed(0)}`, e.interactions]) },
        { kind: 'notice', variant: 'none', title: 'Dönüşüm = kabul ÷ sonuçlanan', text: 'Cevap bekleyen teklifler paydaya girmez. Geçmiş teklifler Süreç Takip aktarımında operasyon sahibinden türetilmiştir.' },
      ],
    })
    return () => { setCsv(null); setPdf(null) }
  }, [empData, interData, rows, period.key, setCsv, setPdf])
  if (emp.isLoading) return <ReportLoading />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Toplam etkileşim" value={String(inter.data?.total ?? 0)} sub={`önceki dönem: ${inter.data?.prev_total ?? 0}`} />
        <Kpi label="Olumlu oran" value={pct(inter.data?.positive_rate)} />
        <Kpi label="Aktif çalışan" value={String(rows.length)} />
        <Kpi label="Toplam teklif" value={String(rows.reduce((s, e) => s + (e.quotes_sent ?? 0), 0))} />
      </div>
      {rows[0] && (
        <p className="text-text-secondary text-sm leading-snug">
          Bu dönem <strong className="text-foreground">{rows.length}</strong> çalışan aktifti;{' '}
          en çok talebi <strong className="text-foreground">{rows[0].name}</strong> yürüttü
          ({rows[0].requests_handled} talep, {rows[0].quotes_sent} teklif
          {rows[0].conversion_rate != null && `, dönüşüm %${rows[0].conversion_rate.toFixed(0)}`}).
        </p>
      )}
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

