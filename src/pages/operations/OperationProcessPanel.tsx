import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Check, MessageSquareWarning } from 'lucide-react'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { STATUS_TONE_CLASS, type StatusTone } from '@/lib/statuses'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { EntityTimeline } from '@/components/timeline/EntityTimeline'
import { QuotesTab } from './QuotesTab'
import { SamplesTab } from './SamplesTab'
import { OrdersTab } from './OrdersTab'
import {
  useOperationStageOptions, useOperationStatusOptions, useOperationStatusTransitions, useSetOperationStatus,
  type OperationDetail, type StageStatusOption,
} from '@/hooks/useOperations'

const toneClass = (c: string | null | undefined): string =>
  c && (['success', 'warning', 'danger', 'info', 'neutral'] as string[]).includes(c)
    ? STATUS_TONE_CLASS[c as StatusTone] : 'bg-neutral-badge text-neutral-badge-foreground'

const STAGE_DESC: Record<string, string> = {
  teklif: 'Teklif dosyası hazırlanıp yüklenir; müşteri yanıtı beklenir.',
  numune: 'Numune üretilir, gönderilir ve onaya sunulur.',
  siparis: 'Sipariş formu yüklenir; üretim planlaması yapılır.',
  uretim: 'Ürün üretimdedir.',
  teslimat: 'Sevkiyat / teslim aşaması.',
  tamamlandi: 'Operasyon kapandı.',
}

/**
 * H3 — Tek "Süreç" paneli. İki kademeli model: AŞAMA (accordion) + DURUM (seçici).
 * - Aynı anda yalnız bulunulan aşamanın bloğu açık; diğerleri tek satır, tıklayınca açılır.
 * - Durum değişince AŞAMA + davranış DB tetikleriyle türetilir (elle stage set edilmez).
 * - Gerekçe isteyen durumda panel içinde odaklı metin alanı açılır (modal yok).
 * - Belge/numune/sipariş işlemleri aşamanın içine gömülüdür (gizli route'a gitmez).
 */
export function OperationProcessPanel({ op, customerId }: { op: OperationDetail; customerId: number }) {
  const stages = useOperationStageOptions()
  const statusOptions = useOperationStatusOptions()
  const transitions = useOperationStatusTransitions()
  const setStatus = useSetOperationStatus()
  // Açık aşama (stage.id ile — key eşleşme kırılganlığı yok). Varsayılan = bulunulan aşama.
  const [open, setOpen] = useState<number | null>(op.stage_id)
  // Gerekçe isteyen durum için hedef durum id + metin (panel içi, modal yok).
  const [reasonFor, setReasonFor] = useState<number | null>(null)
  const [reasonText, setReasonText] = useState('')

  const stageList = (stages.data ?? []).filter((s) => s.key !== 'iptal')
  const allStatuses = statusOptions.data ?? []

  // Geçiş kuralı: mevcut durumdan tanımlı hedef VARSA yalnız onlar; hiç yoksa serbest.
  const trs = transitions.data ?? []
  const fromCurrent = op.durum_key ? trs.filter((t) => t.from_key === op.durum_key) : []
  const hasRules = fromCurrent.length > 0
  const allowedTo = new Set(fromCurrent.map((t) => t.to_key))
  const canGoTo = (key: string) => !hasRules || allowedTo.has(key)
  // Pasif durum açıklaması: neden geçilemediği + geçerli sonraki adım(lar) (Bulgu A).
  const labelByKey = new Map(allStatuses.map((s) => [s.key, s.label]))
  const nextSteps = fromCurrent.map((t) => labelByKey.get(t.to_key) ?? t.to_key)
  const invalidMsg = (target: StageStatusOption) =>
    `"${op.durum_label ?? 'Bu durum'}" durumundan "${target.label}" durumuna geçilemez.` +
    (nextSteps.length ? ` Şu an geçilebilir: ${nextSteps.join(', ')}.` : '')

  async function applyStatus(target: StageStatusOption, note?: string) {
    try {
      await setStatus.mutateAsync({ id: op.id, statusId: target.id, note: note ?? null })
      setReasonFor(null); setReasonText('')
      setOpen(target.stage_id)
      toast.success(`Durum: ${target.label}`)
    } catch (err) {
      toast.error(await toUserMessage(err))
    }
  }

  function onStatusClick(target: StageStatusOption) {
    if (target.id === op.status_id) return
    if (!canGoTo(target.key)) { toast.message(invalidMsg(target)); return }   // Bulgu A: sebebi söyle
    if (target.requires_reason) {
      setReasonFor(target.id); setReasonText('')
      return
    }
    void applyStatus(target)
  }

  return (
    <div className="space-y-4">
      <div className="border-border divide-border divide-y overflow-hidden rounded-lg border">
        {stageList.map((stage) => {
          const isCurrent = stage.id === op.stage_id
          const isOpen = open === stage.id
          const statuses = allStatuses.filter((s) => s.stage_id === stage.id)
          return (
            <div key={stage.id}>
              {/* Aşama başlığı — tıklayınca aç/kapat */}
              <button type="button" onClick={() => setOpen(isOpen ? null : stage.id)}
                className={cn('flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors',
                  isCurrent ? 'bg-muted/40' : 'hover:bg-muted/30')}>
                {isOpen ? <ChevronDown className="text-text-muted size-4 shrink-0" /> : <ChevronRight className="text-text-muted size-4 shrink-0" />}
                <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', toneClass(stage.color))}>{stage.label}</span>
                {isCurrent && op.durum_label && (
                  <span className="text-text-secondary text-xs">· {op.durum_label}</span>
                )}
                {isCurrent && <span className="text-primary ml-auto text-[10px] font-medium uppercase">Bulunulan aşama</span>}
              </button>

              {isOpen && (
                <div className="space-y-4 px-3 pb-4 pt-1">
                  <p className="text-text-secondary text-xs">{STAGE_DESC[stage.key] ?? ''}</p>

                  {/* Durum seçici */}
                  {statuses.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-text-muted text-xs font-medium uppercase">Durum</div>
                      <div className="flex flex-wrap gap-1.5">
                        {statuses.map((s) => {
                          const active = s.id === op.status_id
                          const allowed = canGoTo(s.key)
                          // Renk her butonda durumun tonundan (Bulgu 4): aktif dolu+halka,
                          // geçilebilir soluk, geçilemez gri. Metin her zaman durumu yazar.
                          const cls = active
                            ? cn(toneClass(s.color ?? stage.color), 'ring-2 ring-foreground/25')
                            : allowed
                              ? cn(toneClass(s.color ?? stage.color), 'opacity-60 hover:opacity-100')
                              : 'bg-muted text-text-muted/50 cursor-not-allowed'
                          // Geçersiz butonu DISABLE ETME (disabled buton hover tooltip'i yutar) —
                          // görsel pasif + title, tıklayınca onStatusClick sebebi toast'lar.
                          return (
                            <button key={s.id} type="button" disabled={setStatus.isPending}
                              title={!active && !allowed ? invalidMsg(s) : (s.requires_reason && !active ? 'Bu durum için gerekçe istenir.' : undefined)}
                              onClick={() => onStatusClick(s)}
                              className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all', cls)}>
                              {active && <Check className="size-3" />}
                              {s.label}
                              {s.requires_reason && allowed && !active && <MessageSquareWarning className="size-3 opacity-70" />}
                            </button>
                          )
                        })}
                      </div>

                      {/* Gerekçe alanı — yalnız gerekçe isteyen durum seçilince, panel içinde */}
                      {reasonFor != null && statuses.some((s) => s.id === reasonFor) && (
                        <div className="border-border bg-muted/30 space-y-2 rounded-md border p-2.5">
                          <div className="text-text-secondary text-xs">
                            Gerekçe gerekli: <span className="font-medium">{statuses.find((s) => s.id === reasonFor)?.label}</span>
                          </div>
                          <Textarea autoFocus value={reasonText} onChange={(e) => setReasonText(e.target.value)}
                            placeholder="Neden bu duruma geçiliyor?" rows={2} className="text-sm" />
                          <div className="flex gap-2">
                            <Button size="sm" disabled={setStatus.isPending || !reasonText.trim()}
                              onClick={() => { const t = statuses.find((s) => s.id === reasonFor); if (t) void applyStatus(t, reasonText.trim()) }}>
                              {setStatus.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Kaydet
                            </Button>
                            <button type="button" onClick={() => { setReasonFor(null); setReasonText('') }}
                              className="text-text-muted text-xs hover:underline">Vazgeç</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Aşamaya gömülü işlem paneli (belge/numune/sipariş) */}
                  {stage.key === 'teklif' && <QuotesTab operationId={op.id} />}
                  {stage.key === 'numune' && <SamplesTab operationId={op.id} />}
                  {stage.key === 'siparis' && <OrdersTab operationId={op.id} customerId={customerId} />}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Salt-okunur zaman çizelgesi — durum + aşama değişimleri (tek kaynak: event_log) */}
      <div>
        <h3 className="text-text-muted mb-2 text-xs font-medium uppercase">Süreç geçmişi</h3>
        <EntityTimeline entityType="operation" entityId={op.id} />
      </div>
    </div>
  )
}
