import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, FlaskConical, Package, BellRing, HandHelping,
  Zap, Shirt, Clock, CheckCircle2, XCircle, SlidersHorizontal, Loader2, AlertTriangle, ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { toUserMessage } from '@/lib/errors'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { QuoteAcceptDialog, QuoteRejectDialog } from '@/components/operations/QuoteResultDialogs'
import { useSignedUrl } from '@/hooks/useFiles'
import {
  computeRange, type Period, type PeriodKey,
  useRequestsMetric, useQuotesMetric, useInteractionsMetric, useActiveFunnel,
  usePendingRequests, type PendingRequest,
} from '@/hooks/useMetrics'
import { useAllQuotes, useSetQuoteResult, useAdvanceStage, type QuoteListRow } from '@/hooks/useQuotes'
import { useAllSamples, useUpdateSample, useSampleStatusOptions, type SampleListRow } from '@/hooks/useSamples'
import { useAllOrders, useUpdateOrder, useOrderStatusOptions, type OrderListRow } from '@/hooks/useOrders'
import { useTaskList, useUpdateTask, useTaskStatuses, type TaskRow } from '@/hooks/useTasks'
import { Kpi } from '@/components/reports/ReportKit'

// ── Zaman + biçim yardımcıları ─────────────────────────────────────────
const HOUR = 3600e3
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '—'
/** "ne kadar süredir bekliyor" — iso'dan nowMs'e kadar geçen süre. */
function since(iso: string | null, nowMs: number): string {
  if (!iso) return '—'
  return ago(nowMs - new Date(iso).getTime())
}
/** ms süreyi "N dk/saat/gün" olarak biçimler. */
function ago(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.floor(ms / 60000))} dk`
  if (ms < 24 * HOUR) return `${Math.floor(ms / HOUR)} saat`
  return `${Math.floor(ms / (24 * HOUR))} gün`
}
/** Akış metriği rozeti: değişim oku + dönem etiketi. */
function trendSub(pct: number | null | undefined, cap: string): string {
  if (pct == null) return cap
  return `${pct >= 0 ? '↑' : '↓'} %${Math.abs(Math.round(pct))} · ${cap}`
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

// ── Ortak kabuk: bölüm (sabit yükseklik, başlık sabit, liste iç kaydırmalı) ──
// collapsible=true ise başlık tıklanır; kapalıyken yalnız başlık (h-72 kalkar).
function Section({ icon: Icon, title, count, loading, empty, children, collapsible = false, defaultOpen = true }: {
  icon: typeof FileText; title: string; count: number; loading: boolean; empty: string
  children: React.ReactNode; collapsible?: boolean; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const showBody = !collapsible || open
  const header = (
    <>
      {collapsible && <ChevronDown className={cn('text-text-muted size-4 shrink-0 transition-transform', !open && '-rotate-90')} />}
      <Icon className="text-accent-primary size-4 shrink-0" />
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {count > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-text-secondary">{count}</span>}
    </>
  )
  return (
    <section className={cn('bg-card flex flex-col rounded-lg border border-border p-4 shadow-card', showBody && 'h-72')}>
      {collapsible
        ? <button type="button" onClick={() => setOpen((v) => !v)} className="mb-2 flex shrink-0 items-center gap-2 text-left">{header}</button>
        : <div className="mb-2 flex shrink-0 items-center gap-2">{header}</div>}
      {showBody && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? <Skeleton className="h-16 w-full" /> : count === 0
            ? <p className="text-text-secondary py-3 text-sm">{empty}</p>
            : <div className="space-y-1 pr-1">{children}</div>}
        </div>
      )}
    </section>
  )
}

// ── Satır sonu durum menüsü (numune + sipariş ortak) ───────────────────
function StatusMenu({ options, currentKey, pending, onPick }: {
  options: { id: number; key: string; label: string }[]
  currentKey: string | null; pending: boolean; onPick: (id: number) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" title="Durum güncelle" disabled={pending} onClick={(e) => e.stopPropagation()}
          className="text-text-muted hover:text-accent-primary hover:bg-accent-pale shrink-0 rounded-md p-1.5 transition-colors">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <SlidersHorizontal className="size-4" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Durum güncelle</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuItem key={o.id} disabled={o.key === currentKey} onSelect={() => onPick(o.id)}>
            {o.key === currentKey && <CheckCircle2 className="text-accent-primary size-3.5" />}{o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ⓪ Aksiyon şeridi — gecikmiş HER ŞEY tek yerde, aciliyet+kazanç sırasıyla.
// Tip ağırlığı: sipariş > numune > teklif > görev (aynı ağırlıkta en çok geciken üstte).
// En fazla 5 satır; "ve N tane daha" ile açılır. 20'yi aşınca dürüst başlık.
const KIND_WEIGHT: Record<'siparis' | 'numune' | 'teklif' | 'gorev', number> = { siparis: 3, numune: 2, teklif: 1, gorev: 1 }
interface OverdueItem { key: string; kind: 'siparis' | 'teklif' | 'gorev'; label: string; sub: string; overMs: number; href: string }
const OVERDUE_ICON = { siparis: Package, teklif: HandHelping, gorev: BellRing } as const

function OverdueRow({ item, onGo }: { item: OverdueItem; onGo: () => void }) {
  const Icon = OVERDUE_ICON[item.kind]
  return (
    <div role="button" tabIndex={0} onClick={onGo}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onGo()}
      className="border-danger-foreground/15 hover:bg-danger/5 flex cursor-pointer items-center gap-2.5 rounded-md border bg-card px-3 py-2 text-sm transition-colors">
      <Icon className="text-danger-foreground size-4 shrink-0" />
      <span className="text-foreground min-w-0 flex-1 truncate font-medium">{item.label}</span>
      <span className="text-text-muted shrink-0 font-mono text-[11px]">{item.sub}</span>
      <span className="text-danger-foreground shrink-0 text-xs font-semibold tabular-nums">{ago(item.overMs)} gecikti</span>
    </div>
  )
}

function ActionStrip({ nowMs }: { nowMs: number }) {
  const nav = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const pending = usePendingRequests(50)
  const orders = useAllOrders()
  const tasks = useTaskList({ view: 'today' })
  const items = useMemo<OverdueItem[]>(() => {
    const out: OverdueItem[] = []
    for (const r of (pending.data ?? []) as PendingRequest[]) {
      if (r.sla_deadline && new Date(r.sla_deadline).getTime() < nowMs)
        out.push({ key: `p${r.operation_id}`, kind: 'teklif', label: r.customer ?? '—', sub: r.code, overMs: nowMs - new Date(r.sla_deadline).getTime(), href: `/talepler/${r.operation_id}` })
    }
    for (const o of (orders.data ?? []) as OrderListRow[]) {
      if (!o.actual_delivery && o.promised_delivery && new Date(o.promised_delivery).getTime() < nowMs)
        out.push({ key: `o${o.id}`, kind: 'siparis', label: o.customer_name ?? '—', sub: o.status_label ?? 'Sipariş', overMs: nowMs - new Date(o.promised_delivery).getTime(), href: `/talepler/${o.operation_id}` })
    }
    for (const t of (tasks.data ?? []) as TaskRow[]) {
      if (t.due_at && new Date(t.due_at).getTime() < nowMs)
        out.push({ key: `t${t.id}`, kind: 'gorev', label: t.title, sub: 'Görev', overMs: nowMs - new Date(t.due_at).getTime(), href: t.entity_type === 'operation' && t.entity_id ? `/talepler/${t.entity_id}` : '/gorevler' })
    }
    out.sort((a, b) => KIND_WEIGHT[b.kind] - KIND_WEIGHT[a.kind] || b.overMs - a.overMs)
    return out
  }, [pending.data, orders.data, tasks.data, nowMs])

  if (pending.isLoading || orders.isLoading || tasks.isLoading) return <Skeleton className="h-28 w-full rounded-lg" />

  const total = items.length
  if (total === 0) return (
    <div className="border-success-foreground/30 bg-success/10 flex items-center gap-2 rounded-lg border p-4 text-sm">
      <CheckCircle2 className="text-success-foreground size-5 shrink-0" />
      <span className="text-foreground font-medium">Bugün geciken iş yok. Her şey yolunda.</span>
    </div>
  )
  const shown = expanded ? items : items.slice(0, 5)
  const heading = total > 20 ? `${total} iş gecikti — en acil 5'i:` : `${total} iş gecikti — en acilinden başla`
  return (
    <section className="border-danger-foreground/25 border-l-danger-foreground bg-danger/5 rounded-lg border border-l-4 p-4 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle className="text-danger-foreground size-5 shrink-0" />
        <h2 className="text-danger-foreground text-sm font-semibold">{heading}</h2>
      </div>
      <div className="space-y-1">
        {shown.map((it) => <OverdueRow key={it.key} item={it} onGo={() => nav(it.href)} />)}
      </div>
      {total > 5 && (
        <button type="button" onClick={() => setExpanded((v) => !v)}
          className="text-accent-primary mt-2 text-xs font-medium hover:underline">
          {expanded ? 'daha az göster' : `ve ${total - 5} tane daha →`}
        </button>
      )}
    </section>
  )
}

// ① Metrik şeridi — 3 akış (döneme bağlı, trend oku) + 2 anlık durum, tek sıra Kpi.
function MetricStrip({ period }: { period: Period }) {
  const nav = useNavigate()
  const req = useRequestsMetric(period)
  const quo = useQuotesMetric(period)
  const inter = useInteractionsMetric(period)
  const act = useActiveFunnel()
  const cap = period.label.toLocaleLowerCase('tr-TR')
  const num = (v: number | undefined) => (v == null ? '—' : String(v))
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Kpi label="Gelen talep" value={num(req.data?.total)} sub={trendSub(req.data?.change_pct, cap)} onClick={() => nav('/talepler')} />
      <Kpi label="Verilen teklif" value={num(quo.data?.sent)} sub={trendSub(quo.data?.change_pct, cap)} onClick={() => nav('/teklifler')} />
      <Kpi label="Girilen aksiyon" value={num(inter.data?.total)} sub={trendSub(inter.data?.change_pct, cap)} onClick={() => nav('/raporlar?rapor=etkilesim')} />
      <Kpi label="Numunede" value={num(act.data?.samples)} sub="şu an açık" onClick={() => nav('/numuneler')} />
      <Kpi label="Siparişte" value={num(act.data?.orders)} sub="şu an açık" onClick={() => nav('/siparisler')} />
    </div>
  )
}

// ② Teklif bekliyor ─────────────────────────────────────────────────────
function Thumb({ path }: { path: string | null | undefined }) {
  const [noTx, setNoTx] = useState(false)
  const url = useSignedUrl(path ? { bucket: 'documents', storage_path: path } : null, path && !noTx ? { width: 112, resize: 'contain' } : undefined)
  if (!path) return <div className="bg-muted text-text-muted flex size-11 shrink-0 items-center justify-center rounded-md"><Shirt className="size-4" /></div>
  return url.data
    ? <img src={url.data} alt="" className="size-11 shrink-0 rounded-md bg-muted object-contain" loading="lazy" decoding="async" onError={() => { if (!noTx) setNoTx(true) }} />
    : <div className="size-11 shrink-0 animate-pulse rounded-md bg-muted" />
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
  const setResult = useSetQuoteResult()
  const advance = useAdvanceStage()
  const [acceptFor, setAcceptFor] = useState<QuoteListRow | null>(null)
  const [rejectFor, setRejectFor] = useState<QuoteListRow | null>(null)
  const rows = useMemo(() => {
    const sent = (data ?? []).filter((q) => q.sent_at)
    return sent.sort((a, b) => new Date(b.sent_at!).getTime() - new Date(a.sent_at!).getTime()).slice(0, 12)
  }, [data]) as QuoteListRow[]
  const busy = setResult.isPending || advance.isPending
  return (
    <Section icon={FileText} title="Teklif iletildi" count={rows.length} loading={isLoading} empty="Henüz iletilmiş teklif yok." collapsible defaultOpen={false}>
      {rows.map((q) => {
        const res = quoteResult(q.status_key)
        const closed = RESULT_ACCEPTED.has(q.status_key ?? '') || RESULT_REJECTED.has(q.status_key ?? '')
        return (
          <div key={q.id} role="button" tabIndex={0} onClick={() => nav(`/talepler/${q.operation_id}`)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && nav(`/talepler/${q.operation_id}`)}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted/50">
            <span className="text-foreground min-w-0 flex-1 truncate font-medium">{q.customer_name ?? '—'}</span>
            <span className="text-text-muted shrink-0 text-xs">iletildi {fmt(q.sent_at)}</span>
            <span className={cn('shrink-0 text-xs font-medium', res.tone)}>{res.label}</span>
            {!closed && (
              <span className="flex shrink-0 items-center gap-0.5">
                <button type="button" title="Onaylandı işaretle" disabled={busy}
                  onClick={(e) => { e.stopPropagation(); setAcceptFor(q) }}
                  className="text-text-muted hover:text-success-foreground hover:bg-success/10 rounded-md p-1 transition-colors">
                  <CheckCircle2 className="size-4" />
                </button>
                <button type="button" title="Reddedildi işaretle" disabled={busy}
                  onClick={(e) => { e.stopPropagation(); setRejectFor(q) }}
                  className="text-text-muted hover:text-danger-foreground hover:bg-danger/10 rounded-md p-1 transition-colors">
                  <XCircle className="size-4" />
                </button>
              </span>
            )}
          </div>
        )
      })}
      {acceptFor && <QuoteAcceptDialog onClose={() => setAcceptFor(null)} onAccept={async (choice) => {
        const q = acceptFor; setAcceptFor(null)
        try {
          await setResult.mutateAsync({ id: q.id, operationId: q.operation_id, statusKey: 'kabul_edildi' })
          if (choice === 'mark') { toast.success('Teklif kabul edildi olarak işaretlendi.') }
          else { await advance.mutateAsync({ operationId: q.operation_id, stageKey: choice }); toast.success(`Teklif kabul edildi — aşama: ${choice === 'numune' ? 'Numune' : 'Sipariş'}.`) }
        } catch (err) { toast.error(await toUserMessage(err)) }
      }} />}
      {rejectFor && <QuoteRejectDialog onClose={() => setRejectFor(null)} onReject={async (reasonId, note) => {
        const q = rejectFor; setRejectFor(null)
        try { await setResult.mutateAsync({ id: q.id, operationId: q.operation_id, statusKey: 'reddedildi', rejectionReasonId: reasonId, rejectionNote: note || null }); toast.success('Teklif reddedildi olarak işaretlendi.') }
        catch (err) { toast.error(await toUserMessage(err)) }
      }} />}
    </Section>
  )
}

// ④ Numuneler ───────────────────────────────────────────────────────────
// Numunelerde ayrı "termin" alanı yok; son hareket (received/shipped/created) gösterilir.
function SamplesSection() {
  const nav = useNavigate()
  const { data, isLoading } = useAllSamples()
  const statusOpts = useSampleStatusOptions()
  const upd = useUpdateSample()
  const rows = (data ?? []).slice(0, 12) as SampleListRow[] // useAllSamples zaten created_at desc
  const opts = (statusOpts.data ?? []).map((o) => ({ id: o.id, key: o.key, label: o.label }))
  async function setStatus(s: SampleListRow, statusId: number) {
    try { await upd.mutateAsync({ id: s.id, operationId: s.operation_id, status_id: statusId }); toast.success('Numune durumu güncellendi.') }
    catch (e) { toast.error(await toUserMessage(e)) }
  }
  return (
    <Section icon={FlaskConical} title="Numuneler" count={rows.length} loading={isLoading} empty="Kayıtlı numune yok." collapsible>
      {rows.map((s) => {
        const last = s.received_at ?? s.shipped_at ?? s.created_at
        return (
          <div key={s.id} role="button" tabIndex={0} onClick={() => nav(`/talepler/${s.operation_id}`)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && nav(`/talepler/${s.operation_id}`)}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted/50">
            <span className="text-foreground min-w-0 flex-1 truncate font-medium">{s.customer_name ?? '—'}</span>
            {s.status_label && <span className="bg-muted text-text-secondary shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium">{s.status_label}</span>}
            <span className="text-text-muted shrink-0 text-xs">güncelleme {fmt(last)}</span>
            <StatusMenu options={opts} currentKey={s.status_key} pending={upd.isPending} onPick={(id) => void setStatus(s, id)} />
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
  const statusOpts = useOrderStatusOptions()
  const upd = useUpdateOrder()
  const rows = useMemo(() => {
    const open = (data ?? []).filter((o) => !o.actual_delivery) // teslim edilmemiş açık siparişler
    return open.sort((a, b) => {
      const ta = a.promised_delivery ? new Date(a.promised_delivery).getTime() : Infinity
      const tb = b.promised_delivery ? new Date(b.promised_delivery).getTime() : Infinity
      return ta - tb // en yakın termin üstte
    }).slice(0, 12)
  }, [data]) as OrderListRow[]
  const opts = (statusOpts.data ?? []).map((o) => ({ id: o.id, key: o.key, label: o.label }))
  async function setStatus(o: OrderListRow, statusId: number) {
    try { await upd.mutateAsync({ id: o.id, operationId: o.operation_id, status_id: statusId }); toast.success('Sipariş durumu güncellendi.') }
    catch (e) { toast.error(await toUserMessage(e)) }
  }
  return (
    <Section icon={Package} title="Siparişler" count={rows.length} loading={isLoading} empty="Açık sipariş yok." collapsible>
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
            <StatusMenu options={opts} currentKey={o.status_key} pending={upd.isPending} onPick={(id) => void setStatus(o, id)} />
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

/** P7 — Gösterge Paneli. Aciliyet sıralı: en üstte gecikmiş HER ŞEY tek şeritte
 *  (aksiyon şeridi), sonra kompakt metrik nabzı, sonra günlük aksiyon listeleri
 *  (teklif bekleyen + hatırlatıcılar), en altta katlanır takip listeleri.
 *  Varsayılan dönem BUGÜN. reports.view olan kullanıcıya, kişisel çalışma
 *  bloklarının ÜSTÜNDE görünür (bkz. DashboardPage). */
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

      {/* ⓪ En üstte: müdahale gereken gecikmiş işler — kaynağı fark etmez. */}
      <ActionStrip nowMs={nowMs} />

      {/* ① Nabız: 3 akış + 2 anlık durum, tek kompakt sıra. */}
      <MetricStrip period={period} />

      {/* ② Günlük aksiyon listeleri — teklif bekleyen + hatırlatıcılar yan yana. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PendingQuotesSection nowMs={nowMs} />
        <RemindersSection nowMs={nowMs} />
      </div>

      {/* ③ Takip listeleri — günlük izlenen (numune/sipariş) açık, teklif iletildi kapalı. */}
      <div className="space-y-4">
        <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wide">Takip listeleri</h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SamplesSection />
          <OrdersSection nowMs={nowMs} />
        </div>
        <SentQuotesSection />
      </div>
    </div>
  )
}
