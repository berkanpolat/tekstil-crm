import { useState } from 'react'
import { FileDown, Loader2, Eye, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { getSignedUrl } from '@/hooks/useFiles'
import { useDraftQuote } from '@/hooks/useQuotes'
import {
  buildAutoQuote, autoQuoteDocData, fetchPreviewHtml, useGenerateDocument, type AutoQuoteData,
} from '@/hooks/useDocuments'

/**
 * B3 — Tek-tuş otomatik teklif: "Teklif oluştur ve indir".
 * Maliyet kapısı (buildAutoQuote → gate):
 *  • all_costed → doğrudan üret + indir (ara ekran yok).
 *  • partial   → uyarı; eksik ürünler ADIYLA listelenir → "Eksikleri atla, gerisini üret" / "Vazgeç".
 *  • none      → teklif oluşmaz; hangi ürünlerin maliyeti eksik olduğu gösterilir.
 * Önizleme opsiyonel (PDF servisinden HTML önizleme, yeni sekme). Dosya adı v1.40.1 kuralıyla
 * üretimde damgalanır (MüşteriAdı-FiyatTeklifi.pdf).
 */
export function AutoQuoteButton({ operationId, variant = 'default', size = 'sm', className }:
  { operationId: number; variant?: 'default' | 'outline'; size?: 'sm' | 'default'; className?: string }) {
  const draft = useDraftQuote(operationId)
  const gen = useGenerateDocument()
  const [busy, setBusy] = useState(false)
  const [gateData, setGateData] = useState<AutoQuoteData | null>(null) // partial/none diyaloğu
  const hasDraft = !!draft.data

  async function downloadGenerated(fileId: number | null) {
    if (!fileId) return
    const { data: f } = await supabase.from('files').select('storage_path, original_name').eq('id', fileId).single()
    if (!f) return
    const url = await getSignedUrl('documents', f.storage_path, 60, f.original_name)
    const a = document.createElement('a'); a.href = url; a.download = f.original_name; document.body.appendChild(a); a.click(); a.remove()
  }

  async function generateAndDownload(d: AutoQuoteData, skipMissing: boolean) {
    setBusy(true)
    try {
      const r = await gen.mutateAsync({ operationId, typeKey: 'fiyat_teklifi', language: 'tr', data: autoQuoteDocData(d, { skipMissing }) })
      await downloadGenerated(r.file_id)
      toast.success(r.idempotent ? 'Teklif zaten üretilmişti — indiriliyor.' : 'Teklif üretildi ve indiriliyor.')
      setGateData(null)
    } catch (err) { toast.error(await toUserMessage(err)) } finally { setBusy(false) }
  }

  async function run() {
    if (!hasDraft) return
    setBusy(true)
    try {
      const d = await buildAutoQuote(operationId, draft.data!.data)
      if (d.gate.status === 'all_costed') { await generateAndDownload(d, false); return }
      setGateData(d) // partial / none → diyalog
      setBusy(false)
    } catch (err) { setBusy(false); toast.error(await toUserMessage(err)) }
  }

  async function preview() {
    if (!hasDraft) return
    setBusy(true)
    try {
      const d = await buildAutoQuote(operationId, draft.data!.data)
      const html = await fetchPreviewHtml('fiyat_teklifi', autoQuoteDocData(d, { skipMissing: d.gate.status !== 'all_costed' }), 'tr')
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) { toast.error(await toUserMessage(err)) } finally { setBusy(false) }
  }

  return (
    <>
      <div className={className ? className : 'flex items-center gap-2'}>
        <Button variant={variant} size={size} disabled={busy || !hasDraft} title={hasDraft ? undefined : 'Katalog taslağı yok — otomatik teklif yalnız katalogdan gelen taleplerde'} onClick={() => void run()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />} Teklif oluştur ve indir
        </Button>
        {hasDraft && (
          <Button variant="ghost" size={size} disabled={busy} title="Önizle (yeni sekme)" onClick={() => void preview()}>
            <Eye className="size-4" /> Önizle
          </Button>
        )}
      </div>

      {gateData && (
        <Dialog open onOpenChange={(o) => !o && setGateData(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className={gateData.gate.status === 'none' ? 'size-5 text-destructive' : 'size-5 text-warning-foreground'} />
                {gateData.gate.status === 'none' ? 'Maliyet girilmemiş — teklif oluşturulamaz' : 'Bazı ürünlerin maliyeti eksik'}
              </DialogTitle>
              <DialogDescription>
                {gateData.gate.status === 'none'
                  ? 'Seçili ürünlerin hiçbirinin maliyeti girilmemiş. Maliyet girilmeden teklif oluşturulamaz.'
                  : `${gateData.gate.costedCount} üründe maliyet var, ${gateData.gate.missingCount} üründe eksik. Eksikleri atlayıp gerisini üretebilirsiniz.`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div>
                <div className="text-text-muted mb-1.5 text-xs font-semibold uppercase tracking-wide">Maliyeti eksik ürünler</div>
                <ul className="space-y-1">
                  {gateData.gate.missingProducts.map((n, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                      <span className="bg-destructive/70 size-1.5 rounded-full" /> {n}
                    </li>
                  ))}
                </ul>
              </div>
              {gateData.gate.status === 'partial' && gateData.gate.costedProducts.length > 0 && (
                <div className="text-text-secondary text-xs">
                  Üretilecek ({gateData.gate.costedCount}): {gateData.gate.costedProducts.join(', ')}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setGateData(null)} disabled={busy}>{gateData.gate.status === 'none' ? 'Kapat' : 'Vazgeç'}</Button>
              {gateData.gate.status === 'partial' && (
                <Button onClick={() => void generateAndDownload(gateData, true)} disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />} Eksikleri atla, gerisini üret
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
