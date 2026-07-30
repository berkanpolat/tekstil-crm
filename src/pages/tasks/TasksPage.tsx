import { useState } from 'react'
import { ListTodo, Plus, LayoutGrid, List as ListIcon, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { DatePicker } from '@/components/shared/DatePicker'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/money'
import { toUserMessage } from '@/lib/errors'
import { STATUS_TONE_CLASS, type StatusTone } from '@/lib/statuses'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useAssigneeOptions } from '@/hooks/useLeads'
import {
  useTaskList, useTaskStatuses, useTaskPriorities, useCreateTask, useUpdateTask, useUserWorkload,
  type TaskView, type TaskFilters, type TaskRow,
} from '@/hooks/useTasks'
import { TaskDialog } from './TaskDialog'

const tone = (c: string | null): string => c && (['success', 'warning', 'danger', 'info', 'neutral'] as string[]).includes(c)
  ? STATUS_TONE_CLASS[c as StatusTone] : 'bg-neutral-badge text-neutral-badge-foreground'
const VIEWS: { key: TaskView; label: string }[] = [
  { key: 'all', label: 'Tümü' }, { key: 'mine', label: 'Bana atananlar' }, { key: 'today', label: 'Bugün' },
  { key: 'week', label: 'Bu hafta' }, { key: 'overdue', label: 'Geciken' }, { key: 'created', label: 'Oluşturduklarım' },
]

/** P6.2 — Görevler: hazır görünümler + liste/pano + hızlı ekle + kart. Düz liste (alt görev hiyerarşisi yok). */
export function TasksPage() {
  const { data: me } = useCurrentUser()
  const [view, setView] = useState<TaskView>('mine')
  const [layout, setLayout] = useState<'list' | 'board'>('list')
  const [statusId, setStatusId] = useState<string | null>(null)
  const [priorityId, setPriorityId] = useState<string | null>(null)
  const [assignedTo, setAssignedTo] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [quickOpen, setQuickOpen] = useState(false)

  const statuses = useTaskStatuses()
  const priorities = useTaskPriorities()
  const assignees = useAssigneeOptions()
  const filters: TaskFilters = { view, statusId: statusId ? Number(statusId) : null, priorityId: priorityId ? Number(priorityId) : null, assignedTo, search: search || undefined }
  const { data: tasks, isLoading } = useTaskList(filters, me?.id)
  const rows = tasks ?? []

  return (
    <div className="space-y-5">
      <PageHeader title="Görevler" description="Kişisel plan ve koordinasyon. Açık dosyalardan ayrı."
        action={<Button onClick={() => setQuickOpen(true)}><Plus className="size-4" /> Yeni görev</Button>} />

      {/* Hazır görünümler */}
      <div className="flex flex-wrap gap-1.5">
        {VIEWS.map((v) => (
          <button key={v.key} type="button" onClick={() => setView(v.key)}
            className={cn('rounded-full border px-3 py-1 text-sm', view === v.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary')}>
            {v.label}
          </button>
        ))}
      </div>

      {/* Filtre + görünüm */}
      <div className="flex flex-wrap items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Başlıkta ara…" className="w-56" />
        <SearchableSelect className="w-40" clearable options={(statuses.data ?? []).map((s) => ({ value: String(s.id), label: s.label }))} value={statusId} onChange={setStatusId} placeholder="Durum" />
        <SearchableSelect className="w-36" clearable options={(priorities.data ?? []).map((p) => ({ value: String(p.id), label: p.label }))} value={priorityId} onChange={setPriorityId} placeholder="Öncelik" />
        <SearchableSelect className="w-44" clearable options={(assignees.data ?? []).map((u) => ({ value: u.id, label: u.full_name }))} value={assignedTo} onChange={setAssignedTo} placeholder="Sorumlu" />
        <div className="ml-auto inline-flex overflow-hidden rounded-md border border-border">
          <button type="button" onClick={() => setLayout('list')} className={cn('px-2.5 py-1.5', layout === 'list' ? 'bg-primary text-primary-foreground' : 'bg-background')} title="Liste"><ListIcon className="size-4" /></button>
          <button type="button" onClick={() => setLayout('board')} className={cn('px-2.5 py-1.5', layout === 'board' ? 'bg-primary text-primary-foreground' : 'bg-background')} title="Pano"><LayoutGrid className="size-4" /></button>
        </div>
      </div>

      {isLoading ? <Skeleton className="h-64 w-full" />
        : rows.length === 0 ? <EmptyState icon={ListTodo} title="Görev yok" description="Bu görünümde görev bulunmuyor. 'Yeni görev' ile ekleyin." />
        : layout === 'list' ? <TaskListView rows={rows} onOpen={setOpenId} />
        : <TaskBoard rows={rows} statuses={statuses.data ?? []} onOpen={setOpenId} />}

      {quickOpen && <QuickAdd onClose={() => setQuickOpen(false)} onCreated={(id) => { setQuickOpen(false); setOpenId(id) }} />}
      {openId != null && <TaskDialog taskId={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function PriBadge({ r }: { r: TaskRow }) {
  if (!r.priority_label) return null
  return <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', tone(r.priority_color))}>{r.priority_label}</span>
}
function DueBadge({ iso, closed }: { iso: string | null; closed: boolean }) {
  if (!iso) return null
  const overdue = !closed && new Date(iso) < new Date()
  return <span className={cn('text-xs', overdue ? 'font-medium text-danger-foreground' : 'text-text-secondary')}>{formatDate(iso)}</span>
}

function TaskListView({ rows, onOpen }: { rows: TaskRow[]; onOpen: (id: number) => void }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-text-muted"><tr>
          {['Görev', 'Durum', 'Öncelik', 'Sorumlu', 'Son tarih'].map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="cursor-pointer border-t border-border hover:bg-muted/30" onClick={() => onOpen(r.id)}>
              <td className="px-3 py-2">
                <div className="font-medium text-foreground">{r.title}</div>
                {r.entity_type && <div className="text-[11px] text-text-muted">{r.entity_type === 'operation' ? 'Talep' : r.entity_type === 'customer' ? 'Müşteri' : 'Potansiyel'} #{r.entity_id}</div>}
              </td>
              <td className="px-3 py-2">{r.status_label && <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', tone(r.status_color))}>{r.status_label}</span>}</td>
              <td className="px-3 py-2"><PriBadge r={r} /></td>
              <td className="px-3 py-2 text-text-secondary">{r.assignee_name ?? '—'}</td>
              <td className="px-3 py-2"><DueBadge iso={r.due_at} closed={r.status_closed} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Pano — durum sütunları, native HTML5 sürükle-bırak ile durum değişir (Kabul 7). */
function TaskBoard({ rows, statuses, onOpen }: { rows: TaskRow[]; statuses: { id: number; key: string; label: string; color: string | null }[]; onOpen: (id: number) => void }) {
  const update = useUpdateTask()
  const [dragId, setDragId] = useState<number | null>(null)
  const [overCol, setOverCol] = useState<number | null>(null)
  async function drop(statusId: number) {
    const id = dragId; setDragId(null); setOverCol(null)
    if (id == null) return
    const t = rows.find((r) => r.id === id)
    if (!t || t.status_id === statusId) return
    try { await update.mutateAsync({ id, status_id: statusId }) } catch (e) { toast.error(await toUserMessage(e)) }
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {statuses.map((s) => {
        const col = rows.filter((r) => r.status_id === s.id)
        return (
          <div key={s.id} onDragOver={(e) => { e.preventDefault(); setOverCol(s.id) }} onDrop={() => void drop(s.id)}
            className={cn('w-64 shrink-0 rounded-lg border p-2', overCol === s.id ? 'border-primary bg-primary/5' : 'border-border bg-muted/20')}>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', tone(s.color))}>{s.label}</span>
              <span className="text-xs text-text-muted">{col.length}</span>
            </div>
            <div className="space-y-2">
              {col.map((r) => (
                <div key={r.id} draggable onDragStart={() => setDragId(r.id)} onClick={() => onOpen(r.id)}
                  className="cursor-pointer rounded-md border border-border bg-card p-2 shadow-sm hover:shadow-card">
                  <div className="text-sm font-medium text-foreground">{r.title}</div>
                  <div className="mt-1 flex items-center justify-between">
                    <PriBadge r={r} />
                    <DueBadge iso={r.due_at} closed={r.status_closed} />
                  </div>
                  {r.assignee_name && <div className="mt-1 text-[11px] text-text-muted">{r.assignee_name}</div>}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Hızlı görev ekleme (her yerden çağrılabilir çekirdek). */
export function QuickAdd({ onClose, onCreated, entityType, entityId, defaultAssignee }:
  { onClose: () => void; onCreated: (id: number) => void; entityType?: string; entityId?: number; defaultAssignee?: string | null }) {
  const create = useCreateTask()
  const priorities = useTaskPriorities()
  const assignees = useAssigneeOptions()
  const { data: me } = useCurrentUser()
  const [title, setTitle] = useState('')
  const [assignedTo, setAssignedTo] = useState<string | null>(defaultAssignee ?? me?.id ?? null)
  const [priorityId, setPriorityId] = useState<string | null>(null)
  const [dueAt, setDueAt] = useState<string | null>(null)

  async function submit() {
    if (!title.trim()) { toast.error('Başlık girin.'); return }
    try {
      const id = await create.mutateAsync({
        title: title.trim(), assigned_to: assignedTo, priority_id: priorityId ? Number(priorityId) : null,
        due_at: dueAt ? new Date(dueAt + 'T17:00:00').toISOString() : null,
        entity_type: entityType ?? null, entity_id: entityId ?? null,
      })
      toast.success('Görev oluşturuldu.'); onCreated(id)
    } catch (e) { toast.error(await toUserMessage(e)) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-24" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Yeni görev</h3>
          <button onClick={onClose} className="text-text-muted hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="space-y-3">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void submit() }} placeholder="Görev başlığı" />
          <div className="grid grid-cols-2 gap-2">
            <SearchableSelect clearable options={(assignees.data ?? []).map((u) => ({ value: u.id, label: u.full_name }))} value={assignedTo} onChange={setAssignedTo} placeholder="Sorumlu" />
            <SearchableSelect clearable options={(priorities.data ?? []).map((p) => ({ value: String(p.id), label: p.label }))} value={priorityId} onChange={setPriorityId} placeholder="Öncelik" />
          </div>
          <DatePicker value={dueAt} onChange={setDueAt} clearable placeholder="Son tarih" className="w-full" />
          {assignedTo && <WorkloadHint userId={assignedTo} />}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button onClick={() => void submit()} disabled={create.isPending}>{create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Oluştur</Button>
        </div>
      </div>
    </div>
  )
}

/** İş yükü göstergesi (Böl. 11.7) — atama sırasında sorumlunun açık görev yükü. */
export function WorkloadHint({ userId }: { userId: string }) {
  const { data } = useUserWorkload(userId)
  if (!data) return null
  return <p className="text-xs text-text-muted">Bu kişinin <b className="text-text-secondary">{data.open_count}</b> açık görevi{data.estimated_hours > 0 ? <>, ~<b className="text-text-secondary">{data.estimated_hours}s</b> tahmini</> : ''} var.</p>
}
