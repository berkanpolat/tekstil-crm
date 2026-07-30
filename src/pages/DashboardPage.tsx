import { useNavigate } from 'react-router-dom'
import { FolderOpen, HandHelping, ListChecks, AlarmClock, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { toUserMessage } from '@/lib/errors'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useHasPermission } from '@/hooks/useCatalog'
import { ManagerBoard } from '@/components/dashboard/ManagerBoard'
import { useMyOpenFiles, useMySnoozed, usePoolRequests, type DashRow } from '@/hooks/useDashboard'
import { useClaimOperation } from '@/hooks/useOperations'
import { useTaskList, useUpdateTask, useTaskStatuses, type TaskRow } from '@/hooks/useTasks'
import { openFileLabel } from '@/hooks/useOpenFiles'

// ── Zaman + renk yardımcıları ──────────────────────────────────────────
const HOUR = 3600e3
/** Sol kenar rengi: geçmiş=kırmızı, 24 saat içinde=sarı, rahat=gri. */
function borderTone(dueIso: string | null): string {
  if (!dueIso) return 'border-l-border'
  const d = new Date(dueIso).getTime() - Date.now()
  if (d < 0) return 'border-l-danger-foreground'
  if (d < 24 * HOUR) return 'border-l-warning-foreground'
  return 'border-l-border'
}
function sinceLabel(iso: string | null): string {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * HOUR))
  if (days <= 0) { const h = Math.floor((Date.now() - new Date(iso).getTime()) / HOUR); return h <= 0 ? 'yeni' : `${h} saat açık` }
  return `${days} gün açık`
}
function remainLabel(dueIso: string | null): { txt: string; over: boolean } {
  if (!dueIso) return { txt: '', over: false }
  const diff = new Date(dueIso).getTime() - Date.now()
  const over = diff < 0
  const abs = Math.abs(diff)
  const t = abs >= 24 * HOUR ? `${Math.floor(abs / (24 * HOUR))} gün` : abs >= HOUR ? `${Math.floor(abs / HOUR)} saat` : `${Math.max(1, Math.floor(abs / 60000))} dk`
  return { txt: over ? `${t} geçti` : `${t} kaldı`, over }
}

// ── Ortak satır + kart ─────────────────────────────────────────────────
function RowItem({ row, action }: { row: DashRow; action?: React.ReactNode }) {
  const navigate = useNavigate()
  const rem = remainLabel(row.due_at)
  return (
    <div role="button" tabIndex={0} onClick={() => navigate(`/talepler/${row.operation_id}`)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/talepler/${row.operation_id}`)}
      className={cn('flex cursor-pointer items-center gap-3 border-l-4 border-y border-r border-border bg-card px-3 py-2 transition-colors hover:bg-muted/50', borderTone(row.due_at))}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{row.customer_name ?? '—'}</span>
          <span className="font-mono text-[11px] text-text-muted">{row.code}</span>
          {row.snooze_count > 0 && <span className="rounded bg-warning-badge px-1.5 py-0.5 text-[10px] font-medium text-warning-badge-foreground">{row.snooze_count}× ertelendi</span>}
        </div>
        <div className="text-text-secondary flex flex-wrap items-center gap-x-2 text-xs">
          {row.category_label && <span>{row.category_label}</span>}
          {row.file_type && <span className="text-text-muted">· {openFileLabel(row.file_type)}</span>}
          <span className="text-text-muted">· {sinceLabel(row.opened_at)}</span>
        </div>
      </div>
      {row.due_at && <span className={cn('shrink-0 text-xs font-medium', rem.over ? 'text-danger-foreground' : 'text-text-secondary')}>{rem.txt}</span>}
      {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
    </div>
  )
}

function DashCard({ icon: Icon, title, count, loading, empty, children }: {
  icon: typeof FolderOpen; title: string; count: number; loading: boolean; empty: string; children: React.ReactNode
}) {
  return (
    <section className="bg-card space-y-2 rounded-lg border border-border p-4 shadow-card">
      <div className="flex items-center gap-2">
        <Icon className="text-accent-primary size-4" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {count > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-text-secondary">{count}</span>}
      </div>
      {loading ? <Skeleton className="h-16 w-full" /> : count === 0 ? <p className="text-text-secondary py-3 text-sm">{empty}</p> : <div className="space-y-1.5">{children}</div>}
    </section>
  )
}

// ── Bloklar ────────────────────────────────────────────────────────────
function BlockMyFiles({ userId }: { userId: string }) {
  const { data, isLoading } = useMyOpenFiles(userId)
  const rows = data ?? []
  return (
    <DashCard icon={FolderOpen} title="Açık dosyalarım" count={rows.length} loading={isLoading} empty="Bekleyen işiniz yok. Güzel bir gün olsun.">
      {rows.map((r) => <RowItem key={r.key} row={r} />)}
    </DashCard>
  )
}

function BlockPool() {
  const { data, isLoading } = usePoolRequests()
  const claim = useClaimOperation()
  const rows = data ?? []
  async function onClaim(id: number) {
    try {
      const r = await claim.mutateAsync(id)
      if (r.claimed) toast.success('Talebi üstlendiniz.')
      else toast.error(`Bu talebi ${r.owner_name ?? 'başka biri'} üstlendi.`)
    } catch (e) { toast.error(await toUserMessage(e)) }
  }
  return (
    <DashCard icon={HandHelping} title="Havuzda bekleyenler" count={rows.length} loading={isLoading} empty="Havuzda sahipsiz talep yok.">
      {rows.map((r) => <RowItem key={r.key} row={r} action={
        <Button size="sm" variant="outline" className="h-7" disabled={claim.isPending} onClick={() => void onClaim(r.operation_id)}>
          <HandHelping className="size-3.5" /> Üstlen</Button>} />)}
    </DashCard>
  )
}

function BlockTasks({ userId }: { userId: string }) {
  const { data, isLoading } = useTaskList({ view: 'today' }, userId)
  const statuses = useTaskStatuses()
  const upd = useUpdateTask()
  const rows = (data ?? []) as TaskRow[]
  const doneId = statuses.data?.find((s) => s.key === 'tamamlandi')?.id
  async function complete(t: TaskRow) {
    if (!doneId) return
    try { await upd.mutateAsync({ id: t.id, status_id: doneId }); toast.success('Görev tamamlandı.') }
    catch (e) { toast.error(await toUserMessage(e)) }
  }
  return (
    <DashCard icon={ListChecks} title="Bugünkü görevlerim" count={rows.length} loading={isLoading} empty="Bugün için görev yok.">
      {rows.map((t) => {
        const rem = remainLabel(t.due_at)
        return (
          <div key={t.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
            <button type="button" title="Tamamla" onClick={() => void complete(t)} disabled={upd.isPending} className="text-text-muted hover:text-success-foreground">
              {upd.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            </button>
            <span className="min-w-0 flex-1 truncate">{t.title}</span>
            {t.due_at && <span className={cn('shrink-0 text-xs', rem.over ? 'font-medium text-danger-foreground' : 'text-text-secondary')}>{rem.txt}</span>}
          </div>
        )
      })}
    </DashCard>
  )
}

function BlockSnoozed({ userId }: { userId: string }) {
  const { data, isLoading } = useMySnoozed(userId)
  const rows = data ?? []
  return (
    <DashCard icon={AlarmClock} title="Ertelediklerim" count={rows.length} loading={isLoading} empty="Süresi dolmuş erteleme yok.">
      {rows.map((r) => <RowItem key={r.key} row={r} />)}
    </DashCard>
  )
}

/** Gösterge Paneli — çalışan katmanı (P7.2): açık dosyalarım · havuz · bugünkü görevler · ertelenenler.
 *  Yönetici katmanı (P7.3) reports.view ile üste eklenecek. Her satır tıklanır → operasyona gider. */
export function DashboardPage() {
  const { data: me } = useCurrentUser()
  const canReports = useHasPermission('reports.view')
  if (!me) return <div className="space-y-4"><PageHeader title="Gösterge Paneli" /><Skeleton className="h-64 w-full" /></div>
  return (
    <div className="space-y-6">
      <PageHeader title="Gösterge Paneli" description="Bugün neye müdahale etmelisiniz? Her satır ilgili işe götürür." />

      {canReports.data && <ManagerBoard />}

      <div className="space-y-4">
        {canReports.data && <h2 className="text-base font-semibold text-foreground">Kişisel çalışma alanım</h2>}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BlockMyFiles userId={me.id} />
          <BlockPool />
          <BlockTasks userId={me.id} />
          <BlockSnoozed userId={me.id} />
        </div>
      </div>
    </div>
  )
}
