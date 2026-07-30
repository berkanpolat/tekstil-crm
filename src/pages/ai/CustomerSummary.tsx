import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { toUserMessage } from '@/lib/errors'
import { buildCustomerSummaryPayload } from '@/lib/aiPayloads'
import { useAiAssist } from '@/hooks/useAi'
import { AiSuggestionCard } from './AiSuggestionCard'

/**
 * P6.8 — "Bu müşteriyle şimdiye kadar ne oldu" özeti. İZİN-LİSTESİ: yalnız kimlik/konum +
 * AÇIK notlar + görüşme özetleri modele gider. Cari bakiye / sipariş tutarı / maliyet / İÇ NOT GİTMEZ.
 */
export function CustomerSummary({ customerId }: { customerId: number }) {
  const ai = useAiAssist()
  const [result, setResult] = useState<{ text: string; requestId: number | null } | null>(null)
  const [note, setNote] = useState('')

  async function run() {
    setNote(''); setResult(null)
    try {
      // İZİNLİ alanlar — ayrı ayrı, dar select (finans/maliyet tabloları HİÇ sorgulanmaz)
      const [{ data: c }, { data: notes }, { data: ints }] = await Promise.all([
        supabase.from('customers').select('id, company_name, full_name, city').eq('id', customerId).single(),
        supabase.from('notes').select('body, is_internal').eq('entity_type', 'customer').eq('entity_id', customerId).is('deleted_at', null),
        supabase.from('interactions').select('summary').eq('entity_type', 'customer').eq('entity_id', customerId).is('deleted_at', null).limit(50),
      ])
      const payload = buildCustomerSummaryPayload({ customer: c ?? {}, notes: notes ?? [], interactions: ints ?? [] })
      const r = await ai.mutateAsync(payload)
      if (!r.available) { setNote('Yapay zekâ şu an kullanılamıyor.'); return }
      if (r.status === 'limit') { setNote(r.error ?? 'Günlük YZ sınırı doldu.'); return }
      setResult({ text: r.result ?? '', requestId: r.request_id ?? null })
    } catch (e) { toast.error(await toUserMessage(e)) }
  }

  return (
    <div className="space-y-3">
      {!result && (
        <Button variant="outline" size="sm" onClick={() => void run()} disabled={ai.isPending}>
          {ai.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} YZ ile özetle
        </Button>
      )}
      {note && <p className="text-xs text-warning-foreground">{note}</p>}
      {result && (
        <AiSuggestionCard title="Müşteri özeti" rationale="müşterinin açık notları ve görüşme kayıtları" requestId={result.requestId}>
          <p className="whitespace-pre-wrap">{result.text}</p>
        </AiSuggestionCard>
      )}
    </div>
  )
}
