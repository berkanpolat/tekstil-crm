import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, AlertTriangle, Link2, History } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { DatePicker } from '@/components/shared/DatePicker'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/money'
import { toUserMessage } from '@/lib/errors'
import { NotesPanel } from '@/components/notes/NotesPanel'
import { FilesPanel } from '@/components/files/FilesPanel'
import { useAssigneeOptions } from '@/hooks/useLeads'
import {
  useTask, useTaskStatuses, useTaskPriorities, useUpdateTask, useDeleteTask,
  useTaskBlocking, useTaskDependencies, useSetDependency, useTaskAssignments, useTaskList,
} from '@/hooks/useTasks'
import { WorkloadHint } from './TasksPage'

const entLink = (t: string | null, id: number | null) => t === 'operation' ? `/talepler/${id}` : t === 'customer' ? `/musteriler/${id}` : t === 'lead' ? `/potansiyeller/${id}` : null

/** P6.2 — Görev kartı (detay/düzenle): durum/öncelik/sorumlu/tarih + bağımlılık (yumuşak kapı) +
 *  sorumluluk geçmişi + not/dosya. Alt görev hiyerarşisi yok (düz liste kararı). */
export function TaskDialog({ taskId, onClose }: { taskId: number; onClose: () => void }) {
  const { data: t, isLoading } = useTask(taskId)
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        {isLoading || !t ? <Skeleton className="h-64 w-full" /> : <TaskInner key={t.id} t={t} taskId={taskId} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

/** İç gövde — t yüklendiğinde monte olur; form alanları useState başlatıcısıyla (efektsiz). */
function TaskInner({ t, taskId, onClose }: { t: NonNullable<ReturnType<typeof useTask>['data']>; taskId: number; onClose: () => void }) {
  const statuses = useTaskStatuses()
  const priorities = useTaskPriorities()
  const assignees = useAssigneeOptions()
  const update = useUpdateTask()
  const del = useDeleteTask()
  const blocking = useTaskBlocking(taskId)

  const [title, setTitle] = useState(t.title)
  const [desc, setDesc] = useState(t.description ?? '')
  const [dirty, setDirty] = useState(false)

  async function patch(p: Record<string, unknown>) {
    try { await update.mutateAsync({ id: taskId, ...p }) } catch (e) { toast.error(await toUserMessage(e)) }
  }
  // Yumuşak kapı: tamamlanmamış bağımlılık varken 'başlandı'ya geçişte uyar (engelleme yok).
  async function changeStatus(id: string | null) {
    if (!id) return
    const key = statuses.data?.find((s) => s.id === Number(id))?.key
    const blk = blocking.data ?? []
    if ((key === 'baslandi' || key === 'devam_ediyor') && blk.length > 0) {
      if (!window.confirm(`Bu görev ${blk.length} tamamlanmamış işi bekliyor:\n- ${blk.map((b) => b.title).join('\n- ')}\n\nYine de başlatılsın mı?`)) return
    }
    await patch({ status_id: Number(id) })
  }

  return (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true) }}
                  onBlur={() => dirty && void patch({ title: title.trim() || t.title })} className="text-base font-semibold" />
              </DialogTitle>
            </DialogHeader>

            {blocking.data && blocking.data.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-warning bg-warning-badge/40 p-2.5 text-xs">
                <AlertTriangle className="size-4 shrink-0 text-warning-foreground" />
                <div><b>Bekliyor:</b> {blocking.data.map((b) => b.title).join(', ')} tamamlanmadan başlanmamalı (yumuşak kapı).</div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Durum</Label>
                <SearchableSelect className="mt-1" options={(statuses.data ?? []).map((s) => ({ value: String(s.id), label: s.label }))} value={t.status_id ? String(t.status_id) : null} onChange={(v) => void changeStatus(v)} /></div>
              <div><Label className="text-xs">Öncelik</Label>
                <SearchableSelect className="mt-1" clearable options={(priorities.data ?? []).map((p) => ({ value: String(p.id), label: p.label }))} value={t.priority_id ? String(t.priority_id) : null} onChange={(v) => void patch({ priority_id: v ? Number(v) : null })} /></div>
              <div><Label className="text-xs">Sorumlu</Label>
                <SearchableSelect className="mt-1" clearable options={(assignees.data ?? []).map((u) => ({ value: u.id, label: u.full_name }))} value={t.assigned_to} onChange={(v) => void patch({ assigned_to: v })} />
                {t.assigned_to && <WorkloadHint userId={t.assigned_to} />}</div>
              <div><Label className="text-xs">Son tarih</Label>
                <DatePicker className="mt-1 w-full" clearable value={t.due_at ? t.due_at.slice(0, 10) : null} onChange={(v) => void patch({ due_at: v ? new Date(v + 'T17:00:00').toISOString() : null })} /></div>
            </div>

            <div><Label className="text-xs">Açıklama</Label>
              <Textarea className="mt-1" rows={3} value={desc} onChange={(e) => { setDesc(e.target.value); setDirty(true) }} onBlur={() => dirty && void patch({ description: desc.trim() || null })} /></div>

            {t.entity_type && entLink(t.entity_type, t.entity_id) && (
              <Link to={entLink(t.entity_type, t.entity_id)!} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                <Link2 className="size-3.5" /> İlgili {t.entity_type === 'operation' ? 'talep' : t.entity_type === 'customer' ? 'müşteri' : 'potansiyel'} #{t.entity_id}
              </Link>
            )}

            <DependencySection taskId={taskId} />
            <AssignmentHistory taskId={taskId} />

            <div className="grid gap-4 sm:grid-cols-2">
              <NotesPanel entityType="task" entityId={taskId} />
              <FilesPanel entityType="task" entityId={taskId} />
            </div>

            <div className="flex justify-between border-t border-border pt-3">
              <Button variant="ghost" className="text-destructive" disabled={del.isPending}
                onClick={async () => { if (!confirm('Görev silinsin mi?')) return; try { await del.mutateAsync(taskId); toast.success('Silindi.'); onClose() } catch (e) { toast.error(await toUserMessage(e)) } }}>
                <Trash2 className="size-4" /> Sil
              </Button>
              <Button variant="outline" onClick={onClose}>Kapat</Button>
            </div>
          </>
  )
}

function DependencySection({ taskId }: { taskId: number }) {
  const deps = useTaskDependencies(taskId)
  const setDep = useSetDependency()
  const [adding, setAdding] = useState(false)
  const [pick, setPick] = useState<string | null>(null)
  const all = useTaskList({ view: 'all' })
  const opts = (all.data ?? []).filter((x) => x.id !== taskId && !(deps.data ?? []).some((d) => d.depends_on_task_id === x.id)).map((x) => ({ value: String(x.id), label: x.title }))

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-text-secondary">Bağımlılıklar (neyi bekliyor)</span>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setAdding((v) => !v)}>{adding ? 'Kapat' : '+ Bağımlılık'}</Button>
      </div>
      {adding && (
        <div className="mb-2 flex gap-2">
          <SearchableSelect className="flex-1" options={opts} value={pick} onChange={setPick} placeholder="Bağımlı olduğu görev" searchPlaceholder="Görev ara…" />
          <Button size="sm" disabled={!pick || setDep.isPending} onClick={async () => { if (!pick) return; try { await setDep.mutateAsync({ taskId, dependsOn: Number(pick) }); setPick(null); setAdding(false) } catch (e) { toast.error(await toUserMessage(e)) } }}>Ekle</Button>
        </div>
      )}
      {(deps.data ?? []).length === 0 ? <p className="text-xs text-text-muted">Bağımlılık yok.</p> : (
        <ul className="space-y-1">
          {(deps.data ?? []).map((d) => (
            <li key={d.id} className="flex items-center justify-between text-sm">
              <span>{(d.dep as { title?: string } | null)?.title ?? `#${d.depends_on_task_id}`}</span>
              <button className="text-text-muted hover:text-destructive" onClick={() => void setDep.mutateAsync({ taskId, dependsOn: d.depends_on_task_id, remove: true })}><Trash2 className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AssignmentHistory({ taskId }: { taskId: number }) {
  const { data } = useTaskAssignments(taskId)
  if (!data || data.length === 0) return null
  return (
    <details className="rounded-md border border-border p-3">
      <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-text-secondary"><History className="size-3.5" /> Sorumluluk geçmişi ({data.length})</summary>
      <ul className="mt-2 space-y-1 text-xs text-text-secondary">
        {data.map((a) => (
          <li key={a.id} className={cn(!a.unassigned_at && 'font-medium text-foreground')}>
            {(a.who as { full_name?: string } | null)?.full_name ?? '—'} · {formatDate(a.assigned_at)}{a.unassigned_at ? ` → ${formatDate(a.unassigned_at)}` : ' (güncel)'}
            {(a.by as { full_name?: string } | null)?.full_name ? ` · atayan: ${(a.by as { full_name?: string }).full_name}` : ''}
          </li>
        ))}
      </ul>
    </details>
  )
}
