import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAiAssist } from '@/hooks/useAi'
import { buildReportInterpretationPayload } from '@/lib/aiPayloads'
import { useRequestsMetric, useQuotesMetric, useFunnelMetric, type Period } from '@/hooks/useMetrics'

/** P7.11 — Rapor yorumu (YZ). Yalnız operasyonel ÖZET sayılar modele gider
 *  (para/isim yok). Edge fn'de 'rapor_yorumu' yoksa sessizce devre dışı kalır. */
export function ReportAiInsight({ period }: { period: Period }) {
  const req = useRequestsMetric(period)
  const quo = useQuotesMetric(period)
  const fun = useFunnelMetric(period)
  const ai = useAiAssist()
  const [text, setText] = useState<string | null>(null)
  const [gone, setGone] = useState(false)
  const ready = !!req.data && !!quo.data && !!fun.data

  async function run() {
    if (!req.data || !quo.data || !fun.data) return
    const decided = quo.data.accepted + quo.data.rejected
    const payload = buildReportInterpretationPayload({
      period: period.label,
      requests: { total: req.data.total, prev_total: req.data.prev_total, sla_rate: req.data.sla_rate, sla_met: req.data.sla_met_count, sla_missed: req.data.sla_missed_count, sla_pending: req.data.sla_pending_count, avg_response_hours: req.data.avg_response_hours },
      quotes: { sent: quo.data.sent, accepted: quo.data.accepted, rejected: quo.data.rejected, pending: quo.data.pending, conversion: decided > 0 ? (100 * quo.data.accepted) / decided : null },
      funnel: { requests: fun.data.requests, quotes: fun.data.quotes, samples: fun.data.samples, orders: fun.data.orders },
    })
    const r = await ai.mutateAsync(payload)
    if (!r.available) { setGone(true); return }   // özellik yok → kartı gizle
    if (r.status === 'limit') { setText('Günlük YZ kullanımı doldu — yarın tekrar deneyin.'); return }
    setText(r.result ?? 'Yorum üretilemedi.')
  }

  if (gone) return null
  return (
    <section className="border-accent-primary/30 bg-accent-primary/5 rounded-lg border p-4 print:hidden">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-accent-primary flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4" /> YZ dönem yorumu
        </h3>
        <Button size="sm" variant="outline" disabled={!ready || ai.isPending} onClick={() => void run()}>
          {ai.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {text ? 'Yeniden yorumla' : 'YZ ile yorumla'}
        </Button>
      </div>
      {text
        ? <p className="mt-2 text-sm leading-relaxed text-foreground">{text}</p>
        : <p className="text-text-secondary mt-2 text-xs">Dönemin operasyonel özetini (talep, SLA, teklif dönüşümü, huni) yapay zekâ ile yorumlar. Para ve kişisel veri gönderilmez.</p>}
    </section>
  )
}
