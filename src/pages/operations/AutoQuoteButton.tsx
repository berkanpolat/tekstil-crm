import { FileDown, Loader2, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDraftQuote } from '@/hooks/useQuotes'
import { buildAutoQuote } from '@/hooks/useDocuments'
import { useQuoteRunner } from './quoteRunner'
import { QuoteGateDialog } from './quoteActions'

/**
 * B3 — Tek-tuş otomatik teklif: "Teklif oluştur ve indir".
 * Maliyet kapısı (buildAutoQuote → gate):
 *  • all_costed → doğrudan üret + indir (ara ekran yok).
 *  • partial   → uyarı; eksik ürünler ADIYLA listelenir → "Eksikleri atla, gerisini üret" / "Vazgeç".
 *  • none      → teklif oluşmaz; hangi ürünlerin maliyeti eksik olduğu gösterilir.
 * Önizleme opsiyonel. Dosya adı üretimde v1.40.1 kuralıyla (MüşteriAdı-FiyatTeklifi.pdf).
 */
export function AutoQuoteButton({ operationId, variant = 'default', size = 'sm', className }:
  { operationId: number; variant?: 'default' | 'outline'; size?: 'sm' | 'default'; className?: string }) {
  const draft = useDraftQuote(operationId)
  const { busy, gateData, setGateData, run, preview, generateAndDownload } = useQuoteRunner(operationId)
  const hasDraft = !!draft.data
  const build = () => buildAutoQuote(operationId, draft.data!.data)

  return (
    <>
      <div className={className ?? 'flex items-center gap-2'}>
        <Button variant={variant} size={size} disabled={busy || !hasDraft} title={hasDraft ? undefined : 'Katalog taslağı yok — otomatik teklif yalnız katalogdan gelen taleplerde'} onClick={() => void run(build)}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />} Teklif oluştur ve indir
        </Button>
        {hasDraft && (
          <Button variant="ghost" size={size} disabled={busy} title="Önizle (yeni sekme)" onClick={() => void preview(build)}>
            <Eye className="size-4" /> Önizle
          </Button>
        )}
      </div>
      {gateData && (
        <QuoteGateDialog data={gateData} busy={busy} onClose={() => setGateData(null)} onConfirm={() => void generateAndDownload(gateData, true)} />
      )}
    </>
  )
}
