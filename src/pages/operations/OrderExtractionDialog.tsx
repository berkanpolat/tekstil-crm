import { useEffect, useState } from 'react'
import { Loader2, Sparkles, Check, X, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toUserMessage } from '@/lib/errors'
import { useSignedUrl } from '@/hooks/useFiles'
import { useExtractOrder, useAiFeedback, type ExtractedFields } from '@/hooks/useAi'
import { fetchOrderDocFields } from '@/hooks/useDocuments'
import { useUpdateOrderExtracted } from '@/hooks/useOrders'

const FIELDS: { key: string; label: string; to: string }[] = [
  { key: 'adet', label: 'Adet', to: 'adet' },
  { key: 'birim_fiyat', label: 'Birim fiyat', to: 'fiyat' },
  { key: 'renkler', label: 'Renkler', to: 'renk' },
  { key: 'bedenler', label: 'Bedenler', to: 'beden' },
  { key: 'toplam_tutar', label: 'Toplam tutar', to: 'toplam' },
  { key: 'teslim_tarihi', label: 'Teslim tarihi', to: 'teslimat' },
  { key: 'odeme_kosulu', label: 'Ödeme koşulu', to: 'odeme' },
]
const asStr = (v: unknown) => v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v)

/** P6.7 — Sipariş formundan bilgi çekme + DOĞRULAMA ekranı. Onaya kadar HİÇBİR ŞEY yazılmaz.
 *  Her alanın yanında modelin PDF'te okuduğu kaynak + PDF önizlemesi. Boş alan sarı (uydurmaz). */
export function OrderExtractionDialog({ order, operationId, mode = 'belge', onClose, onDone }:
  { order: { id: number; file_path: string | null; file_name: string | null }; operationId: number; mode?: 'belge' | 'ai'; onClose: () => void; onDone: () => void }) {
  const extract = useExtractOrder()
  const save = useUpdateOrderExtracted()
  const feedback = useAiFeedback()
  const preview = useSignedUrl(order.file_path ? { bucket: 'documents', storage_path: order.file_path } : null)

  const [fields, setFields] = useState<ExtractedFields | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [initial, setInitial] = useState<Record<string, string>>({})
  const [requestId, setRequestId] = useState<number | null>(null)
  const missingPdf = mode === 'ai' && !order.file_path
  const [phase, setPhase] = useState<'loading' | 'review' | 'unavailable'>(() => (missingPdf ? 'unavailable' : 'loading'))
  const [errMsg, setErrMsg] = useState(() => (missingPdf ? 'Bu siparişin PDF dosyası yok. "Belgeden çek" deneyin ya da elle girin.' : ''))

  useEffect(() => {
    let cancel = false
    const applyFields = (f: ExtractedFields) => {
      const vals: Record<string, string> = {}
      for (const fld of FIELDS) vals[fld.key] = asStr(f[fld.key]?.value)
      setFields(f); setValues(vals); setInitial({ ...vals }); setPhase('review')
    }
    if (mode === 'belge') {
      // BELGEDEN (YZ yok, ücretsiz): sipariş belgesi verisini oku
      void fetchOrderDocFields(operationId).then((r) => {
        if (cancel) return
        if (!r) { setPhase('unavailable'); setErrMsg('Bu operasyonda sipariş belgesi bulunamadı. "AI ile çek" deneyin ya da elle girin.'); return }
        applyFields(r.fields as ExtractedFields)
      }).catch(async (e) => { if (!cancel) { setPhase('unavailable'); setErrMsg(await toUserMessage(e)) } })
      return () => { cancel = true }
    }
    // AI modu (yedek): yüklü PDF'i modele gönder (PDF yoksa lazy init zaten 'unavailable')
    if (!order.file_path) return
    void extract.mutateAsync({ orderId: order.id, storagePath: order.file_path, fileName: order.file_name }).then((r) => {
      if (cancel) return
      if (!r.available) { setPhase('unavailable'); setErrMsg('Yapay zekâ şu an kullanılamıyor. Elle giriş yapın.'); return }
      if (r.status === 'limit') { setPhase('unavailable'); setErrMsg(r.error ?? 'Günlük YZ sınırı doldu. Elle giriş yapın.'); return }
      setRequestId(r.request_id ?? null); applyFields((r.fields ?? {}) as ExtractedFields)
    }).catch(async (e) => { if (!cancel) { setPhase('unavailable'); setErrMsg(await toUserMessage(e)) } })
    return () => { cancel = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function confirm() {
    // onay ANINDA yazılır (öncesinde DB'ye hiçbir şey gitmedi)
    const extracted: Record<string, unknown> = {}
    for (const f of FIELDS) extracted[f.to] = values[f.key]?.trim() || null
    const corrected = FIELDS.filter((f) => (values[f.key] ?? '') !== (initial[f.key] ?? '')).map((f) => f.key)
    try {
      const outcome = await save.mutateAsync({ id: order.id, operationId, extracted, source: mode === 'belge' ? 'belge' : 'ai' })
      if (requestId) await feedback.mutateAsync({ requestId, accepted: true, correctedFields: corrected })
      toast.success(`Sipariş bilgileri kaydedildi${corrected.length ? ` (${corrected.length} alan düzeltildi)` : ''}.`)
      if (outcome === 'no_price') toast.warning('Birim fiyat okunamadı; sipariş kalemi oluşturulmadı, elle girin.')
      else if (outcome === 'no_qty') toast.warning('Adet okunamadı; sipariş kalemi oluşturulmadı, elle girin.')
      onDone()
    } catch (e) { toast.error(await toUserMessage(e)) }
  }
  async function cancel() {
    // iptal → hiçbir iz kalmaz (ai_requests kaydı hariç); istersek reddi işaretle
    if (requestId) void feedback.mutateAsync({ requestId, accepted: false, reason: 'kullanıcı iptal etti' })
    onClose()
  }

  return (
    <Dialog open onOpenChange={() => void cancel()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /> {mode === 'belge' ? 'Sipariş bilgisini belgeden çek' : 'Sipariş formundan bilgi çek (YZ)'}</DialogTitle>
          <DialogDescription>{mode === 'belge'
            ? <>Veri, sistemin ürettiği sipariş belgesinden okundu (YZ kullanılmadı). <b>Onaylayana kadar</b> kaydedilmez.</>
            : <>Model çıktısı ekranda; <b>onaylayana kadar</b> hiçbir şey kaydedilmez. Boş alanı model bulamadı — elle girin, uydurma yok.</>}</DialogDescription>
        </DialogHeader>

        {phase === 'loading' && <div className="flex items-center gap-2 p-6 text-sm text-text-muted"><Loader2 className="size-4 animate-spin" /> {mode === 'belge' ? 'Belge verisi okunuyor…' : 'PDF okunuyor, alanlar çıkarılıyor…'}</div>}
        {phase === 'unavailable' && (
          <div className="flex items-start gap-2 rounded-md border border-warning bg-warning-badge/40 p-3 text-sm">
            <AlertTriangle className="size-4 shrink-0 text-warning-foreground" /><div>{errMsg}</div>
          </div>
        )}

        {phase === 'review' && (
          <div className={cn('grid gap-4', order.file_path && 'lg:grid-cols-2')}>
            {/* PDF önizleme (varsa) — kullanıcı karşılaştırsın */}
            {order.file_path && (
              <div className="min-h-[380px] overflow-hidden rounded-md border border-border">
                {preview.data ? <iframe src={preview.data} title="Sipariş PDF" className="h-[420px] w-full" /> : <div className="p-4 text-sm text-text-muted">Önizleme yükleniyor…</div>}
              </div>
            )}
            {/* Alanlar + kaynak */}
            <div className="space-y-2.5">
              {FIELDS.map((f) => {
                const src = fields?.[f.key]?.source
                const empty = !values[f.key]
                return (
                  <div key={f.key}>
                    <Label className="text-xs">{f.label}</Label>
                    <Input className={cn('mt-1', empty && 'border-warning bg-warning-badge/20')} value={values[f.key] ?? ''}
                      onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))} placeholder={empty ? 'Model bulamadı — elle girin' : ''} />
                    {src ? <p className="mt-0.5 text-[11px] text-text-muted">PDF'te: “{src}”</p>
                      : empty ? <p className="mt-0.5 text-[11px] text-warning-foreground">Bulunamadı</p> : null}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => void cancel()}><X className="size-4" /> İptal</Button>
          {phase === 'review' && <Button onClick={() => void confirm()} disabled={save.isPending}>{save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Onayla ve kaydet</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
