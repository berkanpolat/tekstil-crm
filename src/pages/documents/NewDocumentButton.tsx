import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { SearchableSelect, type SelectOption } from '@/components/shared/SearchableSelect'
import type { DocumentTypeKey } from '@/hooks/useDocuments'

const TYPE_OPTIONS: { value: DocumentTypeKey; label: string }[] = [
  { value: 'fiyat_teklifi', label: 'Fiyat Teklifi' },
  { value: 'siparis_onay', label: 'Sipariş Onay Formu' },
  { value: 'numune_etiketi', label: 'Numune Etiketi' },
  { value: 'siparis_formu', label: 'Sipariş Formu' },
  { value: 'koli_ustu', label: 'Koli Üstü Etiketi' },
]

/** Son operasyonlar — cmdk yerel olarak kod/başlıkta filtreler (bağlantı opsiyonel). */
function useRecentOperations() {
  return useQuery({
    queryKey: ['operation-recent-options'],
    queryFn: async (): Promise<SelectOption[]> => {
      const { data } = await supabase.from('operations').select('id, code, title')
        .is('deleted_at', null).order('created_at', { ascending: false }).limit(200)
      return (data ?? []).map((o) => ({ value: String(o.id), label: `${o.code}${o.title ? ' · ' + o.title : ''}`, keywords: o.code }))
    },
  })
}

/** Belgeler menüsü "Yeni belge": tip seçilir, operasyon bağlantısı OPSİYONEL (boşsa bağımsız).
 *  Seçim sonrası tam sayfa editöre (/belgeler/yeni/:tip) gider. */
export function NewDocumentButton() {
  const navigate = useNavigate()
  const [chooserOpen, setChooserOpen] = useState(false)
  const [typeKey, setTypeKey] = useState<DocumentTypeKey | null>(null)
  const [operationId, setOperationId] = useState<string | null>(null)
  const ops = useRecentOperations()

  function start() {
    if (!typeKey) return
    setChooserOpen(false)
    navigate(`/belgeler/yeni/${typeKey}${operationId ? `?op=${operationId}` : ''}`)
  }

  return (
    <>
      <Button onClick={() => { setTypeKey(null); setOperationId(null); setChooserOpen(true) }}>
        <Plus className="size-4" /> Yeni belge
      </Button>

      <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni belge</DialogTitle>
            <DialogDescription>Belge tipini seçin. Operasyon bağlantısı isteğe bağlıdır — boş bırakırsanız bağımsız belge üretilir.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <Label className="text-sm">Belge tipi</Label>
              <SearchableSelect options={TYPE_OPTIONS} value={typeKey} onChange={(v) => setTypeKey(v as DocumentTypeKey | null)} placeholder="Tip seçin" className="mt-1" />
            </div>
            <div>
              <Label className="text-sm">Operasyon (opsiyonel)</Label>
              <SearchableSelect options={ops.data ?? []} value={operationId} onChange={setOperationId}
                placeholder="Bağlantısız (bağımsız belge)" clearable className="mt-1" />
              <p className="mt-1 text-xs text-text-muted">Seçilirse bilinen alanlar operasyondan doldurulur.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChooserOpen(false)}>İptal</Button>
            <Button onClick={start} disabled={!typeKey}>Devam</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
