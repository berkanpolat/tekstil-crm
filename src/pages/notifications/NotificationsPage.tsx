import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Info, AlertTriangle, AlertOctagon, CheckCheck, X, BellOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import {
  useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, useDismissNotification,
  type AppNotification,
} from '@/hooks/useNotifications'

const SEV = {
  info: { icon: Info, cls: 'text-info', label: 'Bilgi' },
  warning: { icon: AlertTriangle, cls: 'text-warning-foreground', label: 'Uyarı' },
  critical: { icon: AlertOctagon, cls: 'text-danger-foreground', label: 'Kritik' },
} as const

const fmt = (iso: string) => new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Bildirimler geçmişi (B.4) — filtre + okundu/kapat. */
export function NotificationsPage() {
  const navigate = useNavigate()
  const { data: all = [], isLoading } = useNotifications(200)
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const dismiss = useDismissNotification()
  const [severity, setSeverity] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const rows = useMemo(() => all.filter((n) =>
    (!severity || n.severity === severity) && (!status || (status === 'unread' ? !n.read_at : !!n.read_at))
  ), [all, severity, status])

  function open(n: AppNotification) {
    if (!n.read_at) markRead.mutate(n.id)
    if (n.action_url) navigate(n.action_url)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Bildirimler" description="Tüm bildirimler — açık dosya uyarıları ve süreç bildirimleri."
        action={<Button variant="outline" onClick={() => markAll.mutate()}><CheckCheck className="size-4" /> Tümünü okundu</Button>} />

      <FilterBar showClear={!!severity || !!status} onClear={() => { setSeverity(null); setStatus(null) }}>
        <SearchableSelect options={[{ value: 'critical', label: 'Kritik' }, { value: 'warning', label: 'Uyarı' }, { value: 'info', label: 'Bilgi' }]}
          value={severity} onChange={setSeverity} placeholder="Şiddet" clearable className="w-40" />
        <SearchableSelect options={[{ value: 'unread', label: 'Okunmamış' }, { value: 'read', label: 'Okunmuş' }]}
          value={status} onChange={setStatus} placeholder="Durum" clearable className="w-40" />
      </FilterBar>

      {rows.length === 0 && !isLoading ? (
        <EmptyState icon={BellOff} title="Bildirim yok" description="Filtreye uyan bildirim bulunamadı." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {rows.map((n) => {
            const S = SEV[n.severity] ?? SEV.info
            return (
              <div key={n.id} className={cn('flex items-start gap-3 border-b border-border px-4 py-3 last:border-0', !n.read_at && 'bg-primary/5')}>
                <S.icon className={cn('mt-0.5 size-5 shrink-0', S.cls)} />
                <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-left">
                  <div className={cn('text-sm', !n.read_at ? 'font-medium text-foreground' : 'text-text-secondary')}>{n.title}</div>
                  {n.body && <div className="mt-0.5 text-xs text-text-muted">{n.body}</div>}
                  <div className="mt-1 text-[11px] text-text-muted">{fmt(n.created_at)}</div>
                </button>
                <Button variant="ghost" size="icon" className="size-8 text-text-muted" title="Kaldır" onClick={() => dismiss.mutate(n.id)}><X className="size-4" /></Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
