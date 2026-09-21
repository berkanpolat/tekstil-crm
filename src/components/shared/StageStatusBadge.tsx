import { cn } from '@/lib/utils'
import { STATUS_TONE_CLASS, type StatusTone } from '@/lib/statuses'

/**
 * İki kademeli durum rozeti — TEK kaynak (liste, kart, Hızlı Çalışma aynı bileşeni kullanır).
 * Renk DURUM tonundan gelir (H3.3, stage_statuses.color); durum yoksa aşama rengine düşer.
 * Aynı aşamanın durumları böylece renkle ayrışır (Teklif·Bekliyor gri ≠ Teklif·İletildi mavi).
 * Renk DESTEKLEYİCİ: metin her zaman iki kademeyi yazar → "Aşama · Durum".
 */
const toneClass = (c: string | null | undefined): string =>
  c && (['success', 'warning', 'danger', 'info', 'neutral'] as string[]).includes(c)
    ? STATUS_TONE_CLASS[c as StatusTone] : 'bg-neutral-badge text-neutral-badge-foreground'

export function StageStatusBadge({
  stageLabel, stageColor, statusLabel, statusColor, className,
}: {
  stageLabel: string | null | undefined
  stageColor: string | null | undefined
  statusLabel?: string | null
  statusColor?: string | null
  className?: string
}) {
  if (!stageLabel) return <span className="text-text-muted text-xs">—</span>
  // Renk önceliği: durum tonu → aşama rengi (durum yoksa).
  const tone = toneClass(statusColor ?? stageColor)
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium', tone, className)}>
      <span>{stageLabel}</span>
      {statusLabel && <><span className="opacity-50">·</span><span className="font-normal">{statusLabel}</span></>}
    </span>
  )
}
