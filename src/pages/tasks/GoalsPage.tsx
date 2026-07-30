import { useState } from 'react'
import { Target, Plus, Loader2, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { DatePicker } from '@/components/shared/DatePicker'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { formatMoney, formatDate } from '@/lib/money'
import { toUserMessage } from '@/lib/errors'
import { useAssigneeOptions } from '@/hooks/useLeads'
import { useGoals, useSaveGoal, useDeleteGoal, goalProgress, type GoalRow, type GoalInput } from '@/hooks/useGoals'

const TYPES = [
  { value: 'talep_sayisi', label: 'Talep sayısı' }, { value: 'teklif_sayisi', label: 'Teklif sayısı' },
  { value: 'siparis_sayisi', label: 'Sipariş sayısı' }, { value: 'ciro', label: 'Ciro' },
  { value: 'donusum_orani', label: 'Dönüşüm oranı (%)' }, { value: 'etkilesim_sayisi', label: 'Etkileşim sayısı' },
]
const SCOPES = [{ value: 'sirket', label: 'Şirket' }, { value: 'kisi', label: 'Kişi' }]
const PERIODS = [{ value: 'aylik', label: 'Aylık' }, { value: 'ceyreklik', label: 'Çeyreklik' }, { value: 'yillik', label: 'Yıllık' }]
const typeLabel = (t: string) => TYPES.find((x) => x.value === t)?.label ?? t
const TONE: Record<string, { bar: string; badge: string; text: string }> = {
  done: { bar: 'bg-success', badge: 'bg-success-badge text-success-badge-foreground', text: 'Tamamlandı' },
  ontrack: { bar: 'bg-info', badge: 'bg-info-badge text-info-badge-foreground', text: 'Yolunda' },
  risk: { bar: 'bg-warning', badge: 'bg-warning-badge text-warning-badge-foreground', text: 'Risk altında' },
  fail: { bar: 'bg-danger', badge: 'bg-danger-badge text-danger-badge-foreground', text: 'Gerçekleşmeyecek' },
}
const fmtVal = (g: GoalRow, v: number) => g.goal_type === 'ciro' ? formatMoney(v, g.currency ?? 'TRY') : g.goal_type === 'donusum_orani' ? `%${v}` : String(v)

/** P6.5 — Hedefler: kart görünümü, gerçekleşen (otomatik), renk kodu, ilerleme çubuğu. */
export function GoalsPage() {
  const { data, isLoading } = useGoals()
  const [formOpen, setFormOpen] = useState(false)
  const [edit, setEdit] = useState<GoalRow | null>(null)
  const del = useDeleteGoal()
  const rows = data ?? []

  return (
    <div className="space-y-5">
      <PageHeader title="Hedefler" description="Gerçekleşen otomatik hesaplanır (siparişler kur-donmuş cari hareketlerden)."
        action={<Button onClick={() => { setEdit(null); setFormOpen(true) }}><Plus className="size-4" /> Hedef ekle</Button>} />

      {isLoading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36" />)}</div>
        : rows.length === 0 ? <EmptyState icon={Target} title="Hedef yok" description="'Hedef ekle' ile başlayın." />
        : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((g) => {
              const p = goalProgress(g); const t = TONE[p.tone]!
              return (
                <div key={g.id} className={cn('rounded-lg border bg-card p-4', g.is_active ? 'border-border' : 'border-border opacity-60')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{g.name}</div>
                      <div className="text-xs text-text-muted">{typeLabel(g.goal_type)} · {g.scope === 'kisi' ? 'Kişi' : 'Şirket'} · {formatDate(g.period_start)}–{formatDate(g.period_end)}</div>
                    </div>
                    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', t.badge)}>{t.text}</span>
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div className="text-lg font-semibold tabular-nums text-foreground">{fmtVal(g, g.actual ?? 0)}</div>
                    <div className="text-xs text-text-secondary">/ {fmtVal(g, g.target_value)} · <b>%{p.pct}</b></div>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full rounded-full', t.bar)} style={{ width: `${Math.min(100, p.pct)}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] text-text-muted">Beklenen ilerleme: %{p.expectedPct} (süreye göre)</div>
                  <div className="mt-2 flex justify-end gap-1">
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => { setEdit(g); setFormOpen(true) }}><Pencil className="size-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="size-7 text-destructive" onClick={async () => { if (!confirm('Hedef silinsin mi?')) return; try { await del.mutateAsync(g.id) } catch (e) { toast.error(await toUserMessage(e)) } }}><Trash2 className="size-3.5" /></Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      {formOpen && <GoalForm goal={edit} onClose={() => setFormOpen(false)} />}
    </div>
  )
}

function GoalForm({ goal, onClose }: { goal: GoalRow | null; onClose: () => void }) {
  const save = useSaveGoal()
  const assignees = useAssigneeOptions()
  const [f, setF] = useState<GoalInput>(() => ({
    name: goal?.name ?? '', goal_type: goal?.goal_type ?? 'siparis_sayisi', scope: goal?.scope ?? 'sirket',
    scope_user_id: goal?.scope_user_id ?? null, period_type: goal?.period_type ?? 'aylik',
    period_start: goal?.period_start ?? new Date().toISOString().slice(0, 10),
    period_end: goal?.period_end ?? new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    target_value: goal?.target_value ?? 0, currency: goal?.currency ?? 'TRY', is_active: goal?.is_active ?? true,
  }))
  const up = (p: Partial<GoalInput>) => setF((s) => ({ ...s, ...p }))
  const isCiro = f.goal_type === 'ciro'

  async function submit() {
    if (!f.name.trim()) { toast.error('Ad girin.'); return }
    if (f.scope === 'kisi' && !f.scope_user_id) { toast.error('Kişi seçin.'); return }
    if (!(Number(f.target_value) > 0)) { toast.error('Hedef değeri girin.'); return }
    try {
      await save.mutateAsync({ ...f, id: goal?.id, target_value: Number(f.target_value), currency: isCiro ? (f.currency ?? 'TRY') : null,
        scope_user_id: f.scope === 'kisi' ? f.scope_user_id : null })
      toast.success('Hedef kaydedildi.'); onClose()
    } catch (e) { toast.error(await toUserMessage(e)) }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{goal ? 'Hedef düzenle' : 'Yeni hedef'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-sm">Ad</Label><Input className="mt-1" value={f.name} onChange={(e) => up({ name: e.target.value })} placeholder="ör. Temmuz sipariş hedefi" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-sm">Tür</Label><SearchableSelect className="mt-1" options={TYPES} value={f.goal_type} onChange={(v) => up({ goal_type: v || 'siparis_sayisi' })} /></div>
            <div><Label className="text-sm">Kapsam</Label><SearchableSelect className="mt-1" options={SCOPES} value={f.scope} onChange={(v) => up({ scope: v || 'sirket' })} /></div>
          </div>
          {f.scope === 'kisi' && <div><Label className="text-sm">Kişi</Label><SearchableSelect className="mt-1" options={(assignees.data ?? []).map((u) => ({ value: u.id, label: u.full_name }))} value={f.scope_user_id ?? null} onChange={(v) => up({ scope_user_id: v })} placeholder="Kişi seç" /></div>}
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-sm">Dönem</Label><SearchableSelect className="mt-1" options={PERIODS} value={f.period_type} onChange={(v) => up({ period_type: v || 'aylik' })} /></div>
            <div><Label className="text-sm">Hedef değeri</Label><Input className="mt-1" inputMode="decimal" value={String(f.target_value)} onChange={(e) => up({ target_value: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-sm">Başlangıç</Label><DatePicker className="mt-1 w-full" value={f.period_start} onChange={(v) => up({ period_start: v || f.period_start })} /></div>
            <div><Label className="text-sm">Bitiş</Label><DatePicker className="mt-1 w-full" value={f.period_end} onChange={(v) => up({ period_end: v || f.period_end })} /></div>
          </div>
          {isCiro && <div><Label className="text-sm">Para birimi</Label><SearchableSelect className="mt-1" options={[{ value: 'TRY', label: 'TRY' }, { value: 'USD', label: 'USD' }]} value={f.currency ?? 'TRY'} onChange={(v) => up({ currency: v || 'TRY' })} /></div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>{save.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Kaydet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
