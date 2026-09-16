import { useState } from 'react'
import { Plus, Trash2, Shirt, Copy, Loader2, Save, Truck, PackageCheck, Check, X, BadgeCheck, Lock, LockOpen } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { STATUS_TONE_CLASS, type StatusTone } from '@/lib/statuses'
import { EmptyState } from '@/components/shared/EmptyState'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { MoneyInput } from '@/components/shared/MoneyInput'
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
import { useOperationQuotes, quoteLabel } from '@/hooks/useQuotes'
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
  const [fee, setFee] = useState<number | null>(sample.fee ?? null)
  const [deduct, setDeduct] = useState(sample.deduct_from_order)
  const [quoteId, setQuoteId] = useState<string | null>(sample.quote_id ? String(sample.quote_id) : null)
  const [carrier, setCarrier] = useState(sample.carrier ?? '')
  const [tracking, setTracking] = useState(sample.tracking_number ?? '')
  const [targetDate, setTargetDate] = useState(sample.target_date ?? '')
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)

  const stDef = statuses.data?.find((s) => s.id === sample.status_id)
  const stKey = stDef?.key ?? sample.status_key
  // 3c — Kilit semantiği: numune "final" olduğunda salt-okunur. Final = onaylandı VEYA
  // kapalı bir durum (reddedildi/iptal). teslim_edildi kapalı sayılsa da akış bitmez
  // (sonrasında onay/red gelir) → final DEĞİL; buton ve alanlar açık kalır.
  const finalized = !!sample.approved_at || ((stDef?.is_closed ?? false) && stKey !== 'teslim_edildi')
  const statusIdByKey = (key: string) => statuses.data?.find((s) => s.key === key)?.id ?? null
  // Fail-loud: statü listesi yüklenmemişse (veya anahtar bulunamazsa) status_id SESSİZCE
  // düşmesin — kullanıcıya hata göster, işlemi durdur. Aksi halde yalnız shipped_at yazılıp
  // durum "Kargoda"ya geçmez ve akış tutarsız kalır.
  const resolveStatus = (key: string): number | null => {
    const id = statusIdByKey(key)
    if (id == null) toast.error(`Numune durumları henüz yüklenmedi (“${key}” bulunamadı). Sayfayı yenileyip tekrar deneyin.`)
    return id
  }
  // Final numune varsayılan olarak KİLİTLİ (salt-okunur). "Yeniden aç" ile düzenlenebilir.
  const [unlocked, setUnlocked] = useState(false)
  const locked = finalized && !unlocked

  async function saveHeader() {
    try {
      await update.mutateAsync({ id: sample.id, operationId,
        description: description.trim() || null, fee, deduct_from_order: deduct,
        quote_id: quoteId ? Number(quoteId) : null, carrier: carrier.trim() || null, tracking_number: tracking.trim() || null,
        target_date: targetDate || null })
      toast.success('Numune kaydedildi.')
    } catch (err) { toast.error(await toUserMessage(err)) }
  }
  async function markShipped() {
    const sid = resolveStatus('kargoda')
    if (sid == null) return
    try {
      await update.mutateAsync({ id: sample.id, operationId, shipped_at: new Date().toISOString(),
        carrier: carrier.trim() || null, tracking_number: tracking.trim() || null, status_id: sid })
      toast.success('Numune gönderildi olarak işaretlendi.')
    } catch (err) { toast.error(await toUserMessage(err)) }
  }
  // 3a — Teslim alındı / geri döndü: received_at + durum "teslim_edildi". Kargodaki numune
  // geri dönünce akışta karşılığı olmayan "geri dönüş alındı mı?" görevini kapatır.
  async function markReceived() {
    const sid = resolveStatus('teslim_edildi')
    if (sid == null) return
    try {
      await update.mutateAsync({ id: sample.id, operationId, received_at: new Date().toISOString(), status_id: sid })
      toast.success('Numune teslim alındı olarak işaretlendi.')
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
          {/* 3c — kilit durumu her zaman görünür */}
          <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium',
            locked ? 'bg-muted text-text-muted' : 'bg-success-badge text-success-badge-foreground')}>
            {locked ? <><Lock className="size-3" /> Kilitli</> : <><LockOpen className="size-3" /> Düzenlenebilir</>}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {finalized && (unlocked
            ? <Button size="sm" variant="outline" onClick={() => setUnlocked(false)}><Lock className="size-3.5" /> Kilitle</Button>
            : <Button size="sm" variant="outline" onClick={() => setUnlocked(true)}><LockOpen className="size-3.5" /> Yeniden aç</Button>)}
          <Button size="sm" variant="outline" onClick={() => void markShipped()} disabled={finalized}><Truck className="size-3.5" /> Gönderildi</Button>
          {sample.shipped_at && !sample.received_at && (
            <Button size="sm" variant="outline" onClick={() => void markReceived()} disabled={finalized}><PackageCheck className="size-3.5" /> Teslim alındı</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setApproveOpen(true)} disabled={finalized}><Check className="size-3.5" /> Onayla</Button>
          <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)} disabled={finalized}><X className="size-3.5" /> Reddet</Button>
          <Button size="sm" variant="outline" onClick={() => setReviseOpen(true)} disabled={finalized || revise.isPending}><Copy className="size-3.5" /> Revize et</Button>
        </div>
      </div>
      {/* 3c — kilit kuralını kullanıcıya açıkla */}
      <p className="text-text-muted -mt-3 text-xs">
        {locked
          ? 'Bu numune final (onaylı/kapalı) — salt-okunur. Düzenlemek için “Yeniden aç”.'
          : 'Numune düzenlenebilir. Onaylanınca ya da reddedilince kilitlenir (teslim alındıktan sonra hâlâ düzenlenebilir).'}
      </p>
      {sample.revision_round >= 3 && (
        <div className="border-warning/40 bg-warning/5 text-warning-foreground rounded-lg border px-3 py-2 text-sm">
          Bu numune {sample.revision_round}. turda — tekrarlayan revizyon. Süreci gözden geçirin.
        </div>
      )}

      {/* Onay özeti (kim/ne zaman/yöntem) */}
      {sample.approved_at && (
        <div className="border-success/40 bg-success/5 rounded-lg border p-3 text-sm">
          <div className="text-success-foreground flex items-center gap-1.5 font-medium">
            <BadgeCheck className="size-4" /> Onaylandı
            {locked && <span className="text-text-muted inline-flex items-center gap-1 text-xs font-normal"><Lock className="size-3" /> kilitli — düzenlemek için “Yeniden aç”</span>}
          </div>
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
          <SearchableSelect disabled={locked} options={(statuses.data ?? []).map((s) => ({ value: String(s.id), label: s.label }))}
            value={sample.status_id ? String(sample.status_id) : null}
            onChange={async (v) => { if (v) { try { await update.mutateAsync({ id: sample.id, operationId, status_id: Number(v) }); toast.success('Durum güncellendi.') } catch (err) { toast.error(await toUserMessage(err)) } } }} />
        </div>
        <div className="space-y-1">
          <Label className="text-text-muted text-xs">İlgili teklif</Label>
          <SearchableSelect clearable disabled={locked} options={(quotes.data ?? []).filter((q) => !q.deleted_at).map((q) => ({ value: String(q.id), label: `${quoteLabel(q)} · v${q.version}` }))}
            value={quoteId} onChange={setQuoteId} placeholder="—" />
        </div>
        <div className="space-y-1">
          <Label className="text-text-muted text-xs">Numune ücreti (₺)</Label>
          <MoneyInput value={fee} onValueChange={setFee} placeholder="0,00" disabled={locked} />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={deduct} onChange={(e) => setDeduct(e.target.checked)} className="size-4" disabled={locked} />
          <span className="text-text-secondary">Siparişten düşülecek</span>
        </label>
      </div>

      <div className="max-w-xs space-y-1">
        <Label className="text-text-muted text-xs">Numune termini</Label>
        <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} disabled={locked} />
        <p className="text-text-muted text-[11px]">Dolunca sesli uyarı verilir. Boş bırakılabilir.</p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Açıklama</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Numune detayı, müşteri isteği…" disabled={locked} />
      </div>

      {/* Kargo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-text-muted text-xs">Kargo firması</Label>
          <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="ör. Aras" disabled={locked} />
        </div>
        <div className="space-y-1">
          <Label className="text-text-muted text-xs">Takip no</Label>
          <Input value={tracking} onChange={(e) => setTracking(e.target.value)} disabled={locked} />
        </div>
        <div className="space-y-1">
          <Label className="text-text-muted text-xs">Gönderim</Label>
          <div className="text-text-secondary pt-2 text-sm">{fmtDateTime(sample.shipped_at)}</div>
        </div>
        <div className="space-y-1">
          <Label className="text-text-muted text-xs">Teslim / geri dönüş</Label>
          <div className="text-text-secondary pt-2 text-sm">{fmtDateTime(sample.received_at)}</div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="destructive" onClick={async () => {
          if (!confirm(`Numune N${sample.version} silinsin mi?`)) return
          try { await del.mutateAsync({ id: sample.id, operationId }); toast.success('Numune silindi.') }
          catch (err) { toast.error(await toUserMessage(err)) }
        }} disabled={del.isPending || locked}><Trash2 className="size-4" /> Sil</Button>
        <Button onClick={() => void saveHeader()} disabled={update.isPending || locked}>
          {update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Kaydet
        </Button>
      </div>

      {approveOpen && <ApproveDialog onClose={() => setApproveOpen(false)} onApprove={async (method, note) => {
        const sid = resolveStatus('onaylandi')
        if (sid == null) return
        try {
          const { data: { user } } = await supabase.auth.getUser()
          await update.mutateAsync({ id: sample.id, operationId, approved_at: new Date().toISOString(),
            approved_by: user?.id ?? null, approval_method: method, approval_note: note || null, status_id: sid })
          toast.success('Numune onaylandı.'); setApproveOpen(false)
        } catch (err) { toast.error(await toUserMessage(err)) }
      }} />}
      {rejectOpen && <RejectDialog onClose={() => setRejectOpen(false)} onReject={async (reason) => {
        const sid = resolveStatus('reddedildi')
        if (sid == null) return
        try {
          await update.mutateAsync({ id: sample.id, operationId, rejection_reason: reason || null, status_id: sid })
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
