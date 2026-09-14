import { FileDown, Loader2, Eye, X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buildMultiAutoQuote } from '@/hooks/useDocuments'
import { useQuoteRunner } from './quoteRunner'
import { QuoteGateDialog } from './quoteActions'

export interface QuoteSelectionRow { id: number; customerId: number; customerName: string | null }

/**
 * B4 — Çoklu talep birleştirme çubuğu (talep listesi + Hızlı Çalışma listesi).
 * Seçili talepler tek PDF'te birleşir; YALNIZ aynı müşteri (farklıysa uyarı + pasif).
 * Üretim BAĞIMSIZ belge (operationId null) → dosya adı müşteri adından: MüşteriAdı-FiyatTeklifi.pdf.
 */
export function MultiAutoQuoteBar({ selected, onClear }: { selected: QuoteSelectionRow[]; onClear: () => void }) {
  const ids = selected.map((s) => s.id)
  const { busy, gateData, setGateData, run, preview, generateAndDownload } = useQuoteRunner(null)
  if (selected.length === 0) return null

  const customers = [...new Set(selected.map((s) => s.customerId))]
  const sameCustomer = customers.length === 1
  const customerName = selected[0]?.customerName ?? null
  const build = () => buildMultiAutoQuote(ids)

  return (
    <>
      <div className="border-accent-primary/30 bg-accent-primary/5 flex flex-wrap items-center gap-3 rounded-lg border p-3">
        <span className="text-sm font-medium text-foreground">{selected.length} talep seçildi</span>
        {sameCustomer ? (
          <span className="text-text-secondary text-xs">Müşteri: {customerName ?? '—'} — tek PDF'te birleşecek</span>
        ) : (
          <span className="text-danger-foreground flex items-center gap-1.5 text-xs font-medium">
            <AlertTriangle className="size-3.5" /> Farklı müşteriler seçili — birleştirilemez. Tek müşterinin taleplerini seçin.
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {sameCustomer && (
            <Button variant="ghost" size="sm" disabled={busy} title="Önizle (yeni sekme)" onClick={() => void preview(build)}>
              <Eye className="size-4" /> Önizle
            </Button>
          )}
          <Button size="sm" disabled={busy || !sameCustomer} onClick={() => void run(build)}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />} Teklif oluştur ve indir
          </Button>
          <Button variant="ghost" size="icon" className="size-8" title="Seçimi temizle" onClick={onClear} disabled={busy}>
            <X className="size-4" />
          </Button>
        </div>
      </div>
      {gateData && (
        <QuoteGateDialog data={gateData} busy={busy} onClose={() => setGateData(null)} onConfirm={() => void generateAndDownload(gateData, true)} />
      )}
    </>
  )
}
