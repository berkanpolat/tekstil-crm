import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Info, AlertTriangle, AlertOctagon, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { playNotificationSound } from '@/lib/notificationSound'
import {
  useNotifications, useUnreadNotificationCount, useMarkNotificationRead, useMarkAllNotificationsRead,
  useNotificationRealtime, useAlertEngine, type AppNotification,
} from '@/hooks/useNotifications'

const SEV = {
  info: { icon: Info, cls: 'text-info' },
  warning: { icon: AlertTriangle, cls: 'text-warning-foreground' },
  critical: { icon: AlertOctagon, cls: 'text-danger-foreground' },
} as const

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'az önce'
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
}

/** Üst çubuk bildirim zili (B.4) + panel. Realtime + ses (B.5) + motor poller (B.2) burada mount. */
export function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const { data: unread = 0 } = useUnreadNotificationCount()
  const { data: list = [] } = useNotifications(20)
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()

  // Yeni bildirim geldiğinde ses (yalnızca realtime INSERT → sayfa yenilemede/tekrar çalmaz).
  // silent=true bildirimler (ör. yeni talep) ses çalmaz (B.8).
  useNotificationRealtime((n) => { if (!n.silent) playNotificationSound(n.severity) })
  useAlertEngine()

  function openNotification(n: AppNotification) {
    if (!n.read_at) markRead.mutate(n.id)
    setOpen(false)
    if (n.action_url) navigate(n.action_url)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Bildirimler" className="relative rounded-md p-2 text-foreground hover:bg-muted">
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger-foreground px-1 text-[10px] font-semibold leading-4 text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">Bildirimler</span>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markAll.mutate()}>
              <CheckCheck className="size-3.5" /> Tümünü okundu
            </Button>
          )}
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {list.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-text-muted">Bildirim yok.</div>
          ) : list.map((n) => {
            const S = SEV[n.severity] ?? SEV.info
            return (
              <button key={n.id} type="button" onClick={() => openNotification(n)}
                className={cn('flex w-full gap-2.5 border-b border-border px-3 py-2.5 text-left hover:bg-muted/50', !n.read_at && 'bg-primary/5')}>
                <S.icon className={cn('mt-0.5 size-4 shrink-0', S.cls)} />
                <div className="min-w-0 flex-1">
                  <div className={cn('truncate text-sm', !n.read_at ? 'font-medium text-foreground' : 'text-text-secondary')}>{n.title}</div>
                  {n.body && <div className="mt-0.5 line-clamp-2 text-xs text-text-muted">{n.body}</div>}
                  <div className="mt-0.5 text-[11px] text-text-muted">{relTime(n.created_at)}</div>
                </div>
                {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
              </button>
            )
          })}
        </div>
        <div className="border-t border-border px-3 py-2">
          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setOpen(false); navigate('/bildirimler') }}>
            Tümünü gör
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
