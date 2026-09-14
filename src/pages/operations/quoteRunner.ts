import { useState } from 'react'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { getSignedUrl } from '@/hooks/useFiles'
import { autoQuoteDocData, fetchPreviewHtml, useGenerateDocument, type AutoQuoteData } from '@/hooks/useDocuments'

/**
 * Otomatik teklif ortak yürütücüsü (tek talep + çoklu talep birleştirme paylaşır).
 * gate akışı: all_costed → üret+indir; partial/none → diyalog (QuoteGateDialog).
 * generationOperationId: tek talepte operasyon id'si; çoklu birleştirmede null (BAĞIMSIZ belge).
 */
export function useQuoteRunner(generationOperationId: number | null) {
  const gen = useGenerateDocument()
  const [busy, setBusy] = useState(false)
  const [gateData, setGateData] = useState<AutoQuoteData | null>(null)

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
      const r = await gen.mutateAsync({ operationId: generationOperationId, typeKey: 'fiyat_teklifi', language: 'tr', data: autoQuoteDocData(d, { skipMissing }) })
      await downloadGenerated(r.file_id)
      toast.success(r.idempotent ? 'Teklif zaten üretilmişti — indiriliyor.' : 'Teklif üretildi ve indiriliyor.')
      setGateData(null)
    } catch (err) { toast.error(await toUserMessage(err)) } finally { setBusy(false) }
  }

  /** build() → gate'e göre üret ya da diyalog aç. */
  async function run(build: () => Promise<AutoQuoteData>) {
    setBusy(true)
    try {
      const d = await build()
      if (d.gate.status === 'all_costed') { await generateAndDownload(d, false); return }
      setGateData(d) // partial / none → diyalog
      setBusy(false)
    } catch (err) { setBusy(false); toast.error(await toUserMessage(err)) }
  }

  /** Önizleme: PDF servisinden HTML → yeni sekme (eksikler atlanır). */
  async function preview(build: () => Promise<AutoQuoteData>) {
    setBusy(true)
    try {
      const d = await build()
      const html = await fetchPreviewHtml('fiyat_teklifi', autoQuoteDocData(d, { skipMissing: d.gate.status !== 'all_costed' }), 'tr')
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) { toast.error(await toUserMessage(err)) } finally { setBusy(false) }
  }

  return { busy, gateData, setGateData, run, preview, generateAndDownload }
}
