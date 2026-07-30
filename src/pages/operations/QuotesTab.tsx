import { useRef, useState } from 'react'
import { FileText, Upload, Download, Trash2, Loader2, Check, X, Clock, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { STATUS_TONE_CLASS, type StatusTone } from '@/lib/statuses'
import { EmptyState } from '@/components/shared/EmptyState'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { DatePicker } from '@/components/shared/DatePicker'
import { getSignedUrl } from '@/hooks/useFiles'
import { GenerateDocButton } from './GenerateDocButton'
import {
  useOperationQuotes, useUploadQuoteFile, useSetQuoteResult, useDeleteQuote, useAdvanceStage,
  useQuoteRejectionReasonOptions, useDraftQuote, useApproveDraftQuote, type Quote, type DraftQuote,
} from '@/hooks/useQuotes'
import { formatMoney } from '@/lib/money'

const toneClass = (c: string | null): string =>
  c && (['success', 'warning', 'danger', 'info', 'neutral'] as string[]).includes(c)
    ? STATUS_TONE_CLASS[c as StatusTone] : 'bg-neutral-badge text-neutral-badge-foreground'
const fmtDT = (iso: string) => new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Teklif = dosya yükleme + sonuç takibi (Merhaba.docx 4). Belge motoru Faz 4'te. */
export function QuotesTab({ operationId }: { operationId: number }) {
  const { data: quotes, isLoading } = useOperationQuotes(operationId)
  const draft = useDraftQuote(operationId)
  const approveDraft = useApproveDraftQuote()
  const [reviewDraft, setReviewDraft] = useState(false)
  const upload = useUploadQuoteFile()
  const setResult = useSetQuoteResult()
  const del = useDeleteQuote()
  const advance = useAdvanceStage()
  const inputRef = useRef<HTMLInputElement>(null)
  const [acceptFor, setAcceptFor] = useState<Quote | null>(null)
  const [rejectFor, setRejectFor] = useState<Quote | null>(null)
  const [followFor, setFollowFor] = useState<Quote | null>(null)
  const [downloading, setDownloading] = useState<number | null>(null)

  const active = (quotes ?? []).filter((q) => !q.deleted_at)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    try { await upload.mutateAsync({ operationId, file }); toast.success('Teklif dosyası yüklendi — durum "Teklif İletildi".') }
    catch (err) { toast.error(await toUserMessage(err)) }
  }
  async function download(q: Quote) {
    if (!q.file_path) return
    setDownloading(q.id)
    try {
      const url = await getSignedUrl('documents', q.file_path, 60, q.file_name ?? undefined)
      const a = document.createElement('a'); a.href = url; a.download = q.file_name ?? 'teklif'; document.body.appendChild(a); a.click(); a.remove()
    } catch (err) { toast.error(await toUserMessage(err)) } finally { setDownloading(null) }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Teklif dosyaları</h3>
          <p className="text-text-muted text-xs">PDF/Excel yükleyin — durum otomatik "Teklif İletildi" olur. Dilerseniz sistemden fiyat teklifi belgesi de üretebilirsiniz.</p>
        </div>
        <input ref={inputRef} type="file" accept=".pdf,.xls,.xlsx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={onPick} />
        <div className="flex gap-2">
          <GenerateDocButton operationId={operationId} typeKey="fiyat_teklifi" />
          <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Dosya yükle
          </Button>
        </div>
      </div>

      {/* E.2 — Katalogdan hazırlanmış taslak teklif bandı */}
      {draft.data && (
        <div className="border-accent-primary/30 bg-accent-primary/5 flex flex-wrap items-center gap-3 rounded-lg border p-3">
          <Sparkles className="text-accent-primary size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-foreground">Katalogdan hazırlanmış taslak teklif var</div>
            <div className="text-text-secondary text-xs">
              {String((draft.data.data as { satirlar?: unknown[] })?.satirlar?.length ?? 0)} ürün
              {Number((draft.data.data as { maliyeti_eksik_urun?: number })?.maliyeti_eksik_urun ?? 0) > 0
                ? ` · ${(draft.data.data as { maliyeti_eksik_urun?: number }).maliyeti_eksik_urun} ürünün maliyeti eksik` : ''} — inceleyip onaylayın.
            </div>
          </div>
          <Button size="sm" onClick={() => setReviewDraft(true)}><Sparkles className="size-3.5" /> İncele ve onayla</Button>
        </div>
      )}
      {reviewDraft && draft.data && (
        <DraftReviewDialog draft={draft.data} pending={approveDraft.isPending} onClose={() => setReviewDraft(false)}
          onApprove={async () => {
            try { await approveDraft.mutateAsync({ documentId: draft.data!.id, operationId }); toast.success('Taslak onaylandı — gerçek teklif oluştu, durum ilerledi.'); setReviewDraft(false) }
            catch (err) { toast.error(await toUserMessage(err)) }
          }} />
      )}

      {isLoading ? <Skeleton className="h-32 w-full" /> : active.length === 0 && !draft.data ? (
        <EmptyState icon={FileText} title="Teklif yok" description="İlk teklif dosyasını yükleyin. Yükleyince talep durumu ilerler." />
      ) : active.length === 0 ? null : (
        <ul className="space-y-2">
          {active.map((q) => {
            // Sonuç kesinleşince (kabul/red/olumsuz/numuneye geçiş/iptal) tüm sonuç düğmeleri kapanır.
            const closed = ['numune_asamasina_gecildi', 'olumsuz', 'reddedildi', 'kabul_edildi', 'iptal_edildi'].includes(q.status_key ?? '')
            return (
              <li key={q.id} className="border-border rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="text-text-muted size-4 shrink-0" />
                      <span className="truncate text-sm font-medium text-foreground">{q.file_name ?? `Teklif v${q.version}`}</span>
                      {q.status_label && <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', toneClass(q.status_color))}>{q.status_label}</span>}
                    </div>
                    <div className="text-text-muted mt-1 text-xs">{fmtDT(q.created_at)}{q.rejection_note && ` · Red: ${q.rejection_note}`}</div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {q.file_path && (
                      <Button type="button" variant="ghost" size="icon" className="size-8" disabled={downloading === q.id} onClick={() => void download(q)}>
                        {downloading === q.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="icon" className="size-8" disabled={del.isPending}
                      onClick={async () => { if (!confirm('Teklif dosyası silinsin mi? Başka teklif kalmazsa durum "Teklif Bekliyor"a döner.')) return; try { await del.mutateAsync({ id: q.id, operationId }) } catch (err) { toast.error(await toUserMessage(err)) } }}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                {/* Sonuç takibi */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-text-muted text-xs">Sonuç:</span>
                  <Button size="sm" variant={q.status_key === 'numune_asamasina_gecildi' ? 'default' : 'outline'} disabled={closed} onClick={() => setAcceptFor(q)}>
                    <Check className="size-3.5" /> Olumlu</Button>
                  <Button size="sm" variant={q.status_key === 'olumlu_beklemede' ? 'default' : 'outline'} disabled={closed} onClick={() => setFollowFor(q)}>
                    <Clock className="size-3.5" /> Olumlu — bekliyor</Button>
                  <Button size="sm" variant={q.status_key === 'olumsuz' ? 'destructive' : 'outline'} disabled={closed} onClick={() => setRejectFor(q)}>
                    <X className="size-3.5" /> Olumsuz</Button>
                </div>
                {q.status_key === 'olumlu_beklemede' && q.follow_up_at && (
                  <div className={cn('mt-1.5 flex items-center gap-1.5 text-xs', new Date(q.follow_up_at) <= new Date() ? 'font-medium text-danger-foreground' : 'text-text-secondary')}>
                    <Clock className="size-3.5" /> Tekrar bakılacak: {new Date(q.follow_up_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {new Date(q.follow_up_at) <= new Date() && ' — zamanı geldi'}
                    {q.follow_up_reason && <span className="text-text-muted">· {q.follow_up_reason}</span>}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {acceptFor && <AcceptDialog onClose={() => setAcceptFor(null)} onAccept={async (stageKey) => {
        const q = acceptFor; setAcceptFor(null)
        try {
          await setResult.mutateAsync({ id: q.id, operationId, statusKey: 'kabul_edildi' })
          await advance.mutateAsync({ operationId, stageKey })
          toast.success(`Teklif kabul edildi — aşama: ${stageKey === 'numune' ? 'Numune' : 'Sipariş'}.`)
        } catch (err) { toast.error(await toUserMessage(err)) }
      }} />}
      {rejectFor && <RejectDialog operationId={operationId} onClose={() => setRejectFor(null)} onReject={async (reasonId, note) => {
        const q = rejectFor; setRejectFor(null)
        try { await setResult.mutateAsync({ id: q.id, operationId, statusKey: 'reddedildi', rejectionReasonId: reasonId, rejectionNote: note || null }); toast.success('Teklif reddedildi olarak işaretlendi.') }
        catch (err) { toast.error(await toUserMessage(err)) }
      }} />}
      {followFor && <FollowUpDialog onClose={() => setFollowFor(null)} onSave={async (reason, followUpAt) => {
        const q = followFor; setFollowFor(null)
        try { await setResult.mutateAsync({ id: q.id, operationId, statusKey: 'olumlu_beklemede', followUpReason: reason, followUpAt }); toast.success('Olumlu — beklemede olarak işaretlendi; tekrar bakma tarihi ayarlandı.') }
        catch (err) { toast.error(await toUserMessage(err)) }
      }} />}
    </div>
  )
}

/** H6 — "Olumlu — Beklemede": sebep + tekrar-bak tarihi ZORUNLU. Tarih geçince hatırlatılır. */
function FollowUpDialog({ onClose, onSave }: { onClose: () => void; onSave: (reason: string, followUpAt: string) => void }) {
  const [reason, setReason] = useState('')
  const [date, setDate] = useState<string | null>(null)
  const valid = reason.trim().length > 0 && !!date
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Olumlu — Beklemede</DialogTitle>
          <DialogDescription>Müşteri olumlu ama karar bekliyor. Sebep ve tekrar değerlendirme tarihi zorunludur.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-sm">Sebep <span className="text-destructive">*</span></Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Örn. bütçe onayı bekleniyor" className="mt-1" />
          </div>
          <div>
            <Label className="text-sm">Ne zaman tekrar bakılacak? <span className="text-destructive">*</span></Label>
            <DatePicker value={date} onChange={setDate} className="mt-1 w-full" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button disabled={!valid} onClick={() => valid && onSave(reason.trim(), new Date(date + 'T09:00:00').toISOString())}>Kaydet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AcceptDialog({ onClose, onAccept }: { onClose: () => void; onAccept: (stageKey: string) => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Teklif kabul edildi</DialogTitle>
          <DialogDescription>Hangi aşamaya geçilsin?</DialogDescription></DialogHeader>
        <div className="flex gap-2">
          <Button className="flex-1" variant="outline" onClick={() => onAccept('numune')}>Numuneye geç</Button>
          <Button className="flex-1" onClick={() => onAccept('siparis')}>Doğrudan siparişe geç</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RejectDialog({ operationId: _op, onClose, onReject }: { operationId: number; onClose: () => void; onReject: (reasonId: number | null, note: string) => void }) {
  const reasons = useQuoteRejectionReasonOptions()
  const [reasonId, setReasonId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Teklif reddedildi</DialogTitle>
          <DialogDescription>Red nedeni zorunlu.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Red nedeni <span className="text-danger-foreground">*</span></Label>
            <SearchableSelect clearable options={(reasons.data ?? []).map((r) => ({ value: String(r.id), label: r.label }))}
              value={reasonId} onChange={setReasonId} placeholder="Seçin" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Not</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="ör. Fiyat yüksek bulundu" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button variant="destructive" disabled={!reasonId && !note.trim()}
            onClick={() => (reasonId || note.trim()) ? onReject(reasonId ? Number(reasonId) : null, note) : toast.error('Red nedeni girin.')}>
            Reddedildi işaretle</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// E.2 — Taslak teklif inceleme + onay diyaloğu (katalogdan otomatik hazırlanan)
interface DraftLine { urun?: string; kod?: string; adet?: number; birim_fiyat?: number | null; tutar?: number | null; maliyet_eksik?: boolean }
function DraftReviewDialog({ draft, pending, onApprove, onClose }: { draft: DraftQuote; pending: boolean; onApprove: () => void; onClose: () => void }) {
  const d = (draft.data.data ?? draft.data) as { satirlar?: DraftLine[]; adet_kademesi?: number; toplam_usd?: number; maliyeti_eksik_urun?: number }
  const lines = d.satirlar ?? []
  const missing = Number(d.maliyeti_eksik_urun ?? 0)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="text-accent-primary size-4" /> Katalog taslak teklifi</DialogTitle>
          <DialogDescription>Adet kademesi {d.adet_kademesi ?? 50}. Onaylarsanız gerçek teklif oluşur ve talep durumu ilerler. Onaylanana kadar hiçbir şey değişmez.</DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-text-secondary border-b border-border text-left text-xs">
              <th className="py-1 font-medium">Ürün</th><th className="py-1 text-right font-medium">Adet</th>
              <th className="py-1 text-right font-medium">Birim</th><th className="py-1 text-right font-medium">Tutar</th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0">
                  <td className="py-1.5">{l.urun ?? l.kod}{l.maliyet_eksik && <span className="text-warning-foreground ml-1 text-xs">(maliyet eksik)</span>}</td>
                  <td className="py-1.5 text-right tabular-nums">{l.adet ?? '—'}</td>
                  <td className="py-1.5 text-right tabular-nums">{l.birim_fiyat != null ? formatMoney(l.birim_fiyat, 'USD') : '—'}</td>
                  <td className="py-1.5 text-right tabular-nums">{l.tutar != null ? formatMoney(l.tutar, 'USD') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-sm">
          {missing > 0 ? <span className="text-warning-foreground text-xs">{missing} ürünün maliyeti eksik — birim fiyatı elle tamamlanmalı.</span> : <span />}
          <span className="font-medium tabular-nums">Toplam: {formatMoney(Number(d.toplam_usd ?? 0), 'USD')}</span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Kapat</Button>
          <Button onClick={onApprove} disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Onayla ve teklif oluştur</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
