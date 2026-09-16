import { MessageCircle, Loader2 } from 'lucide-react'
import { OperationActionForm } from './OperationActionForm'
import { useOperationInteractions } from '@/hooks/useOperationActivity'

const fmt = (iso: string) => new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Genel sekmesindeki etkinlik beslemesi: aksiyon ekleme formu + son etkileşimler.
 *  Tam geçmiş (notlar + zaman çizelgesi) "Geçmiş" sekmesinde. */
export function OperationActivityFeed({ operationId, customerId }: { operationId: number; customerId: number }) {
  const { data, isLoading } = useOperationInteractions(operationId)
  const items = data ?? []
  return (
    <div className="space-y-3">
      <OperationActionForm operationId={operationId} customerId={customerId} />
      <div className="space-y-2">
        <div className="text-text-muted text-xs font-medium">Son etkinlikler</div>
        {isLoading ? (
          <div className="text-text-muted flex items-center gap-2 text-xs"><Loader2 className="size-3.5 animate-spin" /> Yükleniyor…</div>
        ) : items.length === 0 ? (
          <p className="text-text-muted text-xs">Kayıtlı etkinlik yok. Yukarıdan aksiyon ekleyin.</p>
        ) : (
          <ul className="space-y-2">
            {items.slice(0, 6).map((it) => (
              <li key={it.id} className="border-border rounded-lg border p-2.5 text-sm">
                <div className="text-text-muted flex flex-wrap items-center gap-x-2 text-[11px]">
                  <MessageCircle className="size-3.5" />
                  <span>{fmt(it.occurred_at)}</span>
                  {it.channel_label && <span>· {it.channel_label}</span>}
                  {it.outcome_label && <span className="text-text-secondary">· {it.outcome_label}</span>}
                  {it.author_name && <span className="ml-auto">{it.author_name}</span>}
                </div>
                {it.summary && <p className="mt-1 whitespace-pre-wrap text-foreground">{it.summary}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
