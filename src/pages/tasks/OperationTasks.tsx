import { useState } from 'react'
import { Plus, Sparkles, Check, X, ListTodo } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/EmptyState'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/money'
import { toUserMessage } from '@/lib/errors'
import { STATUS_TONE_CLASS, type StatusTone } from '@/lib/statuses'
import {
  useTaskList, useOperationSuggestions, useAcceptSuggestion, useDismissSuggestion, type Suggestion,
} from '@/hooks/useTasks'
import { QuickAdd } from './TasksPage'
import { TaskDialog } from './TaskDialog'

const tone = (c: string | null): string => c && (['success', 'warning', 'danger', 'info', 'neutral'] as string[]).includes(c)
  ? STATUS_TONE_CLASS[c as StatusTone] : 'bg-neutral-badge text-neutral-badge-foreground'
const EVENT_LABEL: Record<string, string> = {
  yeni_talep: 'Yeni talep', teklif_gonderildi: 'Teklif gönderildi', numune_gonderildi: 'Numune gönderildi',
  teslim_yaklasiyor: 'Teslim yaklaşıyor', uzun_islemsiz: 'Uzun süredir işlemsiz', siparis_uretimde: 'Üretime geçti',
}

/** P6.2/P6.3/P6.4 — Operasyon kartı Görevler sekmesi: öneriler + bağlı görevler + hızlı ekle. */
export function OperationTasks({ operationId }: { operationId: number }) {
  const tasks = useTaskList({ view: 'all', entityType: 'operation', entityId: operationId })
  const [quickOpen, setQuickOpen] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const rows = tasks.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Görevler</h3>
        <Button size="sm" onClick={() => setQuickOpen(true)}><Plus className="size-4" /> Görev ekle</Button>
      </div>

      <SuggestionsBand operationId={operationId} />

      {rows.length === 0 ? <EmptyState icon={ListTodo} title="Görev yok" description="Bu operasyona bağlı görev yok." /> : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t border-border first:border-t-0 hover:bg-muted/30" onClick={() => setOpenId(r.id)}>
                  <td className="px-3 py-2 font-medium">{r.title}</td>
                  <td className="px-3 py-2">{r.status_label && <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', tone(r.status_color))}>{r.status_label}</span>}</td>
                  <td className="px-3 py-2 text-text-secondary">{r.assignee_name ?? '—'}</td>
                  <td className="px-3 py-2 text-text-secondary">{r.due_at ? formatDate(r.due_at) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {quickOpen && <QuickAdd entityType="operation" entityId={operationId} onClose={() => setQuickOpen(false)} onCreated={(id) => { setQuickOpen(false); setOpenId(id); void tasks.refetch() }} />}
      {openId != null && <TaskDialog taskId={openId} onClose={() => { setOpenId(null); void tasks.refetch() }} />}
    </div>
  )
}

/** Öneri bandı (P6.3/P6.4) — KURAL tabanlı (YZ değil). Öneri; kabul/red. Reddedilen tekrar gelmez. */
function SuggestionsBand({ operationId }: { operationId: number }) {
  const { data } = useOperationSuggestions(operationId)
  const accept = useAcceptSuggestion()
  const dismiss = useDismissSuggestion()
  if (!data || data.length === 0) return null

  async function onAccept(s: Suggestion) {
    try { await accept.mutateAsync({ operationId, s, title: s.title, assigned_to: s.resolved_assignee, priority_id: s.priority_id }); toast.success('Görev oluşturuldu.') }
    catch (e) { toast.error(await toUserMessage(e)) }
  }
  async function onReject(s: Suggestion) {
    try { await dismiss.mutateAsync({ operationId, s }); toast.success('Öneri reddedildi.') } catch (e) { toast.error(await toUserMessage(e)) }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-text-secondary"><Sparkles className="size-3.5" /> Önerilen görevler</div>
      <div className="space-y-2">
        {data.map((s) => (
          <div key={`${s.kind}-${s.ref_id}`} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm font-medium">{s.title}</div>
              <div className="text-[11px] text-text-muted">Gerekçe: {s.workflow_name ? `${s.workflow_name} akışı` : EVENT_LABEL[s.trigger_event] ?? s.trigger_event}</div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="outline" className="h-7" disabled={accept.isPending} onClick={() => void onAccept(s)}><Check className="size-3.5" /> Kabul</Button>
              <Button size="sm" variant="ghost" className="h-7 text-text-muted" disabled={dismiss.isPending} onClick={() => void onReject(s)}><X className="size-3.5" /> Reddet</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
