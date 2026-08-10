import { useRef, useState } from 'react'
import { Package, Upload, Download, Trash2, Loader2, Save, Truck, CheckCircle2, PauseCircle, PlayCircle, AlertTriangle, FileText, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { STATUS_TONE_CLASS, type StatusTone } from '@/lib/statuses'
import { EmptyState } from '@/components/shared/EmptyState'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { DatePicker } from '@/components/shared/DatePicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { getSignedUrl } from '@/hooks/useFiles'
import {
  useOperationOrders, useUploadOrderFile, useCreateOrder, useUpdateOrder, useUpdateOrderExtracted, useDeleteOrder, useOrderStatusOptions, type Order,
} from '@/hooks/useOrders'
import { useOperationSamples } from '@/hooks/useSamples'
import { useOperationDocuments } from '@/hooks/useDocuments'
import { useOrderAdvanceCheck, useAdvanceOverride, useFinancePerms, type AdvanceCheck } from '@/hooks/useFinance'
import { formatMoney } from '@/lib/money'
import { PaymentDialog } from '@/pages/finance/PaymentDialog'
import { GenerateDocButton } from './GenerateDocButton'
import { OrderExtractionDialog } from './OrderExtractionDialog'

const toneClass = (c: string | null): string =>
  c && (['success', 'warning', 'danger', 'info', 'neutral'] as string[]).includes(c)
    ? STATUS_TONE_CLASS[c as StatusTone] : 'bg-neutral-badge text-neutral-badge-foreground'
const fmtDT = (iso: string) => new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Sipariş = form dosyası yükleme + elle bilgi doğrulama (Merhaba.docx 5). AI çekme Faz 6. */
export function OrdersTab({ operationId, customerId }: { operationId: number; customerId: number }) {
  const { data: orders, isLoading } = useOperationOrders(operationId)
  const samples = useOperationSamples(operationId)
  const docs = useOperationDocuments(operationId)
  const upload = useUploadOrderFile()
  const create = useCreateOrder()
  const inputRef = useRef<HTMLInputElement>(null)
  const [gateOpen, setGateOpen] = useState(false)
  const pendingFile = useRef<File | null>(null)
  const pendingAction = useRef<'upload' | 'doc'>('upload')
  const [validateFor, setValidateFor] = useState<number | null>(null)
  const [docExtractFor, setDocExtractFor] = useState<number | null>(null)

  const hasApprovedSample = (samples.data ?? []).some((s) => !s.deleted_at && (s.approved_at || s.status_key === 'onaylandi'))
  // Sert kapı: sipariş onay formu (siparis_onay) yoksa sipariş OLUŞTURULAMAZ (DB trigger).
  const hasOnay = (docs.data ?? []).some((d) => d.type_key === 'siparis_onay')
  // Sistemin ürettiği sipariş formu var mı? Varsa yükleme ZORUNLU değil (madde 5).
  const hasSiparisFormu = (docs.data ?? []).some((d) => d.type_key === 'siparis_formu')

  async function doUpload(file: File, gateReason?: string) {
    try {
      const id = await upload.mutateAsync({ operationId, file })
      if (gateReason) await supabase.rpc('log_soft_gate_override', { p_operation_id: operationId, p_gate: 'siparis_numune_onaysiz', p_reason: gateReason })
      setValidateFor(id)
      toast.success('Sipariş formu yüklendi. Bilgileri doğrulayın.')
    } catch (err) { toast.error(await toUserMessage(err)) }
  }
  // Madde 5: sistemin ürettiği sipariş formundan sipariş oluştur — yükleme yok, bilgiler belgeden.
  async function createFromDoc(gateReason?: string) {
    try {
      const id = await create.mutateAsync({ operationId })
      if (gateReason) await supabase.rpc('log_soft_gate_override', { p_operation_id: operationId, p_gate: 'siparis_numune_onaysiz', p_reason: gateReason })
      setDocExtractFor(id)   // doğrulama ekranı belge modunda açılır, alanlar dolu gelir
      toast.success('Sipariş oluşturuldu. Belgeden gelen bilgileri doğrulayın.')
    } catch (err) { toast.error(await toUserMessage(err)) }
  }
  function onCreateFromDoc() {
    if (!hasOnay) { toast.error('Önce Sipariş Onay Formu üretin — onaysız sipariş oluşturulamaz.'); return }
    if (!hasApprovedSample) { pendingAction.current = 'doc'; setGateOpen(true) }
    else void createFromDoc()
  }
  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    if (!hasOnay) { toast.error('Önce Sipariş Onay Formu üretin — onaysız sipariş oluşturulamaz.'); return }
    if (!hasApprovedSample) { pendingFile.current = file; pendingAction.current = 'upload'; setGateOpen(true) }
    else void doUpload(file)
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Sipariş formu</h3>
          <p className="text-text-secondary text-xs">Sistemin ürettiği sipariş formundan doğrudan sipariş oluşturabilir (bilgiler belgeden gelir, yükleme gerekmez) ya da dışarıdan gelen bir PDF yükleyebilirsiniz.</p>
        </div>
        <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={onPick} />
        <div className="flex flex-wrap gap-2">
          <GenerateDocButton operationId={operationId} typeKey="siparis_formu" variant="outline" />
          {hasSiparisFormu && (
            <Button size="sm" onClick={onCreateFromDoc} disabled={create.isPending || !hasOnay}
              title={!hasOnay ? 'Önce Sipariş Onay Formu üretin' : 'Üretilen sipariş formundan oluştur (yükleme gerekmez)'}>
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} Sipariş formundan oluştur
            </Button>
          )}
          <Button size="sm" variant={hasSiparisFormu ? 'outline' : 'default'} onClick={() => inputRef.current?.click()} disabled={upload.isPending || !hasOnay}
            title={!hasOnay ? 'Önce Sipariş Onay Formu üretin' : 'Dışarıdan gelen sipariş formu PDF yükle'}>
            {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Dış PDF yükle
          </Button>
        </div>
      </div>

      {/* Sert kapı yönlendirmesi (QA#2): onay formu yoksa net + tıklanabilir çıkış */}
      {!hasOnay && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning bg-warning-badge/40 p-3">
          <AlertTriangle className="size-5 shrink-0 text-warning-foreground" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-foreground">Sipariş oluşturmak için önce Sipariş Onay Formu gerekli</div>
            <div className="text-text-secondary text-xs">Bu bir sert kapıdır: onay formu üretilmeden sipariş formu yüklenemez.</div>
          </div>
          <GenerateDocButton operationId={operationId} typeKey="siparis_onay" />
        </div>
      )}

      {isLoading ? <Skeleton className="h-32 w-full" /> : (orders ?? []).length === 0 ? (
        hasOnay
          ? <EmptyState icon={Package} title="Sipariş yok" description={hasSiparisFormu ? 'Üretilen sipariş formundan “Sipariş formundan oluştur” ile başlayın (yükleme gerekmez).' : 'Önce sipariş formunu üretin, sonra ondan oluşturun; ya da dış PDF yükleyin.'} />
          : null /* !hasOnay durumunda üstteki uyarı bandı yönlendiriyor */
      ) : (
        <ul className="space-y-2">
          {(orders ?? []).map((o) => (
            <OrderRow key={o.id} order={o} operationId={operationId} customerId={customerId} onValidate={() => setValidateFor(o.id)} />
          ))}
        </ul>
      )}

      {gateOpen && <SoftGateDialog onClose={() => { setGateOpen(false); pendingFile.current = null }}
        onConfirm={async (reason) => {
          const act = pendingAction.current; const f = pendingFile.current
          setGateOpen(false); pendingFile.current = null
          if (act === 'doc') await createFromDoc(reason)
          else if (f) await doUpload(f, reason)
        }} />}
      {validateFor && <ValidateDialog orderId={validateFor} operationId={operationId} order={(orders ?? []).find((o) => o.id === validateFor) ?? null} onClose={() => setValidateFor(null)} />}
      {docExtractFor && <OrderExtractionDialog order={{ id: docExtractFor, file_path: null, file_name: null }} operationId={operationId} mode="belge"
        onClose={() => setDocExtractFor(null)} onDone={() => setDocExtractFor(null)} />}
    </div>
  )
}

function OrderRow({ order, operationId, customerId, onValidate }: { order: Order; operationId: number; customerId: number; onValidate: () => void }) {
  const statuses = useOrderStatusOptions()
  const update = useUpdateOrder()
  const del = useDeleteOrder()
  const perms = useFinancePerms()
  const advance = useOrderAdvanceCheck(order.id)
  const override = useAdvanceOverride()
  const [downloading, setDownloading] = useState(false)
  const [holdOpen, setHoldOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [extractMode, setExtractMode] = useState<'belge' | 'ai' | null>(null)
  const [gate, setGate] = useState<{ apply: (reason: string) => Promise<void> } | null>(null)
  const closed = statuses.data?.find((s) => s.id === order.status_id)?.is_closed ?? false
  const currentKey = statuses.data?.find((s) => s.id === order.status_id)?.key ?? null
  const statusIdByKey = (key: string) => statuses.data?.find((s) => s.key === key)?.id ?? null
  const ex = order.extracted_data ?? {}
  const adv = advance.data

  async function download() {
    if (!order.file_path) return
    setDownloading(true)
    try {
      const url = await getSignedUrl('documents', order.file_path, 60, order.file_name ?? undefined)
      const a = document.createElement('a'); a.href = url; a.download = order.file_name ?? 'siparis'; document.body.appendChild(a); a.click(); a.remove()
    } catch (err) { toast.error(await toUserMessage(err)) } finally { setDownloading(false) }
  }
  async function applyStatus(id: number) { await update.mutateAsync({ id: order.id, operationId, status_id: id }); toast.success('Durum güncellendi.') }
  async function applyResume() { await update.mutateAsync({ id: order.id, operationId, held_at: null, hold_reason: null, status_id: statusIdByKey('uretimde') ?? undefined }); toast.success('Bekletme kaldırıldı.') }

  /** Üretime geçişte (yalnız 'uretimde'ye dönüşte) ön ödeme kapısı. Yeterliyse/yetkisi
   *  yoksa doğrudan uygular; yetersizse gerekçe penceresi açar (engel yok). */
  async function guardUretime(targetKey: string | null, direct: () => Promise<void>) {
    const enteringProd = targetKey === 'uretimde' && currentKey !== 'uretimde'
    if (enteringProd && adv && !adv.sufficient && adv.order_total_usd > 0) {
      setGate({ apply: async (reason: string) => { await override.mutateAsync({ orderId: order.id, reason }); await direct() } })
      return
    }
    await direct()
  }
  async function setStatus(id: number) {
    const key = statuses.data?.find((s) => s.id === id)?.key ?? null
    try { await guardUretime(key, () => applyStatus(id)) } catch (err) { toast.error(await toUserMessage(err)) }
  }
  async function resume() { try { await guardUretime('uretimde', applyResume) } catch (err) { toast.error(await toUserMessage(err)) } }
  async function saveDue(field: 'advance_due_date' | 'balance_due_date', value: string | null) {
    try { await update.mutateAsync({ id: order.id, operationId, [field]: value }); toast.success('Vade güncellendi.') } catch (err) { toast.error(await toUserMessage(err)) }
  }
  async function ship() { try { await update.mutateAsync({ id: order.id, operationId, shipped_at: new Date().toISOString(), status_id: statusIdByKey('kargoda') ?? undefined }); toast.success('Kargoya verildi.') } catch (err) { toast.error(await toUserMessage(err)) } }
  async function deliver() { try { await update.mutateAsync({ id: order.id, operationId, actual_delivery: new Date().toISOString().slice(0, 10), status_id: statusIdByKey('teslim_edildi') ?? undefined }); toast.success('Teslim edildi.') } catch (err) { toast.error(await toUserMessage(err)) } }

  return (
    <li className="border-border rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="text-text-muted size-4 shrink-0" />
            <span className="truncate text-sm font-medium text-foreground">{order.file_name ?? 'Sipariş formu'}</span>
            {order.status_label && <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', toneClass(order.status_color))}>{order.status_label}</span>}
            {order.held_at && <span className="bg-warning-badge text-warning-badge-foreground rounded px-1.5 py-0.5 text-[10px]">Askıda</span>}
          </div>
          <div className="text-text-muted mt-1 text-xs">{fmtDT(order.created_at)}</div>
        </div>
        <div className="flex shrink-0 gap-1">
          {order.file_path && <Button type="button" variant="ghost" size="icon" className="size-8" disabled={downloading} onClick={() => void download()}>
            {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}</Button>}
          <Button type="button" variant="ghost" size="icon" className="size-8" disabled={del.isPending}
            onClick={async () => { if (!confirm('Sipariş silinsin mi?')) return; try { await del.mutateAsync({ id: order.id, operationId }) } catch (err) { toast.error(await toUserMessage(err)) } }}>
            <Trash2 className="size-4" /></Button>
        </div>
      </div>

      {/* Çekilen bilgiler (elle) */}
      <div className="border-border mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-xs">
        {(['adet','fiyat','renk','teslimat','odeme'] as const).map((k) => (
          <span key={k} className="text-text-secondary"><span className="text-text-muted">{({adet:'Adet',fiyat:'Fiyat',renk:'Renk',teslimat:'Teslimat',odeme:'Ödeme'})[k]}:</span> {ex[k] ? String(ex[k]) : '—'}</span>
        ))}
        <span className="text-text-muted ml-auto">{order.extraction_source === 'ai' ? 'AI' : order.extraction_source === 'belge' ? 'Belge' : 'Elle'}</span>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-primary" onClick={() => setExtractMode('belge')} title="Sistemin ürettiği sipariş belgesinden (ücretsiz)"><Sparkles className="size-3.5" /> Belgeden çek</Button>
        {order.file_path && <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setExtractMode('ai')} title="PDF'i yapay zekâya oku (yedek)">AI ile çek</Button>}
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onValidate}>Düzenle</Button>
      </div>

      {/* Ödeme durumu (Kabul 13) — yalnız finans yetkisi olana görünür (P5.8) */}
      {perms.data?.view && adv && adv.order_total_usd > 0 && (
        <div className={cn('mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-xs',
          adv.sufficient ? 'border-border bg-muted/30' : 'border-warning bg-warning-badge/40')}>
          <span className="text-text-secondary"><span className="text-text-muted">Tutar:</span> {formatMoney(adv.order_total_usd, 'USD')}</span>
          <span className="text-text-secondary"><span className="text-text-muted">Alınan:</span> {formatMoney(adv.paid_usd, 'USD')}</span>
          <span className="text-text-secondary"><span className="text-text-muted">Kalan:</span> {formatMoney(Math.max(0, adv.order_total_usd - adv.paid_usd), 'USD')}</span>
          <span className="text-text-secondary"><span className="text-text-muted">Ön ödeme:</span> %{adv.advance_percent} / %{adv.required_percent}</span>
          {!adv.sufficient && <span className="font-medium text-warning-foreground">Ön ödeme eksik</span>}
          {perms.data?.edit && <Button size="sm" variant="ghost" className="ml-auto h-6 px-2 text-xs" onClick={() => setPayOpen(true)}>Ödeme ekle</Button>}
        </div>
      )}

      {/* Vadeler (P5.4) — finans yetkili düzenler */}
      {perms.data?.edit && adv && adv.order_total_usd > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-text-muted">Ön ödeme vadesi</span>
          <div className="w-36"><DatePicker value={order.advance_due_date ?? null} onChange={(v) => void saveDue('advance_due_date', v)} clearable /></div>
          <span className="ml-2 text-text-muted">Bakiye vadesi</span>
          <div className="w-36"><DatePicker value={order.balance_due_date ?? null} onChange={(v) => void saveDue('balance_due_date', v)} clearable /></div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="w-40">
          <SearchableSelect options={(statuses.data ?? []).map((s) => ({ value: String(s.id), label: s.label }))}
            value={order.status_id ? String(order.status_id) : null} onChange={(v) => { if (v) void setStatus(Number(v)) }} className="h-8" />
        </div>
        {order.held_at
          ? <Button size="sm" variant="outline" onClick={() => void resume()}><PlayCircle className="size-3.5" /> Askıdan al</Button>
          : <Button size="sm" variant="outline" onClick={() => setHoldOpen(true)} disabled={closed}><PauseCircle className="size-3.5" /> Askıya al</Button>}
        <Button size="sm" variant="outline" onClick={() => void ship()} disabled={closed}><Truck className="size-3.5" /> Sevk</Button>
        <Button size="sm" variant="outline" onClick={() => void deliver()} disabled={closed}><CheckCircle2 className="size-3.5" /> Teslim</Button>
      </div>

      {holdOpen && <HoldDialog onClose={() => setHoldOpen(false)} onHold={async (reason) => {
        try { await update.mutateAsync({ id: order.id, operationId, held_at: new Date().toISOString(), hold_reason: reason || null, status_id: statusIdByKey('bekletiliyor') ?? undefined }); toast.success('Bekletiliyor.'); setHoldOpen(false) }
        catch (err) { toast.error(await toUserMessage(err)) }
      }} />}
      {payOpen && <PaymentDialog customerId={customerId} operationId={operationId} orderId={order.id} defaultAdvance
        onClose={() => setPayOpen(false)} onSaved={() => void advance.refetch()} />}
      {extractMode && <OrderExtractionDialog order={{ id: order.id, file_path: order.file_path, file_name: order.file_name }} operationId={operationId} mode={extractMode}
        onClose={() => setExtractMode(null)} onDone={() => setExtractMode(null)} />}
      {gate && adv && <AdvanceGateDialog check={adv} busy={override.isPending || update.isPending}
        onClose={() => setGate(null)}
        onConfirm={async (reason) => { try { await gate.apply(reason); setGate(null) } catch (err) { toast.error(await toUserMessage(err)) } }} />}
    </li>
  )
}

/** P5.3 — Yetersiz ön ödemeyle üretime geçiş uyarısı. Gerekçe zorunlu, engel yok. */
function AdvanceGateDialog({ check, busy, onClose, onConfirm }: { check: AdvanceCheck; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="text-warning-foreground size-5" /> Ön ödeme yetersiz</DialogTitle>
          <DialogDescription>
            Bu sipariş için <strong>{formatMoney(check.required_usd, 'USD')}</strong> ön ödeme bekleniyor,
            <strong> {formatMoney(check.advance_usd, 'USD')}</strong> alınmış (%{check.advance_percent}).
            Üretime geçmek istediğinize emin misiniz? Gerekçe kayda geçer ve yöneticiye bildirilir.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label className="text-xs">Gerekçe <span className="text-danger-foreground">*</span></Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ör. Müşteri güvenilir, ön ödeme haftaya gelecek" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button disabled={!reason.trim() || busy} onClick={() => reason.trim() && onConfirm(reason.trim())}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Yine de üretime geç
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ValidateDialog({ orderId, operationId, order, onClose }: { orderId: number; operationId: number; order: Order | null; onClose: () => void }) {
  const save = useUpdateOrderExtracted()
  const ex = (order?.extracted_data ?? {}) as Record<string, string>
  const [adet, setAdet] = useState(ex.adet ?? '')
  const [fiyat, setFiyat] = useState(ex.fiyat ?? '')
  const [renk, setRenk] = useState(ex.renk ?? '')
  const [teslimat, setTeslimat] = useState<string | null>(ex.teslimat ?? null)
  const [odeme, setOdeme] = useState(ex.odeme ?? '')

  async function submit() {
    try {
      const outcome = await save.mutateAsync({ id: orderId, operationId, extracted: {
        adet: adet.trim() || null, fiyat: fiyat.trim() || null, renk: renk.trim() || null,
        teslimat: teslimat || null, odeme: odeme.trim() || null,
      } })
      toast.success('Sipariş bilgileri kaydedildi.')
      if (outcome === 'no_price') toast.warning('Birim fiyat okunamadı; sipariş kalemi oluşturulmadı, elle girin.')
      else if (outcome === 'no_qty') toast.warning('Adet okunamadı; sipariş kalemi oluşturulmadı, elle girin.')
      onClose()
    } catch (err) { toast.error(await toUserMessage(err)) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Sipariş bilgileri</DialogTitle>
          <DialogDescription>Yüklenen formdaki bilgileri girin. Otomatik doldurmak için "Belgeden çek" veya "AI ile çek" düğmelerini kullanabilirsiniz.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label className="text-xs">Adet</Label><Input value={adet} onChange={(e) => setAdet(e.target.value)} type="number" /></div>
          <div className="space-y-1"><Label className="text-xs">Fiyat</Label><Input value={fiyat} onChange={(e) => setFiyat(e.target.value)} placeholder="ör. 45.000 TL" /></div>
          <div className="space-y-1"><Label className="text-xs">Renk</Label><Input value={renk} onChange={(e) => setRenk(e.target.value)} placeholder="ör. Gri melanj" /></div>
          <div className="space-y-1"><Label className="text-xs">Hedeflenen teslimat</Label><DatePicker value={teslimat} onChange={setTeslimat} clearable /></div>
          <div className="col-span-2 space-y-1"><Label className="text-xs">Beklenen ödeme</Label><Input value={odeme} onChange={(e) => setOdeme(e.target.value)} placeholder="ör. %50 peşin, kalan teslimatta" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>{save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Kaydet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SoftGateDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="text-warning-foreground size-5" /> Numune onayı yok</DialogTitle>
          <DialogDescription>Onaylı numune yok. Yine de sipariş açabilirsiniz ama gerekçe kayda geçer.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label className="text-xs">Gerekçe <span className="text-danger-foreground">*</span></Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ör. Acil sipariş, müşteri sözlü onay verdi" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button disabled={!reason.trim()} onClick={() => reason.trim() && onConfirm(reason.trim())}>Yine de yükle</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HoldDialog({ onClose, onHold }: { onClose: () => void; onHold: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Siparişi askıya al</DialogTitle><DialogDescription>Neden askıya alındığını yazın.</DialogDescription></DialogHeader>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ör. Kumaş tedarik sorunu" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button onClick={() => onHold(reason)}>Askıya al</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
