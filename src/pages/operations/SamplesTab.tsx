import { useState } from 'react'
import { Plus, Trash2, Shirt, Copy, Loader2, Save, Truck, Check, X, BadgeCheck } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { STATUS_TONE_CLASS, type StatusTone } from '@/lib/statuses'
import { parseDecimal } from '@/lib/money'
import { EmptyState } from '@/components/shared/EmptyState'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  useOperationSamples, useCreateSample, useReviseSample, useUpdateSample, useDeleteSample,
  useSampleStatusOptions, type Sample,
} from '@/hooks/useSamples'
import { useOperationQuotes } from '@/hooks/useQuotes'
import { useOperationDocuments } from '@/hooks/useDocuments'
import { GenerateDocButton } from './GenerateDocButton'

const APPROVAL_METHODS = [
  { value: 'whatsapp', label: 'WhatsApp fotoğrafı' }, { value: 'eposta', label: 'E-posta' },
  { value: 'fiziksel', label: 'Fiziksel teslim' }, { value: 'yuz_yuze', label: 'Yüz yüze' },
  { value: 'diger', label: 'Diğer' },
]
const methodLabel = (m: string | null) => APPROVAL_METHODS.find((x) => x.value === m)?.label ?? m ?? '—'
const toneClass = (c: string | null): string =>
  c && (['success', 'warning', 'danger', 'info', 'neutral'] as string[]).includes(c)
    ? STATUS_TONE_CLASS[c as StatusTone] : 'bg-neutral-badge text-neutral-badge-foreground'
const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export function SamplesTab({ operationId }: { operationId: number }) {
  const { data: samples, isLoading } = useOperationSamples(operationId)
  const create = useCreateSample()
  const [picked, setPicked] = useState<number | null>(null)

  const active = (samples ?? []).filter((s) => !s.deleted_at)
  const pickedValid = picked != null && samples?.some((s) => s.id === picked && !s.deleted_at)
  const selectedId = pickedValid ? picked : (active.length ? active[active.length - 1]!.id : null)

  const docs = useOperationDocuments(operationId)

  async function addSample() {
    try { const id = await create.mutateAsync({ operationId }); setPicked(id); toast.success('Numune oluşturuldu.') }
    catch (err) { toast.error(await toUserMessage(err)) }
  }

  const hasOnay = (docs.data ?? []).some((d) => d.type_key === 'siparis_onay')
  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!samples || samples.length === 0) {
    return <EmptyState icon={Shirt} title="Numune yok"
      description={hasOnay ? 'Bu operasyon için ilk numuneyi oluşturun.' : 'Numuneye geçmek için önce sipariş onay formu gerekli (sert kapı). Üretip devam edin.'}
      action={hasOnay
        ? <Button onClick={() => void addSample()} disabled={create.isPending}><Plus className="size-4" /> Numune oluştur</Button>
        : <GenerateDocButton operationId={operationId} typeKey="siparis_onay" />} />
  }

  const selected = samples.find((s) => s.id === selectedId) ?? null

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr]">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-text-muted text-xs font-medium">Numuneler</span>
          <Button size="sm" variant="outline" onClick={() => void addSample()} disabled={create.isPending}><Plus className="size-3.5" /> Yeni</Button>
        </div>
        {samples.map((s) => {
          const deleted = !!s.deleted_at
          return (
            <button key={s.id} type="button" disabled={deleted} onClick={() => setPicked(s.id)}
              className={cn('w-full rounded-lg border px-3 py-2 text-left transition-colors',
                deleted ? 'border-dashed border-border bg-muted/40 opacity-60 cursor-not-allowed'
                  : selectedId === s.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50')}>
              <div className="flex items-center justify-between gap-2">
                <span className={cn('text-sm font-medium', deleted && 'text-text-muted line-through')}>N{s.version}{deleted && ' (silindi)'}</span>
                {!deleted && s.status_label && <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', toneClass(s.status_color))}>{s.status_label}</span>}
              </div>
              {!deleted && s.approved_at && <div className="text-success-foreground mt-1 flex items-center gap-1 text-[10px]"><BadgeCheck className="size-3" /> onaylı</div>}
            </button>
          )
        })}
      </div>

      {selected ? <SampleEditor key={selected.id} sample={selected} operationId={operationId} /> : (
        <div className="text-text-muted flex items-center justify-center text-sm">Bir numune seçin.</div>
      )}
    </div>
  )
}

function SampleEditor({ sample, operationId }: { sample: Sample; operationId: number }) {
  const statuses = useSampleStatusOptions()
  const quotes = useOperationQuotes(operationId)
  const update = useUpdateSample()
  const del = useDeleteSample()
  const revise = useReviseSample()
  const [reviseOpen, setReviseOpen] = useState(false)

  const [description, setDescription] = useState(sample.description ?? '')
  const [fee, setFee] = useState(sample.fee != null ? String(sample.fee) : '')
  const [deduct, setDeduct] = useState(sample.deduct_from_order)
  const [quoteId, setQuoteId] = useState<string | null>(sample.quote_id ? String(sample.quote_id) : null)
  const [carrier, setCarrier] = useState(sample.carrier ?? '')
  const [tracking, setTracking] = useState(sample.tracking_number ?? '')
  const [targetDate, setTargetDate] = useState(sample.target_date ?? '')
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)

  const closed = statuses.data?.find((s) => s.id === sample.status_id)?.is_closed ?? false
  const statusIdByKey = (key: string) => statuses.data?.find((s) => s.key === key)?.id ?? null

  async function saveHeader() {
    try {
      await update.mutateAsync({ id: sample.id, operationId,
        description: description.trim() || null, fee: parseDecimal(fee), deduct_from_order: deduct,
        quote_id: quoteId ? Number(quoteId) : null, carrier: carrier.trim() || null, tracking_number: tracking.trim() || null,
        target_date: targetDate || null })
      toast.success('Numune kaydedildi.')
    } catch (err) { toast.error(await toUserMessage(err)) }
  }
  async function markShipped() {
    try {
      await update.mutateAsync({ id: sample.id, operationId, shipped_at: new Date().toISOString(),
        carrier: carrier.trim() || null, tracking_number: tracking.trim() || null,
        status_id: statusIdByKey('kargoda') ?? undefined })
      toast.success('Numune gönderildi olarak işaretlendi.')
    } catch (err) { toast.error(await toUserMessage(err)) }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-foreground">Numune N{sample.version}</h3>
          <span className={cn('rounded px-1.5 py-0.5 text-xs', sample.revision_round >= 3 ? 'bg-warning-badge text-warning-badge-foreground' : 'text-text-muted')}>
            {sample.revision_round}. tur{sample.revision_round >= 3 && ' ⚠'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void markShipped()} disabled={closed}><Truck className="size-3.5" /> Gönderildi</Button>
          <Button size="sm" variant="outline" onClick={() => setApproveOpen(true)} disabled={closed}><Check className="size-3.5" /> Onayla</Button>
          <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)} disabled={closed}><X className="size-3.5" /> Reddet</Button>
          <Button size="sm" variant="outline" onClick={() => setReviseOpen(true)} disabled={closed || revise.isPending}><Copy className="size-3.5" /> Revize et</Button>
        </div>
      </div>
      {sample.revision_round >= 3 && (
        <div className="border-warning/40 bg-warning/5 text-warning-foreground rounded-lg border px-3 py-2 text-sm">
          Bu numune {sample.revision_round}. turda — tekrarlayan revizyon. Süreci gözden geçirin.
        </div>
      )}

      {/* Onay özeti (kim/ne zaman/yöntem) */}
      {sample.approved_at && (
        <div className="border-success/40 bg-success/5 rounded-lg border p-3 text-sm">
          <div className="text-success-foreground flex items-center gap-1.5 font-medium"><BadgeCheck className="size-4" /> Onaylandı</div>
          <div className="text-text-secondary mt-1 grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2">
            <span>Tarih: {fmtDateTime(sample.approved_at)}</span>
            <span>Yöntem: {methodLabel(sample.approval_method)}</span>
            {sample.approval_note && <span className="sm:col-span-2">Not: {sample.approval_note}</span>}
          </div>
        </div>
      )}
      {sample.rejection_reason && !sample.approved_at && (
        <div className="border-danger/40 bg-danger/5 text-danger-foreground rounded-lg border p-3 text-sm">Red nedeni: {sample.rejection_reason}</div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-text-muted text-xs">Durum</Label>
          <SearchableSelect options={(statuses.data ?? []).map((s) => ({ value: String(s.id), label: s.label }))}
            value={sample.status_id ? String(sample.status_id) : null}
            onChange={async (v) => { if (v) { try { await update.mutateAsync({ id: sample.id, operationId, status_id: Number(v) }); toast.success('Durum güncellendi.') } catch (err) { toast.error(await toUserMessage(err)) } } }} />
        </div>
        <div className="space-y-1">
          <Label className="text-text-muted text-xs">İlgili teklif</Label>
          <SearchableSelect clearable options={(quotes.data ?? []).filter((q) => !q.deleted_at).map((q) => ({ value: String(q.id), label: `Teklif v${q.version}` }))}
            value={quoteId} onChange={setQuoteId} placeholder="—" />
        </div>
        <div className="space-y-1">
          <Label className="text-text-muted text-xs">Numune ücreti</Label>
          <Input type="text" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="—" />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={deduct} onChange={(e) => setDeduct(e.target.checked)} className="size-4" />
          <span className="text-text-secondary">Siparişten düşülecek</span>
        </label>
      </div>

      <div className="max-w-xs space-y-1">
        <Label className="text-text-muted text-xs">Numune termini</Label>
        <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        <p className="text-text-muted text-[11px]">Dolunca sesli uyarı verilir. Boş bırakılabilir.</p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Açıklama</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Numune detayı, müşteri isteği…" />
      </div>

      {/* Kargo */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-text-muted text-xs">Kargo firması</Label>
          <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="ör. Aras" />
        </div>
        <div className="space-y-1">
          <Label className="text-text-muted text-xs">Takip no</Label>
          <Input value={tracking} onChange={(e) => setTracking(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-text-muted text-xs">Gönderim</Label>
          <div className="text-text-secondary pt-2 text-sm">{fmtDateTime(sample.shipped_at)}</div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="destructive" onClick={async () => {
          if (!confirm(`Numune N${sample.version} silinsin mi?`)) return
          try { await del.mutateAsync({ id: sample.id, operationId }); toast.success('Numune silindi.') }
          catch (err) { toast.error(await toUserMessage(err)) }
        }} disabled={del.isPending}><Trash2 className="size-4" /> Sil</Button>
        <Button onClick={() => void saveHeader()} disabled={update.isPending}>
          {update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Kaydet
        </Button>
      </div>

      {approveOpen && <ApproveDialog onClose={() => setApproveOpen(false)} onApprove={async (method, note) => {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          await update.mutateAsync({ id: sample.id, operationId, approved_at: new Date().toISOString(),
            approved_by: user?.id ?? null, approval_method: method, approval_note: note || null,
            status_id: statusIdByKey('onaylandi') ?? undefined })
          toast.success('Numune onaylandı.'); setApproveOpen(false)
        } catch (err) { toast.error(await toUserMessage(err)) }
      }} />}
      {rejectOpen && <RejectDialog onClose={() => setRejectOpen(false)} onReject={async (reason) => {
        try {
          await update.mutateAsync({ id: sample.id, operationId, rejection_reason: reason || null,
            status_id: statusIdByKey('reddedildi') ?? undefined })
          toast.success('Numune reddedildi.'); setRejectOpen(false)
        } catch (err) { toast.error(await toUserMessage(err)) }
      }} />}
      {reviseOpen && <ReviseDialog onClose={() => setReviseOpen(false)} onRevise={async (reason) => {
        try {
          const round = await revise.mutateAsync({ sampleId: sample.id, operationId, reason })
          toast.success(`Revizyon başlatıldı — ${round}. tur, durum "Numune Üretimde".`); setReviseOpen(false)
        } catch (err) { toast.error(await toUserMessage(err)) }
      }} />}
    </div>
  )
}

function ReviseDialog({ onClose, onRevise }: { onClose: () => void; onRevise: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Numune revizyonu</DialogTitle>
          <DialogDescription>Aynı numune kaydında yeni tur başlar (sebep zorunlu); durum "Numune Üretimde"ye döner.</DialogDescription></DialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="ör. Renk tonu tutmadı, dikiş revize edilecek" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button disabled={!reason.trim()} onClick={() => reason.trim() && onRevise(reason.trim())}>Revizyonu başlat</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ApproveDialog({ onClose, onApprove }: { onClose: () => void; onApprove: (method: string, note: string) => void }) {
  const [method, setMethod] = useState('whatsapp')
  const [note, setNote] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Numune onayı</DialogTitle>
          <DialogDescription>Onayın kim/ne zaman/nasıl alındığı kaydedilir. Onay tarihi ve kullanıcı otomatik işlenir.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Onay yöntemi</Label>
            <SearchableSelect options={APPROVAL_METHODS} value={method} onChange={(v) => setMethod(v ?? 'whatsapp')} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Açıklama</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="ör. Müşteri WhatsApp'tan fotoğrafı onayladı" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button onClick={() => onApprove(method, note)}><Check className="size-4" /> Onayla</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RejectDialog({ onClose, onReject }: { onClose: () => void; onReject: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Numune reddedildi</DialogTitle>
          <DialogDescription>Red nedenini yazın — revizyona ışık tutar.</DialogDescription></DialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="ör. Renk tonu tutmadı, dikiş kalitesi yetersiz" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button variant="destructive" onClick={() => onReject(reason)}>Reddedildi işaretle</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
