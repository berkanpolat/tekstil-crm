import { useState } from 'react'
import { Clock, AlertOctagon, Timer, MoonStar, ArrowRight, History } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { toUserMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/shared/DatePicker'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useOperationOpenFiles, useSnoozeOpenFile, openFileLabel, type OpenFile } from '@/hooks/useOpenFiles'

function remaining(dueIso: string): { text: string; overdue: boolean } {
  const diff = new Date(dueIso).getTime() - Date.now()
  const abs = Math.abs(diff); const h = Math.floor(abs / 3600000); const d = Math.floor(h / 24)
  const unit = d >= 1 ? `${d} gün` : h >= 1 ? `${h} saat` : `${Math.max(1, Math.floor(abs / 60000))} dk`
  return diff < 0 ? { text: `${unit} önce doldu`, overdue: true } : { text: `${unit} kaldı`, overdue: false }
}
const fmtDate = (iso: string) => new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Operasyon kartı üst bandı (B.7): açık dosyalar + kalan süre + Ertele/Git + erteleme geçmişi. */
export function OpenFileBand({ operationId, onGoto }: { operationId: number; onGoto: (tab: 'teklif') => void }) {
  const { data } = useOperationOpenFiles(operationId)
  const [snoozeFor, setSnoozeFor] = useState<OpenFile | null>(null)
  const files = data?.files ?? []
  const snoozes = data?.snoozes ?? []
  if (!files.length) return null

  return (
    <div className="space-y-2">
      {files.map((f) => {
        const snoozed = f.snooze_until && new Date(f.snooze_until) > new Date()
        const r = remaining(f.due_at)
        const Icon = snoozed ? MoonStar : r.overdue ? AlertOctagon : Clock
        return (
          <div key={f.id} className={cn('flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2',
            snoozed ? 'border-border bg-muted/40' : r.overdue ? 'border-danger bg-danger/15' : 'border-warning/40 bg-warning/10')}>
            <Icon className={cn('size-4 shrink-0', snoozed ? 'text-text-muted' : r.overdue ? 'text-danger-foreground' : 'text-warning-foreground')} />
            <span className="text-sm font-medium">{openFileLabel(f.file_type)}</span>
            <span className={cn('text-xs', r.overdue ? 'font-medium text-danger-foreground' : 'text-text-secondary')}>
              {snoozed ? `Ertelendi → ${fmtDate(f.snooze_until!)}` : r.text}
            </span>
            {f.snooze_count > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-text-muted">{f.snooze_count}. kez ertelendi</span>
            )}
            <div className="ml-auto flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setSnoozeFor(f)}><Timer className="size-3.5" /> Ertele</Button>
              <Button size="sm" onClick={() => onGoto('teklif')}><ArrowRight className="size-3.5" /> Git</Button>
            </div>
          </div>
        )
      })}

      {snoozes.length > 0 && (
        <details className="rounded-lg border border-border px-3 py-2">
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-text-muted">
            <History className="size-3.5" /> Erteleme geçmişi ({snoozes.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {snoozes.map((s) => (
              <li key={s.id} className="text-xs text-text-secondary">
                <span className="text-text-muted">{fmtDate(s.created_at)}</span> · {s.by_name ?? 'Bilinmiyor'} →
                <span className="text-text-muted"> {fmtDate(s.snoozed_until)}</span> · {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {snoozeFor && <SnoozeDialog file={snoozeFor} operationId={operationId} onClose={() => setSnoozeFor(null)} />}
    </div>
  )
}

function SnoozeDialog({ file, operationId, onClose }: { file: OpenFile; operationId: number; onClose: () => void }) {
  const snooze = useSnoozeOpenFile()
  const [reason, setReason] = useState('')
  const [mode, setMode] = useState<'2h' | 'morning' | 'date'>('2h')
  const [date, setDate] = useState<string | null>(null)

  function computeUntil(): string | null {
    if (mode === '2h') return new Date(Date.now() + 2 * 3600000).toISOString()
    if (mode === 'morning') { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.toISOString() }
    if (mode === 'date' && date) return new Date(date + 'T09:00:00').toISOString()
    return null
  }
  const valid = reason.trim().length > 0 && (mode !== 'date' || !!date)

  async function save() {
    const until = computeUntil()
    if (!valid || !until) return
    try { await snooze.mutateAsync({ id: file.id, operationId, reason: reason.trim(), until }); toast.success('Ertelendi.'); onClose() }
    catch (err) { toast.error(await toUserMessage(err)) }
  }
  const opt = (v: typeof mode, label: string) => (
    <button type="button" onClick={() => setMode(v)}
      className={cn('rounded-md border px-3 py-1.5 text-sm', mode === v ? 'border-primary bg-primary/10 text-primary' : 'border-border')}>{label}</button>
  )
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ertele — {openFileLabel(file.file_type)}</DialogTitle>
          <DialogDescription>Sebep zorunludur. Uyarı seçtiğiniz zamana kadar susar, sonra yeniden hatırlatılır.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-sm">Sebep <span className="text-destructive">*</span></Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Örn. müşteri bütçe onayı bekliyor" className="mt-1" aria-invalid={!reason.trim()} />
            {!reason.trim() && <p className="mt-1 text-xs text-text-muted">Sebep girmeden ertelenemez.</p>}
          </div>
          <div>
            <Label className="text-sm">Ne zaman tekrar hatırlatılsın?</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {opt('2h', '2 saat sonra')}{opt('morning', 'Yarın sabah')}{opt('date', 'Belirli tarih')}
            </div>
            {mode === 'date' && <DatePicker value={date} onChange={setDate} className="mt-2 w-full" />}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button disabled={!valid || snooze.isPending} onClick={() => void save()}>Ertele</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
