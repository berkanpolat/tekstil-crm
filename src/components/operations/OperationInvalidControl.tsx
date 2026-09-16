import { useState } from 'react'
import { Ban, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { toUserMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useCancellationReasons, useCancelOperation } from '@/hooks/useOperations'

/** Talep başlığında "Geçersiz işaretle" (yalnız is_invalid sebepler). İptal/kayıp AKIŞINDAN
 *  ayrı: geçersiz = sahte/segment dışı, dönüşüm oranından çıkar. İşaretliyse rozet gösterir. */
export function OperationInvalidControl({ op }: { op: { id: number; cancelled_at: string | null; cancellation_reason_id: number | null; cancellation_note: string | null } }) {
  const reasons = useCancellationReasons()
  const cancel = useCancelOperation()
  const [open, setOpen] = useState(false)
  const [reasonId, setReasonId] = useState<string | null>(null)
  const [note, setNote] = useState('')

  if (op.cancelled_at) {
    const r = reasons.data?.find((x) => x.id === op.cancellation_reason_id)
    const invalid = r?.is_invalid ?? false
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
        invalid ? 'bg-danger/10 text-danger-foreground' : 'bg-muted text-text-muted')}
        title={op.cancellation_note ?? undefined}>
        <Ban className="size-3.5" /> {invalid ? 'Geçersiz' : 'İptal'}{r ? ` · ${r.label}` : ''}
      </span>
    )
  }

  const invalidReasons = (reasons.data ?? []).filter((r) => r.is_invalid)
  async function submit() {
    if (!reasonId) { toast.error('Sebep seçin.'); return }
    try {
      await cancel.mutateAsync({ id: op.id, reasonId: Number(reasonId), note: note.trim() || null })
      toast.success('Talep geçersiz olarak işaretlendi.'); setOpen(false)
    } catch (err) { toast.error(await toUserMessage(err)) }
  }

  return (
    <>
      <Button size="sm" variant="ghost" className="text-text-muted" onClick={() => setOpen(true)}>
        <Ban className="size-4" /> Geçersiz işaretle
      </Button>
      {open && (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Talebi geçersiz işaretle</DialogTitle>
              <DialogDescription>
                Sahte ya da yapamayacağımız segmentteki talepler. Dönüşüm oranından çıkarılır; toplam
                gelen talep sayısında görünmeye devam eder. (Kayıp/iptal ile karıştırmayın.)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Sebep <span className="text-destructive">*</span></Label>
                <SearchableSelect options={invalidReasons.map((r) => ({ value: String(r.id), label: r.label }))}
                  value={reasonId} onChange={setReasonId} placeholder="Geçersizlik sebebi" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Not</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="ör. numara sahte / ürün grubumuz dışı" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
              <Button variant="destructive" disabled={!reasonId || cancel.isPending} onClick={() => void submit()}>
                {cancel.isPending ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />} Geçersiz işaretle
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
