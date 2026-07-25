import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { ArrowRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSettingHistory } from '@/hooks/useSettings'
import type { Json } from '@/lib/database.types'

function fmt(v: Json): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return v === '' ? '(boş)' : v
  return JSON.stringify(v)
}

/** Bir ayarın değişiklik geçmişi (eski → yeni, kim, ne zaman). */
export function SettingHistoryDialog({
  settingKey,
  label,
  onClose,
}: {
  settingKey: string | null
  label?: string
  onClose: () => void
}) {
  const { data, isLoading } = useSettingHistory(settingKey)

  return (
    <Dialog open={!!settingKey} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Değişiklik geçmişi</DialogTitle>
          <DialogDescription>{label ?? settingKey}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-text-secondary">Yükleniyor…</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-text-secondary">Henüz değişiklik yok.</p>
        ) : (
          <ul className="max-h-[50dvh] divide-y overflow-y-auto">
            {data.map((h) => (
              <li key={h.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <code className="bg-muted rounded px-1.5 py-0.5 text-xs">{fmt(h.old_value)}</code>
                  <ArrowRight className="text-text-muted size-3.5" />
                  <code className="bg-accent text-accent-foreground rounded px-1.5 py-0.5 text-xs">
                    {fmt(h.new_value)}
                  </code>
                </div>
                <div className="text-text-muted mt-1 text-xs">
                  {h.changed_by_name ?? 'Sistem'} ·{' '}
                  {format(new Date(h.changed_at), 'd MMM yyyy HH:mm', { locale: tr })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
