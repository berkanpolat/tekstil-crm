import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useHasPermission } from '@/hooks/useCatalog'
import {
  useArchiveCustomer,
  useHardDeleteCustomer,
  useCustomerDeletePreview,
} from '@/hooks/useCustomers'

/** Müşteri kartı tehlikeli aksiyonlar: Arşivle (mevcut yetki) + Kalıcı Sil (customers.delete). */
export function CustomerDangerActions({ customerId, customerName }: { customerId: number; customerName: string }) {
  const navigate = useNavigate()
  const canDelete = useHasPermission('customers.delete')
  const archive = useArchiveCustomer()
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [hardOpen, setHardOpen] = useState(false)

  return (
    <>
      <Button variant="outline" onClick={() => setArchiveOpen(true)}>
        <Archive className="size-4" /> Arşivle
      </Button>
      {canDelete.data && (
        <Button variant="outline" className="text-destructive" onClick={() => setHardOpen(true)}>
          <Trash2 className="size-4" /> Kalıcı Sil
        </Button>
      )}

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={`${customerName} arşivlensin mi?`}
        description="Müşteri ve açık operasyonları listelerden ve raporlardan gizlenir. Verisi durur; arşivden çıkararak geri alınabilir."
        confirmLabel="Arşivle"
        onConfirm={async () => {
          try {
            await archive.mutateAsync(customerId)
            toast.success('Müşteri arşivlendi.')
            navigate('/musteriler')
          } catch (err) {
            toast.error(await toUserMessage(err))
          }
        }}
      />

      {hardOpen && (
        <HardDeleteDialog
          customerId={customerId}
          customerName={customerName}
          onClose={() => setHardOpen(false)}
          onDeleted={() => {
            setHardOpen(false)
            navigate('/musteriler')
          }}
        />
      )}
    </>
  )
}

const ROW_LABELS: [keyof PreviewCounts, string][] = [
  ['talep', 'Talep'],
  ['teklif', 'Teklif'],
  ['numune', 'Numune'],
  ['siparis', 'Sipariş'],
  ['belge', 'Belge'],
  ['etkilesim', 'Etkileşim'],
  ['dosya', 'Dosya'],
]
type PreviewCounts = {
  talep: number; teklif: number; numune: number; siparis: number
  belge: number; etkilesim: number; dosya: number
}

function HardDeleteDialog({
  customerId, customerName, onClose, onDeleted,
}: { customerId: number; customerName: string; onClose: () => void; onDeleted: () => void }) {
  const preview = useCustomerDeletePreview(customerId, true)
  const hardDelete = useHardDeleteCustomer()
  const [typed, setTyped] = useState('')
  const p = preview.data
  const canDelete = p?.can_hard_delete ?? false
  const nameMatches = typed.trim() === customerName.trim()

  async function doDelete() {
    try {
      await hardDelete.mutateAsync(customerId)
      toast.success('Müşteri kalıcı olarak silindi.')
      onDeleted()
    } catch (err) {
      toast.error(await toUserMessage(err))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-destructive">Kalıcı Sil — {customerName}</DialogTitle>
        </DialogHeader>

        {preview.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-text-muted"><Loader2 className="size-4 animate-spin" /> Yükleniyor…</div>
        ) : !p ? (
          <p className="py-4 text-sm text-destructive">Önizleme alınamadı.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">Bu işlem <b>geri alınamaz</b>. Silinecekler:</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              {ROW_LABELS.map(([k, label]) => (
                <div key={k} className="flex items-center justify-between border-b border-border py-1">
                  <span className="text-text-muted">{label}</span>
                  <span className="font-medium tabular-nums text-foreground">{p[k]}</span>
                </div>
              ))}
            </div>

            {!canDelete && (
              <div className="flex items-start gap-2 rounded-md bg-warning-badge px-3 py-2 text-sm text-warning-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  Bu müşterinin cari hareketi ({p.cari_hareket}) veya ödemesi ({p.odeme}) var —
                  muhasebe izi korunmalı. <b>Kalıcı silinemez, arşivleyin.</b>
                </span>
              </div>
            )}

            {canDelete && (
              <div>
                <Label className="text-xs text-text-muted">
                  Onaylamak için müşteri adını yazın: <span className="font-mono text-foreground">{customerName}</span>
                </Label>
                <Input value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1" placeholder={customerName} autoFocus />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button
            variant="destructive"
            disabled={!canDelete || !nameMatches || hardDelete.isPending}
            onClick={() => void doDelete()}
          >
            {hardDelete.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Kalıcı Sil
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
