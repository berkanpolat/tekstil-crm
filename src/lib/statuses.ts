/**
 * Durum kaydı — TEK doğruluk kaynağı. StatusBadge bir durum anahtarı alır, etiket
 * ve rengini buradan bulur. Renkler tek yerden yönetilir (doküman kuralı). Modüller
 * kendi durumlarını buraya ekler; serbest metin/renk dağıtılmaz.
 */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export interface StatusDef {
  label: string
  tone: StatusTone
}

/** Faz 0 çekirdek durumları. Sonraki fazlar (talep/teklif/sipariş) genişletir. */
export const STATUS_REGISTRY: Record<string, StatusDef> = {
  active: { label: 'Aktif', tone: 'success' },
  inactive: { label: 'Pasif', tone: 'neutral' },
  pending: { label: 'Beklemede', tone: 'warning' },
  draft: { label: 'Taslak', tone: 'neutral' },
  approved: { label: 'Onaylı', tone: 'success' },
  rejected: { label: 'Reddedildi', tone: 'danger' },
  cancelled: { label: 'İptal', tone: 'danger' },
  in_progress: { label: 'Sürüyor', tone: 'info' },
  completed: { label: 'Tamamlandı', tone: 'success' },
  deleted: { label: 'Silindi', tone: 'danger' },
}

export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  danger: 'bg-danger text-danger-foreground',
  info: 'bg-info text-info-foreground',
  neutral: 'bg-neutral-badge text-neutral-badge-foreground',
}

export function resolveStatus(key: string, registry: Record<string, StatusDef> = STATUS_REGISTRY): StatusDef {
  return registry[key] ?? { label: key, tone: 'neutral' }
}
