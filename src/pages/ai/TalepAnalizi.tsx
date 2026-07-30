import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { toUserMessage } from '@/lib/errors'
import { buildTalepAnalysisPayload } from '@/lib/aiPayloads'
import { useAiAssist } from '@/hooks/useAi'
import { AiSuggestionCard } from './AiSuggestionCard'

const asStr = (v: unknown) => v == null ? '—' : Array.isArray(v) ? (v.length ? v.join(', ') : '—') : String(v)

/** P6.8 — Talep notundan ürün tipi/adet/renk çıkarma önerisi. İZİNLİ: yalnız talep başlığı+açıklaması. */
export function TalepAnalizi({ operationId }: { operationId: number }) {
  const ai = useAiAssist()
  const [result, setResult] = useState<{ fields: Record<string, unknown>; requestId: number | null } | null>(null)
  const [note, setNote] = useState('')

  async function run() {
    setNote(''); setResult(null)
    try {
      const { data: o } = await supabase.from('operations').select('id, title, description').eq('id', operationId).single()
      const payload = buildTalepAnalysisPayload({ operation: o ?? {} })
      const r = await ai.mutateAsync(payload)
      if (!r.available) { setNote('Yapay zekâ şu an kullanılamıyor.'); return }
      if (r.status === 'limit') { setNote(r.error ?? 'Günlük YZ sınırı doldu.'); return }
      let fields: Record<string, unknown> = {}
      try { fields = JSON.parse(String(r.result ?? '{}').replace(/```json|```/g, '').trim()) } catch { /* boş */ }
      setResult({ fields, requestId: r.request_id ?? null })
    } catch (e) { toast.error(await toUserMessage(e)) }
  }

  return (
    <div className="space-y-3">
      {!result && (
        <Button variant="outline" size="sm" onClick={() => void run()} disabled={ai.isPending}>
          {ai.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} YZ ile analiz et
        </Button>
      )}
      {note && <p className="text-xs text-warning-foreground">{note}</p>}
      {result && (
        <AiSuggestionCard title="Talep analizi" rationale="talebin başlığı ve açıklaması" requestId={result.requestId}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-text-muted">Ürün tipi</dt><dd>{asStr(result.fields.urun_tipi)}</dd>
            <dt className="text-text-muted">Adet</dt><dd>{asStr(result.fields.adet)}</dd>
            <dt className="text-text-muted">Renkler</dt><dd>{asStr(result.fields.renkler)}</dd>
            <dt className="text-text-muted">Notlar</dt><dd>{asStr(result.fields.notlar)}</dd>
          </dl>
        </AiSuggestionCard>
      )}
    </div>
  )
}
