import { useState } from 'react'
import {
  Sparkles,
  Building2,
  MessageSquare,
  ArrowLeftRight,
  UserRound,
  UserRoundCheck,
  Tag,
  StickyNote,
  Paperclip,
  Circle,
  FileText,
  Send,
  Shirt,
  BadgeCheck,
  Package,
  Truck,
  CheckCircle2,
  PauseCircle,
  ShieldAlert,
  AlertTriangle,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react'
import { Timeline, type TimelineItem } from '@/components/shared/Timeline'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useTimeline, type TimelineEntity, type TimelineEvent } from '@/hooks/useTimeline'

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** Geçmişe kayıt: olay zamanı ile loglama zamanı arasındaki fark ≥ ~1 gün ise not. */
function backdatedNote(occurredAt: string, createdAt: string): string | null {
  const diffMs = new Date(createdAt).getTime() - new Date(occurredAt).getTime()
  const days = Math.round(diffMs / 86_400_000)
  if (days >= 1) return `${days} gün sonra kaydedildi`
  const hours = Math.round(diffMs / 3_600_000)
  if (hours >= 3) return `${hours} saat sonra kaydedildi`
  return null
}

/** event_type + payload → görüntü (başlık/açıklama/ikon/ton). Yeni olaylar buraya eklenir. */
function render(ev: TimelineEvent): { title: string; description?: string; icon: LucideIcon; tone: TimelineItem['tone'] } {
  const p = ev.payload ?? {}
  switch (ev.event_type) {
    case 'lead.created':
      return { title: 'Potansiyel oluşturuldu', description: str(p.title) ?? undefined, icon: Sparkles, tone: 'info' }
    case 'customer.created':
      return {
        title: p.from_lead ? `Müşteri oluşturuldu (potansiyel #${p.from_lead})` : 'Müşteri oluşturuldu',
        description: str(p.title) ?? undefined,
        icon: Building2,
        tone: 'success',
      }
    case 'lead.converted':
      return { title: `Müşteriye dönüştürüldü (#${p.customer_id})`, icon: UserRoundCheck, tone: 'success' }
    case 'lead.status_changed':
    case 'customer.status_changed':
      return { title: `Durum: ${str(p.from) ?? '—'} → ${str(p.to) ?? '—'}`, icon: ArrowLeftRight, tone: 'default' }
    case 'lead.assigned':
    case 'customer.assigned':
      return { title: p.to ? `Atandı: ${str(p.to)}` : 'Atama kaldırıldı', icon: UserRound, tone: 'default' }
    case 'interaction.logged': {
      const dir = p.direction === 'inbound' ? 'Gelen' : 'Giden'
      const ch = str(p.channel) ?? 'etkileşim'
      const oc = str(p.outcome)
      return { title: `${dir} ${ch}${oc ? ` — ${oc}` : ''}`, description: str(p.summary) ?? undefined, icon: MessageSquare, tone: 'default' }
    }
    case 'interaction.removed':
      return { title: 'Etkileşim kaldırıldı', icon: MessageSquare, tone: 'default' }
    case 'tag.added':
      return { title: `Etiket eklendi: ${str(p.tag) ?? ''}`, icon: Tag, tone: 'info' }
    case 'tag.removed':
      return { title: `Etiket kaldırıldı: ${str(p.tag) ?? ''}`, icon: Tag, tone: 'default' }
    case 'note.added':
      return { title: 'Not eklendi', description: str(p.excerpt) ?? undefined, icon: StickyNote, tone: 'default' }
    case 'note.removed':
      return { title: 'Not kaldırıldı', icon: StickyNote, tone: 'default' }
    case 'file.added':
      return { title: `Dosya eklendi: ${str(p.name) ?? ''}`, icon: Paperclip, tone: 'info' }
    case 'file.removed':
      return { title: `Dosya kaldırıldı: ${str(p.name) ?? ''}`, icon: Paperclip, tone: 'default' }
    // Operasyon zinciri (Faz 3)
    case 'operation.created':
      return { title: 'Talep oluşturuldu', description: str(p.title) ?? undefined, icon: ClipboardList, tone: 'info' }
    case 'operation.claimed':
      return { title: 'Talep üstlenildi', icon: UserRound, tone: 'default' }
    case 'sample.revised':
      return { title: `Numune revize edildi (${p.round ?? '?'}. tur)`, description: str(p.reason) ?? undefined, icon: ArrowLeftRight, tone: 'warning' }
    case 'quote.created':
      return { title: `Teklif oluşturuldu (v${p.version ?? '?'})`, icon: FileText, tone: 'info' }
    case 'quote.sent':
      return { title: `Teklif gönderildi (v${p.version ?? '?'})`, description: str(p.channel) ?? undefined, icon: Send, tone: 'default' }
    case 'quote.status_changed':
      return { title: `Teklif durumu: ${str(p.status) ?? '—'} (v${p.version ?? '?'})`, icon: ArrowLeftRight, tone: 'default' }
    case 'sample.created':
      return { title: `Numune oluşturuldu (N${p.version ?? '?'})`, icon: Shirt, tone: 'info' }
    case 'sample.shipped':
      return { title: `Numune gönderildi (N${p.version ?? '?'})`, description: str(p.carrier) ?? undefined, icon: Truck, tone: 'default' }
    case 'sample.approved':
      return { title: `Numune onaylandı (N${p.version ?? '?'})`, description: str(p.method) ?? undefined, icon: BadgeCheck, tone: 'success' }
    case 'sample.status_changed':
      return { title: `Numune durumu: ${str(p.status) ?? '—'} (N${p.version ?? '?'})`, icon: ArrowLeftRight, tone: 'default' }
    case 'order.created':
      return { title: 'Sipariş oluşturuldu', icon: Package, tone: 'info' }
    case 'order.held':
      return { title: 'Sipariş askıya alındı', description: str(p.reason) ?? undefined, icon: PauseCircle, tone: 'warning' }
    case 'order.shipped':
      return { title: 'Sipariş sevk edildi', description: str(p.carrier) ?? undefined, icon: Truck, tone: 'default' }
    case 'order.delivered':
      return { title: 'Sipariş teslim edildi', icon: CheckCircle2, tone: 'success' }
    case 'order.status_changed':
      return { title: `Sipariş durumu: ${str(p.status) ?? '—'}`, icon: ArrowLeftRight, tone: 'default' }
    case 'gate.overridden':
      return { title: 'Uyarı geçildi (gerekçeli)', description: str(p.reason) ?? undefined, icon: ShieldAlert, tone: 'warning' }
    case 'sla.overdue':
      return { title: 'SLA süresi doldu', icon: AlertTriangle, tone: 'warning' }
    default:
      return { title: ev.event_type, icon: Circle, tone: 'default' }
  }
}

/** Kart zaman çizelgesi — TEK kaynaktan (event_log) okur, sayfalı ("Daha fazla"). */
export function EntityTimeline({ entityType, entityId }: { entityType: TimelineEntity; entityId: number }) {
  const [limit, setLimit] = useState(20)
  const { data, isLoading, isFetching } = useTimeline(entityType, entityId, limit)

  if (isLoading) return <Skeleton className="h-40 w-full" />

  const items: TimelineItem[] = (data?.rows ?? []).map((ev) => {
    const r = render(ev)
    const note = backdatedNote(ev.occurred_at, ev.created_at) // geçmişe kayıt uyarısı
    return {
      id: ev.id,
      title: r.title,
      description: (
        <>
          {r.description}
          {(ev.actor_name || note) && (
            <span className="text-text-muted block text-xs">
              {ev.actor_name && <>— {ev.actor_name}</>}
              {note && (
                <span className="bg-neutral-badge ml-1 rounded px-1 py-0.5 text-[10px]">{note}</span>
              )}
            </span>
          )}
        </>
      ),
      timestamp: fmt(ev.occurred_at), // NE ZAMAN OLDU
      icon: r.icon,
      tone: r.tone,
    }
  })

  const total = data?.total ?? 0
  return (
    <div className="space-y-3">
      <Timeline items={items} />
      {items.length < total && (
        <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + 20)} disabled={isFetching}>
          Daha fazla ({total - items.length})
        </Button>
      )}
    </div>
  )
}
