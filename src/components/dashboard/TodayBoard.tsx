import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, MessageSquare, FlaskConical, Package, BellRing, HandHelping,
  Zap, Shirt, Clock, CheckCircle2, Loader2, AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { toUserMessage } from '@/lib/errors'
import { Skeleton } from '@/components/ui/skeleton'
import { useSignedUrl } from '@/hooks/useFiles'
import {
  computeRange, type Period, type PeriodKey,
  useRequestsMetric, useQuotesMetric, useInteractionsMetric, useFunnelMetric,
  usePendingRequests, type PendingRequest,
} from '@/hooks/useMetrics'
import { useAllQuotes, type QuoteListRow } from '@/hooks/useQuotes'
import { useAllSamples, type SampleListRow } from '@/hooks/useSamples'
import { useAllOrders, type OrderListRow } from '@/hooks/useOrders'
import { useTaskList, useUpdateTask, useTaskStatuses, type TaskRow } from '@/hooks/useTasks'

// ── Zaman + biçim yardımcıları ─────────────────────────────────────────
const HOUR = 3600e3
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '—'
/** "ne kadar süredir bekliyor" — iso'dan nowMs'e kadar geçen süre. */
function since(iso: string | null, nowMs: number): string {
  if (!iso) return '—'
  const ms = nowMs - new Date(iso).getTime()
  if (ms < HOUR) return `${Math.max(1, Math.floor(ms / 60000))} dk`
  if (ms < 24 * HOUR) return `${Math.floor(ms / HOUR)} saat`
  return `${Math.floor(ms / (24 * HOUR))} gün`
}

// ── Dönem seçici (varsayılan: Bugün) ───────────────────────────────────
const TB_PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Bugün' },
  { key: 'last2', label: 'Son 2 gün' },
  { key: 'week', label: 'Bu hafta' },
  { key: 'month', label: 'Bu ay' },
]
function PeriodPicker({ value, onPick }: { value: PeriodKey; onPick: (k: PeriodKey) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
      {TB_PERIODS.map((p) => (
        <button key={p.key} type="button" onClick={() => onPick(p.key)}
          className={cn('rounded-md px-3 py-1 text-sm font-medium transition-colors',
            value === p.key ? 'bg-accent-primary text-white' : 'text-text-secondary hover:bg-muted')}>
          {p.label}
        </button>
      ))}
    </div>
  )
}

// ── Ortak kabuk: bölüm + özet kart ─────────────────────────────────────
function Section({ icon: Icon, title, count, loading, empty, children }: {
  icon: typeof FileText; title: string; count: number; loading: boolean; empty: string; children: React.ReactNode
}) {
  return (
    <section className="bg-card space-y-2 rounded-lg border border-border p-4 shadow-card">
      <div className="flex items-center gap-2">
        <Icon className="text-accent-primary size-4" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {count > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-text-secondary">{count}</span>}
      </div>
      {loading ? <Skeleton className="h-16 w-full" /> : count === 0
        ? <p className="text-text-secondary py-3 text-sm">{empty}</p>
        : <div className="space-y-1">{children}</div>}
    </section>
  )
}

function StatCard({ icon: Icon, label, value, loading, onClick }: {
  icon: typeof FileText; label: string; value: number; loading: boolean; onClick?: () => void
}) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={cn('bg-card flex flex-col gap-1 rounded-lg border border-border p-4 text-left shadow-card transition-colors',
        onClick && 'hover:border-accent-primary/50 cursor-pointer')}>
      <div className="text-text-secondary flex items-center gap-1.5 text-xs font-medium">
        <Icon className="text-accent-primary size-4" /> {label}
      </div>
      {loading
        ? <Skeleton className="h-8 w-12" />
        : <div className="text-foreground text-2xl font-semibold tabular-nums">{value}</div>}
    </button>
  )
}

// ① Özet kartları ───────────────────────────────────────────────────────
function TopCards({ period }: { period: Period }) {
  const nav = useNavigate()
  const req = useRequestsMetric(period)
  const quo = useQuotesMetric(period)
  const inter = useInteractionsMetric(period)
  const fun = useFunnelMetric(period)
  const funLoading = fun.isLoading
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatCard icon={FileText} label="Gelen talep" value={req.data?.total ?? 0} loading={req.isLoading} onClick={() => nav('/talepler')} />
      <StatCard icon={FileText} label="Verilen teklif" value={quo.data?.sent ?? 0} loading={quo.isLoading} onClick={() => nav('/teklifler')} />
      <StatCard icon={MessageSquare} label="Girilen aksiyon" value={inter.data?.total ?? 0} loading={inter.isLoading} onClick={() => nav('/raporlar?rapor=etkilesim')} />
      <StatCard icon={FlaskConical} label="Numunede ürün" value={fun.data?.samples ?? 0} loading={funLoading} onClick={() => nav('/numuneler')} />
      <StatCard icon={Package} label="Siparişte ürün" value={fun.data?.orders ?? 0} loading={funLoading} onClick={() => nav('/siparisler')} />
    </div>
  )
}

// ② Teklif bekliyor ─────────────────────────────────────────────────────
function Thumb({ path }: { path: string | null | undefined }) {
  const [noTx, setNoTx] = useState(false)
  const url = useSignedUrl(path ? { bucket: 'documents', storage_path: path } : null, path && !noTx ? { width: 80, resize: 'cover' } : undefined)
  if (!path) return <div className="bg-muted text-text-muted flex size-9 shrink-0 items-center justify-center rounded-md"><Shirt className="size-4" /></div>
  return url.data
    ? <img src={url.data} alt="" className="size-9 shrink-0 rounded-md object-cover" loading="lazy" decoding="async" onError={() => { if (!noTx) setNoTx(true) }} />
    : <div className="size-9 shrink-0 animate-pulse rounded-md bg-muted" />
}

function PendingQuotesSection({ nowMs }: { nowMs: number }) {
  const nav = useNavigate()
  const { data, isLoading } = usePendingRequests(50)
  // RPC en uzun bekleyeni (sla_deadline/requested_at asc) zaten üste koyar.
  const rows = (data ?? []) as PendingRequest[]
  return (
    <Section icon={HandHelping} title="Teklif bekliyor" count={rows.length} loading={isLoading} empty="Teklif bekleyen talep yok.">
      {rows.map((r) => {
        const overdue = r.sla_deadline ? new Date(r.sla_deadline).getTime() < nowMs : false
        return (
          <div key={r.operation_id} role="button" tabIndex={0} onClick={() => nav(`/talepler/${r.operation_id}`)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && nav(`/talepler/${r.operation_id}`)}
            className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted/50">
            <Thumb path={r.image_path} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-foreground truncate font-medium">{r.customer ?? '—'}</span>
                {r.unowned && <span className="bg-danger text-danger-foreground rounded px-1.5 py-0.5 text-[10px] font-medium">sahipsiz</span>}
              </div>
              <span className="text-text-muted font-mono text-[11px]">{r.code}</span>
            </div>
            <span className={cn('shrink-0 text-xs tabular-nums', overdue ? 'text-danger-foreground font-medium' : 'text-text-secondary')}>
              <Clock className="mr-1 inline size-3" />{since(r.requested_at, nowMs)}{overdue ? ' · süre doldu' : ''}
            </span>
            <button type="button" title="Hızlı teklif" onClick={(e) => { e.stopPropagation(); nav(`/talepler/${r.operation_id}`) }}
              className="text-accent-primary hover:bg-accent-pale shrink-0 rounded-md p-1.5 transition-colors">
              <Zap className="size-4" />
            </button>
          </div>
        )
      })}
    </Section>
  )
}

// ③ Teklif iletildi ─────────────────────────────────────────────────────
const RESULT_ACCEPTED = new Set(['onaylandi', 'kabul_edildi', 'numune_asamasina_gecildi'])
const RESULT_REJECTED = new Set(['olumsuz', 'reddedildi', 'iptal_edildi', 'suresi_doldu'])
function quoteResult(key: string | null): { label: string; tone: string } {
  if (key && RESULT_ACCEPTED.has(key)) return { label: 'Onaylandı', tone: 'text-success-foreground' }
  if (key && RESULT_REJECTED.has(key)) return { label: 'Reddedildi', tone: 'text-danger-foreground' }
  return { label: 'Bekliyor', tone: 'text-warning-foreground' }
}
function SentQuotesSection() {
  const nav = useNavigate()
  const { data, isLoading } = useAllQuotes()
  const rows = useMemo(() => {
    const sent = (data ?? []).filter((q) => q.sent_at)
    return sent.sort((a, b) => new Date(b.sent_at!).getTime() - new Date(a.sent_at!).getTime()).slice(0, 12)
  }, [data]) as QuoteListRow[]
  return (
    <Section icon={FileText} title="Teklif iletildi" count={rows.length} loading={isLoading} empty="Henüz iletilmiş teklif yok.">
      {rows.map((q) => {
        const res = quoteResult(q.status_key)
        return (
          <div key={q.id} role="button" tabIndex={0} onClick={() => nav(`/talepler/${q.operation_id}`)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && nav(`/talepler/${q.operation_id}`)}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted/50">
            <span className="text-foreground min-w-0 flex-1 truncate font-medium">{q.customer_name ?? '—'}</span>
            <span className="text-text-muted shrink-0 text-xs">iletildi {fmt(q.sent_at)}</span>
            <span className={cn('shrink-0 text-xs font-medium', res.tone)}>{res.label}</span>
          </div>
        )
      })}
    </Section>
  )
}

// ④ Numuneler ───────────────────────────────────────────────────────────
// Numunelerde ayrı "termin" alanı yok; son hareket (received/shipped/created) gösterilir.
function SamplesSection() {
  const nav = useNavigate()
  const { data, isLoading } = useAllSamples()
  const rows = (data ?? []).slice(0, 12) as SampleListRow[] // useAllSamples zaten created_at desc
  return (
    <Section icon={FlaskConical} title="Numuneler" count={rows.length} loading={isLoading} empty="Kayıtlı numune yok.">
      {rows.map((s) => {
        const last = s.received_at ?? s.shipped_at ?? s.created_at
        return (
          <div key={s.id} role="button" tabIndex={0} onClick={() => nav(`/talepler/${s.operation_id}`)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && nav(`/talepler/${s.operation_id}`)}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted/50">
            <span className="text-foreground min-w-0 flex-1 truncate font-medium">{s.customer_name ?? '—'}</span>
            {s.status_label && <span className="bg-muted text-text-secondary shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium">{s.status_label}</span>}
            <span className="text-text-muted shrink-0 text-xs">güncelleme {fmt(last)}</span>
          </div>
        )
      })}
    </Section>
  )
}

// ⑤ Siparişler ──────────────────────────────────────────────────────────
function OrdersSection({ nowMs }: { nowMs: number }) {
  const nav = useNavigate()
  const { data, isLoading } = useAllOrders()
  const rows = useMemo(() => {
    const open = (data ?? []).filter((o) => !o.actual_delivery) // teslim edilmemiş açık siparişler
    return open.sort((a, b) => {
      const ta = a.promised_delivery ? new Date(a.promised_delivery).getTime() : Infinity
      const tb = b.promised_delivery ? new Date(b.promised_delivery).getTime() : Infinity
      return ta - tb // en yakın termin üstte
    }).slice(0, 12)
  }, [data]) as OrderListRow[]
  return (
    <Section icon={Package} title="Siparişler" count={rows.length} loading={isLoading} empty="Açık sipariş yok.">
      {rows.map((o) => {
        const overdue = o.promised_delivery ? new Date(o.promised_delivery).getTime() < nowMs : false
        return (
          <div key={o.id} role="button" tabIndex={0} onClick={() => nav(`/talepler/${o.operation_id}`)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && nav(`/talepler/${o.operation_id}`)}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted/50">
            <span className="text-foreground min-w-0 flex-1 truncate font-medium">{o.customer_name ?? '—'}</span>
            {o.status_label && <span className="bg-muted text-text-secondary shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium">{o.status_label}</span>}
            <span className={cn('shrink-0 text-xs tabular-nums', overdue ? 'text-danger-foreground font-medium' : 'text-text-secondary')}>
              termin {fmt(o.promised_delivery)}{overdue ? ' · geçti' : ''}
            </span>
          </div>
        )
      })}
    </Section>
  )
}

// ⑥ Hatırlatıcılar — tarihi gelmiş/geçmiş açık görevler; gecikmiş kırmızı & üstte
function RemindersSection({ nowMs }: { nowMs: number }) {
  const nav = useNavigate()
  const { data, isLoading } = useTaskList({ view: 'today' }) // due <= bugün sonu, tamamlanmamış (gecikmişler dahil)
  const statuses = useTaskStatuses()
  const upd = useUpdateTask()
  const doneId = statuses.data?.find((s) => s.key === 'tamamlandi')?.id
  const rows = useMemo(() => {
    return [...(data ?? [])].sort((a, b) => {
      const ta = a.due_at ? new Date(a.due_at).getTime() : Infinity
      const tb = b.due_at ? new Date(b.due_at).getTime() : Infinity
      return ta - tb // en erken (en gecikmiş) üstte
    }).slice(0, 15)
  }, [data]) as TaskRow[]
  async function complete(t: TaskRow) {
    if (!doneId) return
    try { await upd.mutateAsync({ id: t.id, status_id: doneId }); toast.success('Görev tamamlandı.') }
    catch (e) { toast.error(await toUserMessage(e)) }
  }
  return (
    <Section icon={BellRing} title="Hatırlatıcılar" count={rows.length} loading={isLoading} empty="Bugün için hatırlatıcı yok.">
      {rows.map((t) => {
        const overdue = t.due_at ? new Date(t.due_at).getTime() < nowMs : false
        const go = () => (t.entity_type === 'operation' && t.entity_id ? nav(`/talepler/${t.entity_id}`) : nav('/gorevler'))
        return (
          <div key={t.id}
            className={cn('flex items-center gap-2 rounded-md border border-l-4 bg-card px-3 py-2 text-sm',
              overdue ? 'border-l-danger-foreground border-danger-foreground/20' : 'border-l-border border-border')}>
            <button type="button" title="Tamamla" onClick={() => void complete(t)} disabled={upd.isPending}
              className="text-text-muted hover:text-success-foreground shrink-0">
              {upd.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            </button>
            <button type="button" onClick={go} className="min-w-0 flex-1 truncate text-left text-foreground hover:underline">
              {t.title}
              {t.source === 'otomatik' && <span className="text-text-muted ml-1.5 text-[11px]">otomatik</span>}
            </button>
            <span className={cn('shrink-0 text-xs tabular-nums', overdue ? 'text-danger-foreground flex items-center gap-0.5 font-medium' : 'text-text-secondary')}>
              {overdue && <AlertTriangle className="size-3" />}{fmt(t.due_at)}
            </span>
          </div>
        )
      })}
    </Section>
  )
}

/** P7 — Gösterge Paneli. "Bugün durum ne?" tek ekranda: 5 sayı + 5 açık liste.
 *  Grafik yok; yalnız liste ve sayı. Varsayılan dönem BUGÜN. reports.view olan
 *  kullanıcıya, kişisel çalışma bloklarının ÜSTÜNDE görünür (bkz. DashboardPage). */
export function TodayBoard() {
  const [nowMs] = useState(() => Date.now())
  const [key, setKey] = useState<PeriodKey>('today')
  const period = useMemo(() => computeRange(key, nowMs), [key, nowMs])
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">Bugün durum ne?</h2>
        <PeriodPicker value={key} onPick={setKey} />
      </div>
      <TopCards period={period} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PendingQuotesSection nowMs={nowMs} />
        <SentQuotesSection />
        <SamplesSection />
        <OrdersSection nowMs={nowMs} />
        <RemindersSection nowMs={nowMs} />
      </div>
    </div>
  )
}
