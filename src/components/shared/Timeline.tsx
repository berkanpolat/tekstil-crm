import type { ReactNode } from 'react'
import { Circle, type LucideIcon } from 'lucide-react'
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
}

const DOT_TONE: Record<NonNullable<TimelineItem['tone']>, string> = {
  default: 'text-text-muted',
  success: 'text-success-foreground',
  warning: 'text-warning-foreground',
  danger: 'text-danger-foreground',
  info: 'text-info-foreground',
}

/** Kronolojik olay akışı. Faz 1'de müşteri kartında kullanılacak. */
export function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-text-secondary">Henüz kayıt yok.</p>
  }
  return (
    <ol className="relative space-y-0">
      {items.map((item, idx) => {
        const Icon = item.icon ?? Circle
        const last = idx === items.length - 1
        return (
          <li key={item.id} className="relative flex gap-3 pb-5">
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
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                {item.timestamp && (
                  <span className="text-text-muted shrink-0 text-xs">{item.timestamp}</span>
                )}
              </div>
              {item.description && (
                <div className="mt-0.5 text-sm text-text-secondary">{item.description}</div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
