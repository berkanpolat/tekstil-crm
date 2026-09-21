import { useState } from 'react'
import { Plus, Trash2, Shirt, Loader2, Save, BadgeCheck } from 'lucide-react'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/shared/EmptyState'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useOperationSamples, useCreateSample, useUpdateSample, useDeleteSample, type Sample,
} from '@/hooks/useSamples'
import { useOperationQuotes, quoteLabel } from '@/hooks/useQuotes'
import { useOperationDocuments } from '@/hooks/useDocuments'
import { GenerateDocButton } from './GenerateDocButton'

// H3: Durum artık TEK yerden — talep kartındaki Süreç şeridi — değişir. Bu kart yalnız
// numune BİLGİSİNİ tutar (ad, ücret, termin, kargo, takip, açıklama). Durum butonları,
// Durum seçici ve onay/red/revize modalları KALDIRILDI (tek giriş noktası ilkesi).

const APPROVAL_METHODS: Record<string, string> = {
  whatsapp: 'WhatsApp fotoğrafı', eposta: 'E-posta', fiziksel: 'Fiziksel teslim', yuz_yuze: 'Yüz yüze', diger: 'Diğer',
}
const methodLabel = (m: string | null) => (m ? APPROVAL_METHODS[m] ?? m : '—')
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
                <span className={cn('min-w-0 truncate text-sm font-medium', deleted && 'text-text-muted line-through')} title={s.label ?? undefined}>
                  N{s.version}{s.label ? ` · ${s.label}` : ''}{deleted && ' (silindi)'}
                </span>
                {/* Bulgu B: numunenin kendi (legacy) durum etiketi GÖSTERİLMEZ — tek gerçek operasyon
                    durumu (Süreç şeridi). Burada tur bilgisi ayrışmayan gerçek bir veridir. */}
                {!deleted && s.revision_round > 1 && <span className="text-text-muted shrink-0 text-[10px]">{s.revision_round}. tur</span>}
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

/** Numune BİLGİ kartı — durum kontrolü yok (o, Süreç şeridinde). Yalnız numune verisi. */
function SampleEditor({ sample, operationId }: { sample: Sample; operationId: number }) {
  const quotes = useOperationQuotes(operationId)
  const update = useUpdateSample()
  const del = useDeleteSample()

  const [label, setLabel] = useState(sample.label ?? '')
  const [description, setDescription] = useState(sample.description ?? '')
  const [fee, setFee] = useState<number | null>(sample.fee ?? null)
  const [deduct, setDeduct] = useState(sample.deduct_from_order)
  const [quoteId, setQuoteId] = useState<string | null>(sample.quote_id ? String(sample.quote_id) : null)
  const [carrier, setCarrier] = useState(sample.carrier ?? '')
  const [tracking, setTracking] = useState(sample.tracking_number ?? '')
  const [targetDate, setTargetDate] = useState(sample.target_date ?? '')

  async function saveHeader() {
    try {
      await update.mutateAsync({ id: sample.id, operationId,
        label: label.trim() || null, description: description.trim() || null, fee, deduct_from_order: deduct,
        quote_id: quoteId ? Number(quoteId) : null, carrier: carrier.trim() || null, tracking_number: tracking.trim() || null,
        target_date: targetDate || null })
      toast.success('Numune kaydedildi.')
    } catch (err) { toast.error(await toUserMessage(err)) }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold text-foreground">Numune N{sample.version}{sample.label ? ` · ${sample.label}` : ''}</h3>
        <span className={cn('rounded px-1.5 py-0.5 text-xs', sample.revision_round >= 3 ? 'bg-warning-badge text-warning-badge-foreground' : 'text-text-muted')}>
          {sample.revision_round}. tur{sample.revision_round >= 3 && ' ⚠'}
        </span>
      </div>
      <p className="text-text-muted -mt-3 text-xs">Durum talebin <strong>Süreç</strong> sekmesindeki durum şeridinden yürür (tek kaynak). Bu kart numune bilgisini tutar.</p>

      {sample.revision_round >= 3 && (
        <div className="border-warning/40 bg-warning/5 text-warning-foreground rounded-lg border px-3 py-2 text-sm">
          Bu numune {sample.revision_round}. turda — tekrarlayan revizyon. Süreci gözden geçirin.
        </div>
      )}

      {/* Onay / red özeti (salt-okunur bilgi) */}
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

      <div className="max-w-sm space-y-1">
        <Label className="text-text-muted text-xs">Ad / Etiket</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ör. Kırmızı varyant" maxLength={60} />
        <p className="text-text-muted text-[11px]">Numuneleri ayırt etmek için kısa ad. Ayrıntı için “Açıklama” alanını kullanın.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-text-muted text-xs">İlgili teklif</Label>
          <SearchableSelect clearable options={(quotes.data ?? []).filter((q) => !q.deleted_at).map((q) => ({ value: String(q.id), label: `${quoteLabel(q)} · v${q.version}` }))}
            value={quoteId} onChange={setQuoteId} placeholder="—" />
        </div>
        <div className="space-y-1">
          <Label className="text-text-muted text-xs">Numune ücreti (₺)</Label>
          <MoneyInput value={fee} onValueChange={setFee} placeholder="0,00" />
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

      {/* Kargo bilgisi */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
        }} disabled={del.isPending}><Trash2 className="size-4" /> Sil</Button>
        <Button onClick={() => void saveHeader()} disabled={update.isPending}>
          {update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Kaydet
        </Button>
      </div>
    </div>
  )
}
