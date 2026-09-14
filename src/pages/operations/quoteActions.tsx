import { FileDown, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import type { AutoQuoteData } from '@/hooks/useDocuments'

/** Maliyet kapısı diyaloğu — partial (eksikleri atla) / none (üretilemez). */
export function QuoteGateDialog({ data, busy, onClose, onConfirm }:
  { data: AutoQuoteData; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const g = data.gate
  const none = g.status === 'none'
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className={none ? 'size-5 text-destructive' : 'text-warning-foreground size-5'} />
            {none ? 'Maliyet girilmemiş — teklif oluşturulamaz' : 'Bazı ürünlerin maliyeti eksik'}
          </DialogTitle>
          <DialogDescription>
            {none
              ? 'Seçili ürünlerin hiçbirinin maliyeti girilmemiş. Maliyet girilmeden teklif oluşturulamaz.'
              : `${g.costedCount} üründe maliyet var, ${g.missingCount} üründe eksik. Eksikleri atlayıp gerisini üretebilirsiniz.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <div className="text-text-muted mb-1.5 text-xs font-semibold uppercase tracking-wide">Maliyeti eksik ürünler</div>
            <ul className="max-h-52 space-y-1 overflow-auto">
              {g.missingProducts.map((n, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                  <span className="bg-destructive/70 size-1.5 shrink-0 rounded-full" /> {n}
                </li>
              ))}
            </ul>
          </div>
          {!none && g.costedCount > 0 && (
            <div className="text-text-secondary text-xs">Üretilecek ürün sayısı: {g.costedCount}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>{none ? 'Kapat' : 'Vazgeç'}</Button>
          {!none && (
            <Button onClick={onConfirm} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />} Eksikleri atla, gerisini üret
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
