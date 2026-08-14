import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { useQuoteRejectionReasonOptions } from '@/hooks/useQuotes'

// Teklif kabul/red diyalogları — TEK KAYNAK. QuotesTab (operasyon detayı) ve
// gösterge paneli aynı bileşeni kullanır; iki kopya iki farklı davranışa dönüşmesin.

/** Kabulde sıradaki aşama seçimi. 'mark' = aşama değişmez, yalnız işaretlenir. */
export type AcceptChoice = 'numune' | 'siparis' | 'mark'

const ACCEPT_OPTIONS: { key: AcceptChoice; label: string; hint: string }[] = [
  { key: 'numune', label: 'Numune', hint: 'Numune aşamasına geç (varsayılan)' },
  { key: 'siparis', label: 'Sipariş', hint: 'Doğrudan sipariş aşamasına geç' },
  { key: 'mark', label: 'Şimdilik sadece işaretle', hint: 'Aşama değişmez; teklif yalnız kabul olarak işaretlenir' },
]

export function QuoteAcceptDialog({ onClose, onAccept }: {
  onClose: () => void; onAccept: (choice: AcceptChoice) => void
}) {
  const [choice, setChoice] = useState<AcceptChoice>('numune')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Teklif kabul edildi</DialogTitle>
          <DialogDescription>Sıradaki aşamayı seçin.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {ACCEPT_OPTIONS.map((o) => (
            <label key={o.key}
              className={cn('flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm transition-colors',
                choice === o.key ? 'border-accent-primary bg-accent-pale' : 'border-border hover:bg-muted/50')}>
              <input type="radio" name="accept-stage" className="accent-accent-primary mt-0.5"
                checked={choice === o.key} onChange={() => setChoice(o.key)} />
              <span>
                <span className="text-foreground block font-medium">{o.label}</span>
                <span className="text-text-muted block text-xs">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button onClick={() => onAccept(choice)}>Onayla</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function QuoteRejectDialog({ onClose, onReject }: {
  onClose: () => void; onReject: (reasonId: number, note: string) => void
}) {
  const reasons = useQuoteRejectionReasonOptions()
  const [reasonId, setReasonId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Teklif reddedildi</DialogTitle>
          <DialogDescription>Red nedeni zorunlu — sebepsiz reddetme olmaz.</DialogDescription>
        </DialogHeader>
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
          <Button variant="destructive" disabled={!reasonId}
            onClick={() => reasonId ? onReject(Number(reasonId), note) : toast.error('Red nedeni girin.')}>
            Reddedildi işaretle</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
