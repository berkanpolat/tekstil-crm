import { useState } from 'react'
import { toast } from 'sonner'
import { Check, Loader2, MessageCirclePlus } from 'lucide-react'
import { toUserMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { DatePicker } from '@/components/shared/DatePicker'
import { useChannelOptions, useOutcomeOptions } from '@/hooks/useInteractions'
import { useAddOperationInteraction } from '@/hooks/useOperationActivity'
import { useUpdateOperation } from '@/hooks/useOperations'

/**
 * Talep detayında hızlı aksiyon ekleme (etkileşim + sonraki takip tarihi).
 * CalismaDetailPanel'deki aksiyon formunun operasyon-detayına taşınmış hâli:
 * aynı yazma yolu (useAddOperationInteraction → interactions.operation_id) ve aynı kural
 * ("Sonra aranacak" seçilince takip tarihi ZORUNLU; takip TALEP bazında next_action_at'e yazılır).
 */
export function OperationActionForm({ operationId, customerId }: { operationId: number; customerId: number }) {
  const channels = useChannelOptions()
  const outcomes = useOutcomeOptions()
  const addAction = useAddOperationInteraction()
  const updateOp = useUpdateOperation()
  const [channelId, setChannelId] = useState<string | null>(null)
  const [outcomeId, setOutcomeId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [followUp, setFollowUp] = useState<string | null>(null)

  const outcomeKey = outcomes.data?.find((o) => String(o.id) === outcomeId)?.key
  const followUpRequired = outcomeKey === 'sonra_aranacak'
  const busy = addAction.isPending || updateOp.isPending

  async function save() {
    const text = note.trim()
    if (!text && !outcomeId) { toast.error('Not ya da sonuç girin.'); return }
    if (channelId == null) { toast.error('Kanal seçin.'); return }
    // "Sonra aranacak" → takip tarihi zorunlu (Hızlı Çalışma ile aynı kural).
    if (followUpRequired && !followUp) { toast.error('“Sonra aranacak” için sonraki takip tarihi zorunlu.'); return }
    try {
      await addAction.mutateAsync({
        operation_id: operationId, customer_id: customerId, channel_id: Number(channelId),
        outcome_id: outcomeId ? Number(outcomeId) : null, direction: 'outbound',
        occurred_at: new Date().toISOString(), summary: text || null,
      })
      // Takip tarihi TALEP bazında (operations.next_action_at) — müşteri-bazlı değil.
      if (followUp) await updateOp.mutateAsync({ id: operationId, next_action_at: `${followUp}T09:00:00` })
      setNote(''); setOutcomeId(null); setChannelId(null); setFollowUp(null)
      toast.success(followUp ? 'Aksiyon eklendi, takip tarihi ayarlandı.' : 'Aksiyon eklendi.')
    } catch (err) { toast.error(await toUserMessage(err)) }
  }

  return (
    <div className="border-border bg-subtle space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <MessageCirclePlus className="size-4" /> Aksiyon ekle
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <SearchableSelect options={(channels.data ?? []).map((ch) => ({ value: String(ch.id), label: ch.label }))}
          value={channelId} onChange={setChannelId} placeholder="Kanal" />
        <SearchableSelect clearable options={(outcomes.data ?? []).map((o) => ({ value: String(o.id), label: o.label }))}
          value={outcomeId} onChange={setOutcomeId} placeholder="Sonuç" />
      </div>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
        placeholder="Görüşmede ne konuşuldu? (ör. müşteri aradı, 200 adet için teklif istedi)" className="text-sm" />
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Label className="text-text-muted text-xs">Sonraki takip{followUpRequired && <span className="text-destructive"> *</span>}</Label>
          <DatePicker value={followUp} onChange={setFollowUp} placeholder={followUpRequired ? 'Zorunlu' : 'Opsiyonel'} clearable />
        </div>
        <Button size="sm" onClick={() => void save()} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Kaydet
        </Button>
      </div>
    </div>
  )
}
