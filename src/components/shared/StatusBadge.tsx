import { cn } from '@/lib/utils'
import {
  resolveStatus,
  STATUS_TONE_CLASS,
  type StatusDef,
  type StatusTone,
} from '@/lib/statuses'

interface StatusBadgeProps {
  /** Durum anahtarı (ör. 'active'). Etiket ve renk kayıttan bulunur. */
  status: string
  /** Modül kendi durum kaydını geçebilir. */
  registry?: Record<string, StatusDef>
  className?: string
}

/** Durum rozeti — pastel zemin + koyu metin. Renkler tek yerden (statuses.ts). */
export function StatusBadge({ status, registry, className }: StatusBadgeProps) {
  const def = resolveStatus(status, registry)
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        STATUS_TONE_CLASS[def.tone],
        className,
      )}
    >
      {def.label}
    </span>
  )
}

export type { StatusTone }
