import { useNavigate } from 'react-router-dom'
import { MessageSquare, FileText, Timer, Wallet, TrendingUp, TrendingDown, Minus, AlertTriangle, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import {
  usePeriod, PERIODS, type Period,
  useInteractionsMetric, useRequestsMetric, useFunnelMetric, useQuotesMetric, useFinanceMetric,
  useEmployeesMetric, useRequestTrend, useInterventions, usePendingRequests, usePendingQuotes,
  useChangeMinBase,
} from '@/hooks/useMetrics'
import { useHasPermission } from '@/hooks/useCatalog'
import { TrendLine, BarList, Funnel } from './MiniCharts'
import { Skeleton } from '@/components/ui/skeleton'

// ── Dönem seçici ───────────────────────────────────────────────────────
function PeriodPicker({ period, onPick }: { period: Period; onPick: (k: Period['key']) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
      {PERIODS.filter((p) => p.key !== 'custom').map((p) => (
        <button key={p.key} type="button" onClick={() => onPick(p.key)}
          className={cn('rounded-md px-3 py-1 text-sm font-medium transition-colors',
            period.key === p.key ? 'bg-accent-primary text-white' : 'text-text-secondary hover:bg-muted')}>
          {p.label}
        </button>
      ))}
    </div>
  )
}

// ── Üst şerit: 4 rakam + değişim ───────────────────────────────────────
function ChangeBadge({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-text-muted text-xs">—</span>
  const up = pct > 0, flat = pct === 0
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown
  return (
    <span className={cn('flex items-center gap-0.5 text-xs font-medium tabular-nums',
      flat ? 'text-text-secondary' : up ? 'text-success-foreground' : 'text-danger-foreground')}>
      <Icon className="size-3.5" /> %{Math.abs(pct).toFixed(0)}
    </span>
  )
}

function StatCard({ icon: Icon, label, value, change, prev, minBase, sub, tone, onClick }: {
  icon: typeof MessageSquare; label: string; value: string; change?: number | null
  prev?: number; minBase?: number; sub?: string; tone?: string; onClick?: () => void
}) {
  // Küçük taban: önceki dönem eşiğin altındaysa yüzde yerine ham sayı
  const smallBase = change !== undefined && prev !== undefined && minBase !== undefined && prev < minBase
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={cn('bg-card flex flex-col gap-1 rounded-lg border border-border p-4 text-left shadow-card transition-colors',
        onClick && 'hover:border-accent-primary/50 cursor-pointer')}>
      <div className="text-text-secondary flex items-center gap-1.5 text-xs font-medium">
        <Icon className={cn('size-4', tone ?? 'text-accent-primary')} /> {label}
      </div>
      <div className="text-foreground text-2xl font-semibold tabular-nums">{value}</div>
      <div className="flex items-center gap-2">
        {change !== undefined && !smallBase && <ChangeBadge pct={change} />}
        {smallBase
          ? <span className="text-text-muted text-xs">önceki dönem: {prev}</span>
          : sub && <span className="text-text-muted text-xs">{sub}</span>}
      </div>
    </button>
  )
}

function TopStrip({ period }: { period: Period }) {
  const nav = useNavigate()
  const inter = useInteractionsMetric(period)
  const req = useRequestsMetric(period)
  const fin = useFinanceMetric(period)
  const canFinance = useHasPermission('finance.view')
  const minBase = useChangeMinBase().data ?? 10
  const loading = inter.isLoading || req.isLoading
  if (loading) return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
  const r = req.data
  const slaTone = (r?.sla_rate ?? 100) >= 80 ? 'text-success-foreground' : (r?.sla_rate ?? 0) >= 50 ? 'text-warning-foreground' : 'text-danger-foreground'
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={MessageSquare} label="Etkileşim" value={String(inter.data?.total ?? 0)} change={inter.data?.change_pct}
        prev={inter.data?.prev_total} minBase={minBase} sub={`önce ${inter.data?.prev_total ?? 0}`} onClick={() => nav('/raporlar?rapor=etkilesim')} />
      <StatCard icon={FileText} label="Talep" value={String(r?.total ?? 0)} change={r?.change_pct}
        prev={r?.prev_total} minBase={minBase} sub={`önce ${r?.prev_total ?? 0}`} onClick={() => nav('/raporlar?rapor=talep')} />
      <StatCard icon={Timer} label="24 saat sözü" value={`%${(r?.sla_rate ?? 0).toFixed(0)}`} tone={slaTone}
        sub={`${r?.sla_met_count ?? 0} tuttu · ${r?.sla_missed_count ?? 0} kaçtı`} onClick={() => nav('/raporlar?rapor=talep')} />
      {canFinance.data
        ? <StatCard icon={Wallet} label="Açık alacak" value={formatMoney(fin.data?.outstanding_usd ?? 0, 'USD')} tone="text-warning-foreground"
            sub={fin.data && fin.data.overdue_usd > 0 ? `${formatMoney(fin.data.overdue_usd, 'USD')} gecikmiş` : 'gecikmiş yok'} onClick={() => nav('/finans')} />
        : <StatCard icon={Wallet} label="Açık alacak" value="—" sub="finans yetkisi gerekli" tone="text-text-muted" />}
    </div>
  )
}

// ── Müdahale gerekenler (üç şiddet: kritik/uyarı/bilgi) ─────────────────
type Severity = 'critical' | 'warning' | 'info'
const SEVERITY: Record<string, Severity> = {
  sla_gecti: 'critical', tahsilat_gecikti: 'critical',
  sla_soon: 'warning', cevap_36: 'warning', cevap_36_soon: 'warning', termin_yakin: 'warning', numune_3tur: 'warning',
  sahipsiz: 'info',
}
const SEV_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }
const SEV_STYLE: Record<Severity, { row: string; badge: string; text: string; chevron: string }> = {
  critical: { row: 'border-danger-foreground/20 bg-danger hover:bg-danger/70', badge: 'bg-danger-foreground text-white', text: 'text-danger-foreground', chevron: 'text-danger-foreground/60' },
  warning: { row: 'border-warning-foreground/20 bg-warning hover:bg-warning/70', badge: 'bg-warning-foreground text-white', text: 'text-warning-foreground', chevron: 'text-warning-foreground/60' },
  info: { row: 'border-border bg-muted/40 hover:bg-muted', badge: 'bg-text-secondary text-white', text: 'text-foreground', chevron: 'text-text-muted' },
}
function Interventions() {
  const nav = useNavigate()
  const { data, isLoading } = useInterventions()
  const rows = (data ?? []).filter((i) => i.count > 0)
    .map((i) => ({ ...i, sev: SEVERITY[i.key] ?? 'info' as Severity }))
    .sort((a, b) => SEV_RANK[a.sev] - SEV_RANK[b.sev])
  return (
    <section className="bg-card space-y-2 rounded-lg border border-border p-4 shadow-card">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <AlertTriangle className="size-4 text-danger-foreground" /> Bugün müdahale gerekenler
      </h3>
      {isLoading ? <Skeleton className="h-24" /> : rows.length === 0
        ? <p className="text-text-secondary py-3 text-sm">Bekleyen kritik iş yok. 👍</p>
        : <div className="space-y-1">
            {rows.map((i) => {
              const st = SEV_STYLE[i.sev]
              return (
                <button key={i.key} type="button" onClick={() => nav(i.href)}
                  className={cn('flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors', st.row)}>
                  <span className={cn('min-w-7 rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums', st.badge)}>{i.count}</span>
                  <span className={cn('flex-1 text-sm font-medium', st.text)}>{i.label}</span>
                  <ChevronRight className={cn('size-4', st.chevron)} />
                </button>
              )
            })}
          </div>}
    </section>
  )
}

// ── Teklif bekleyen talepler + cevap bekleyen teklifler ────────────────
function since(iso: string | null, nowMs: number): string {
  if (!iso) return ''
  const h = Math.floor((nowMs - new Date(iso).getTime()) / 3600e3)
  return h < 24 ? `${Math.max(0, h)} saat` : `${Math.floor(h / 24)} gün`
}

function PendingRequests({ nowMs }: { nowMs: number }) {
  const nav = useNavigate()
  const { data, isLoading } = usePendingRequests(6)
  const rows = data ?? []
  return (
    <section className="bg-card space-y-2 rounded-lg border border-border p-4 shadow-card">
      <h3 className="text-sm font-semibold text-foreground">Teklif bekleyen talepler</h3>
      {isLoading ? <Skeleton className="h-24" /> : rows.length === 0
        ? <p className="text-text-secondary py-3 text-sm">Teklif bekleyen talep yok.</p>
        : <div className="space-y-1">
            {rows.map((r) => {
              const overdue = r.sla_deadline ? new Date(r.sla_deadline).getTime() < nowMs : false
              return (
                <div key={r.operation_id} role="button" tabIndex={0} onClick={() => nav(`/talepler/${r.operation_id}`)}
                  onKeyDown={(e) => (e.key === 'Enter') && nav(`/talepler/${r.operation_id}`)}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted/50">
                  <span className="text-foreground min-w-0 flex-1 truncate font-medium">{r.customer ?? '—'}</span>
                  {r.unowned && <span className="bg-danger text-danger-foreground rounded px-1.5 py-0.5 text-[10px] font-medium">sahipsiz</span>}
                  <span className="text-text-muted shrink-0 font-mono text-[11px]">{r.code}</span>
                  <span className={cn('shrink-0 text-xs tabular-nums', overdue ? 'text-danger-foreground font-medium' : 'text-text-secondary')}>
                    {since(r.requested_at, nowMs)}{overdue ? ' · süre doldu' : ''}
                  </span>
                </div>
              )
            })}
          </div>}
    </section>
  )
}

function PendingQuotes() {
  const nav = useNavigate()
  const { data, isLoading } = usePendingQuotes(6)
  const rows = data ?? []
  return (
    <section className="bg-card space-y-2 rounded-lg border border-border p-4 shadow-card">
      <h3 className="text-sm font-semibold text-foreground">Cevap bekleyen teklifler</h3>
      {isLoading ? <Skeleton className="h-24" /> : rows.length === 0
        ? <p className="text-text-secondary py-3 text-sm">Cevap bekleyen teklif yok.</p>
        : <div className="space-y-1">
            {rows.map((r) => {
              const late = r.hours >= 36
              return (
                <div key={r.quote_id} role="button" tabIndex={0} onClick={() => nav(`/talepler/${r.operation_id}`)}
                  onKeyDown={(e) => (e.key === 'Enter') && nav(`/talepler/${r.operation_id}`)}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted/50">
                  <span className="text-foreground min-w-0 flex-1 truncate font-medium">{r.customer ?? '—'}</span>
                  <span className="text-text-muted shrink-0 font-mono text-[11px]">{r.code}</span>
                  <span className={cn('shrink-0 text-xs tabular-nums', late ? 'text-danger-foreground font-medium' : 'text-text-secondary')}>
                    {r.hours} saat bekliyor
                  </span>
                </div>
              )
            })}
          </div>}
    </section>
  )
}

// ── Huni + eğilim + red sebepleri ──────────────────────────────────────
function FunnelCard({ period }: { period: Period }) {
  const { data, isLoading } = useFunnelMetric(period)
  if (isLoading) return <Skeleton className="h-40" />
  const f = data
  const rate = (step: string) => f?.conversion_rates.find((c) => c.step === step)?.rate ?? null
  const stages = [
    { label: 'Talep', value: f?.requests ?? 0, rate: null },
    { label: 'Teklif', value: f?.quotes ?? 0, rate: rate('talep→teklif') },
    { label: 'Numune', value: f?.samples ?? 0, rate: rate('teklif→numune') },
    { label: 'Sipariş', value: f?.orders ?? 0, rate: rate('numune→sipariş') },
  ]
  // en zayıf adım yorumu
  const drops = stages.slice(1).map((s, i) => ({ step: `${stages[i]?.label ?? ''}→${s.label}`, rate: s.rate ?? 100 }))
  const worst = drops.length ? drops.reduce((a, b) => (b.rate < a.rate ? b : a)) : null
  return (
    <section className="bg-card space-y-3 rounded-lg border border-border p-4 shadow-card">
      <h3 className="text-sm font-semibold text-foreground">Dönüşüm hunisi</h3>
      <Funnel stages={stages} />
      {worst && <p className="text-text-secondary text-xs">En büyük kayıp <span className="text-foreground font-medium">{worst.step}</span> adımında (%{worst.rate.toFixed(0)} geçiş).</p>}
    </section>
  )
}

function TrendCard({ period }: { period: Period }) {
  const { data, isLoading } = useRequestTrend(period)
  return (
    <section className="bg-card space-y-2 rounded-lg border border-border p-4 shadow-card">
      <h3 className="text-sm font-semibold text-foreground">Talep eğilimi</h3>
      {isLoading ? <Skeleton className="h-24" /> : <TrendLine points={data ?? []} />}
    </section>
  )
}

function RejectionCard({ period }: { period: Period }) {
  const { data, isLoading } = useQuotesMetric(period)
  return (
    <section className="bg-card space-y-2 rounded-lg border border-border p-4 shadow-card">
      <h3 className="text-sm font-semibold text-foreground">Teklif red sebepleri</h3>
      {isLoading ? <Skeleton className="h-24" /> : <BarList rows={data?.by_rejection_reason ?? []} barClass="bg-danger-foreground" empty="Bu dönemde red yok." />}
    </section>
  )
}

// ── Ekip özeti ─────────────────────────────────────────────────────────
function TeamCard({ period }: { period: Period }) {
  const { data, isLoading } = useEmployeesMetric(period)
  const rows = (data ?? []).slice().sort((a, b) => (b.requests_handled ?? 0) - (a.requests_handled ?? 0))
  // Aynı isim birden çok satırda ise e-posta ile ayırt et (iki gerçek hesap olabilir)
  const nameCount = new Map<string, number>()
  rows.forEach((e) => nameCount.set(e.name, (nameCount.get(e.name) ?? 0) + 1))
  // "En yüksek dönüşüm" yalnız sonuçlanmış teklifi olanlar arasında (conversion_rate != null)
  const decided = rows.filter((e) => e.conversion_rate != null)
  const best = decided.length ? decided.reduce((a, b) => ((b.conversion_rate ?? 0) > (a.conversion_rate ?? 0) ? b : a)) : null
  const convTone = (v: number) => v >= 50 ? 'text-success-foreground' : v >= 25 ? 'text-warning-foreground' : 'text-danger-foreground'
  return (
    <section className="bg-card space-y-3 rounded-lg border border-border p-4 shadow-card">
      <h3 className="text-sm font-semibold text-foreground">Ekip özeti</h3>
      {isLoading ? <Skeleton className="h-32" /> : rows.length === 0
        ? <p className="text-text-secondary py-3 text-sm">Bu dönemde ekip aktivitesi yok.</p>
        : <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-text-secondary border-b border-border text-left text-xs">
                    <th className="py-1 font-medium">Çalışan</th>
                    <th className="py-1 text-right font-medium">Talep</th>
                    <th className="py-1 text-right font-medium">Teklif</th>
                    <th className="py-1 text-right font-medium">Bekleyen</th>
                    <th className="py-1 text-right font-medium">Dönüşüm</th>
                    <th className="py-1 text-right font-medium">Ort. yanıt</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.user_id} className="border-b border-border/50 last:border-0">
                      <td className="py-1.5">
                        <span className="text-foreground font-medium">{e.name}</span>
                        {(nameCount.get(e.name) ?? 0) > 1 && <span className="text-text-muted ml-1 text-xs">({e.email})</span>}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{e.requests_handled}</td>
                      <td className="py-1.5 text-right tabular-nums">{e.quotes_sent}</td>
                      <td className="text-text-secondary py-1.5 text-right tabular-nums">{e.quotes_pending}</td>
                      <td className={cn('py-1.5 text-right font-medium tabular-nums',
                        e.conversion_rate == null ? 'text-text-muted' : convTone(e.conversion_rate))}
                        title={e.conversion_rate == null ? 'Henüz sonuçlanmış teklif yok' : `${e.quotes_accepted} kabul / ${e.quotes_accepted + e.quotes_rejected} sonuçlanan`}>
                        {e.conversion_rate == null ? '—' : `%${e.conversion_rate.toFixed(0)}`}
                      </td>
                      <td className="text-text-secondary py-1.5 text-right tabular-nums">{e.avg_response_hours != null ? `${e.avg_response_hours.toFixed(0)} sa` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-text-muted text-xs">Dönüşüm = kabul ÷ sonuçlanan (kabul + red). Cevap bekleyen teklifler hariç.</p>
            {best && <p className="text-text-secondary text-xs">En yüksek dönüşüm <span className="text-foreground font-medium">{best.name}</span> (%{(best.conversion_rate ?? 0).toFixed(0)}).</p>}
          </>}
    </section>
  )
}

/** P7.3 — Yönetici gösterge paneli. reports.view olan kullanıcıya çalışan
 *  bloklarının ÜSTÜNDE görünür. Tüm sayılar metrics.* tek kaynağından. */
export function ManagerBoard() {
  const { period, setPeriod, nowMs } = usePeriod()
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">Yönetici görünümü</h2>
        <PeriodPicker period={period} onPick={(k) => setPeriod(k)} />
      </div>
      <TopStrip period={period} />
      <Interventions />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PendingRequests nowMs={nowMs} />
        <PendingQuotes />
        <FunnelCard period={period} />
        <TrendCard period={period} />
        <RejectionCard period={period} />
      </div>
      <TeamCard period={period} />
    </div>
  )
}
