import { useState, type ReactNode } from 'react'
import { Circle, ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TimelineItem {
  id: string | number
  title: ReactNode
  description?: ReactNode
  /** Sağda/altta gösterilecek zaman metni. */
  timestamp?: string
  icon?: LucideIcon
  /** Nokta rengi tonu. */
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  /** Tarih grubu başlığı (Bugün / Dün / Bu hafta / Daha eski). Değişince ayraç çizilir. */
  group?: string
  /** Detay varsayılan açık mı (son N olay için true). */
  defaultOpen?: boolean
}

const DOT_TONE: Record<NonNullable<TimelineItem['tone']>, string> = {
  default: 'text-text-muted',
  success: 'text-success-foreground',
  warning: 'text-warning-foreground',
  danger: 'text-danger-foreground',
  info: 'text-info-foreground',
}

function Row({ item, last }: { item: TimelineItem; last: boolean }) {
  const Icon = item.icon ?? Circle
  const hasDetail = item.description != null && item.description !== false
  const [open, setOpen] = useState(() => hasDetail && !!item.defaultOpen)

  return (
    <li className="relative flex gap-3 pb-5">
      {!last && <span className="bg-border absolute top-6 left-[11px] h-full w-px" aria-hidden />}
      <span
        className={cn(
          'bg-card relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border',
          DOT_TONE[item.tone ?? 'default'],
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline justify-between gap-2">
          {hasDetail ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="group flex min-w-0 items-center gap-1 text-left"
              aria-expanded={open}
            >
              <ChevronRight
                className={cn('text-text-muted size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
                aria-hidden
              />
              <span className="truncate text-sm font-medium text-foreground group-hover:underline">{item.title}</span>
            </button>
          ) : (
            <p className="truncate pl-[18px] text-sm font-medium text-foreground">{item.title}</p>
          )}
          {item.timestamp && <span className="text-text-muted shrink-0 text-xs">{item.timestamp}</span>}
        </div>
        {hasDetail && open && <div className="mt-0.5 pl-[18px] text-sm text-text-secondary">{item.description}</div>}
      </div>
    </li>
  )
}

/** Kronolojik olay akışı. Tarih gruplu (grup değişince başlık), detay katlanabilir. */
export function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-text-secondary">Henüz kayıt yok.</p>
  }
  return (
    <div className="space-y-4">
      {groupItems(items).map((grp) => (
        <div key={grp.key}>
          {grp.label && (
            <h4 className="text-text-muted mb-2 text-xs font-semibold tracking-wide uppercase">{grp.label}</h4>
          )}
          <ol className="relative space-y-0">
            {grp.items.map((item, idx) => (
              <Row key={item.id} item={item} last={idx === grp.items.length - 1} />
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}

/** Ardışık aynı `group` değerlerini bir bölüme toplar (sıra korunur). */
function groupItems(items: TimelineItem[]): { key: string; label?: string; items: TimelineItem[] }[] {
  const out: { key: string; label?: string; items: TimelineItem[] }[] = []
  for (const it of items) {
    const label = it.group
    const prev = out[out.length - 1]
    if (prev && prev.label === label) prev.items.push(it)
    else out.push({ key: `${label ?? ''}-${it.id}`, label, items: [it] })
  }
  return out
}
