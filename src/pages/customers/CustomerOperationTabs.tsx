import { useNavigate } from 'react-router-dom'
import { Inbox, FileText, Shirt, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STATUS_TONE_CLASS, type StatusTone } from '@/lib/statuses'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { useCustomerOperations, useCustomerChildRecords } from '@/hooks/useCustomerRecords'

const toneClass = (c: string | null): string =>
  c && (['success', 'warning', 'danger', 'info', 'neutral'] as string[]).includes(c)
    ? STATUS_TONE_CLASS[c as StatusTone] : 'bg-neutral-badge text-neutral-badge-foreground'
const fmt = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })

/** Müşteri kartı — Talepler (operasyonlar). */
export function CustomerTaleplerTab({ customerId }: { customerId: number }) {
  const { data, isLoading } = useCustomerOperations(customerId)
  const navigate = useNavigate()
  if (isLoading) return <Skeleton className="h-40 w-full" />
  if (!data || data.length === 0) return <EmptyState icon={Inbox} title="Talep yok" description="Bu müşteriye ait talep bulunmuyor." />
  return (
    <ul className="divide-border max-w-2xl divide-y rounded-lg border">
      {data.map((o) => (
        <li key={o.id} onClick={() => navigate(`/talepler/${o.id}`)} className="hover:bg-muted/40 flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{o.title ?? '—'}</div>
            <div className="text-text-muted font-mono text-xs">{o.code} · {fmt(o.created_at)}</div>
          </div>
          {o.stage_label && <span className={cn('shrink-0 rounded px-2 py-0.5 text-xs font-medium', toneClass(o.stage_color))}>{o.stage_label}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Müşteri kartı — Teklif / Numune / Sipariş (operasyonlar üzerinden). */
export function CustomerChildTab({ customerId, kind }: { customerId: number; kind: 'quotes' | 'samples' | 'orders' }) {
  const { data, isLoading } = useCustomerChildRecords(kind, customerId)
  const navigate = useNavigate()
  const meta = { quotes: { icon: FileText, title: 'Teklif yok' }, samples: { icon: Shirt, title: 'Numune yok' }, orders: { icon: ClipboardList, title: 'Sipariş yok' } }[kind]
  if (isLoading) return <Skeleton className="h-40 w-full" />
  if (!data || data.length === 0) return <EmptyState icon={meta.icon} title={meta.title} description="Bu müşterinin operasyonlarında ilgili kayıt yok." />
  return (
    <ul className="divide-border max-w-2xl divide-y rounded-lg border">
      {data.map((r) => (
        <li key={`${kind}-${r.id}`} onClick={() => navigate(`/talepler/${r.operation_id}`)} className="hover:bg-muted/40 flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">{r.label}</div>
            <div className="text-text-muted font-mono text-xs">{r.operation_code} · {fmt(r.created_at)}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {r.amount && <span className="text-text-secondary text-sm tabular-nums">{r.amount}</span>}
            {r.status_label && <span className={cn('rounded px-2 py-0.5 text-xs font-medium', toneClass(r.status_color))}>{r.status_label}</span>}
          </div>
        </li>
      ))}
    </ul>
  )
}
