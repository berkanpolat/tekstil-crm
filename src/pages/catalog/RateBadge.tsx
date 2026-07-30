import { RefreshCw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useExchangeRates } from '@/hooks/useCatalog'

const fmtAge = (h: number) => h < 1 ? 'az önce' : h < 24 ? `${Math.round(h)} saat önce` : `${Math.round(h / 24)} gün önce`
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) : ''

/** QA#6c — Güncel USD kuru göstergesi (katalog + maliyet/fiyat ekranı):
 *  "TCMB 28.07: 34,20 ₺ · 2 saat önce". Stale ise sarı, blocked ise kırmızı. */
export function RateBadge({ className }: { className?: string }) {
  const { data, isLoading } = useExchangeRates()
  if (isLoading || !data?.USD) return null
  const tone = data.blocked ? 'border-danger text-danger-foreground' : data.stale ? 'border-warning text-warning-foreground' : 'border-border text-text-secondary'
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs', tone, className)}>
      {data.blocked ? <AlertTriangle className="size-3.5" /> : <RefreshCw className="size-3.5" />}
      <span>{data.source ?? 'TCMB'} {fmtDate(data.fetched_at)}: <b>1$ = {Number(data.USD).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</b></span>
      <span className="text-text-muted">· {fmtAge(data.age_hours)}</span>
    </span>
  )
}
