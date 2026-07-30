import { useState } from 'react'
import { Plus, Trash2, Loader2, ArrowUpRight, ArrowDownLeft, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import { FormField } from '@/components/shared/FormField'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  useInteractions,
  useAddInteraction,
  useDeleteInteraction,
  useChannelOptions,
  useOutcomeOptions,
  type Interaction,
  type InteractionEntity,
  type Direction,
} from '@/hooks/useInteractions'

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
function nowLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function InteractionsPanel({
  entityType,
  entityId,
}: {
  entityType: InteractionEntity
  entityId: number
}) {
  const { data: items, isLoading } = useInteractions(entityType, entityId)
  const [adding, setAdding] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          Etkileşimler {items && items.length > 0 && <span className="text-text-muted">({items.length})</span>}
        </h3>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Etkileşim ekle
          </Button>
        )}
      </div>

      {adding && (
        <AddForm
          entityType={entityType}
          entityId={entityId}
          onDone={() => setAdding(false)}
        />
      )}

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (items ?? []).length === 0 ? (
        !adding && (
          <EmptyState
            icon={MessageSquare}
            title="Henüz etkileşim yok"
            description="Arama, e-posta veya ziyaret kaydı ekleyin."
          />
        )
      ) : (
        <ul className="space-y-2">
          {(items ?? []).map((it) => (
            <li key={it.id} className="border-border rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {it.direction === 'outbound' ? (
                      <ArrowUpRight className="size-4 text-info-foreground" />
                    ) : (
                      <ArrowDownLeft className="size-4 text-success-foreground" />
                    )}
                    <span className="font-medium text-foreground">{it.channel_label ?? '—'}</span>
                    {it.outcome_label && (
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-xs',
                          it.outcome_positive ? 'bg-success text-success-foreground' : 'bg-neutral-badge text-neutral-badge-foreground',
                        )}
                      >
                        {it.outcome_label}
                      </span>
                    )}
                    <span className="text-text-muted text-xs">{fmt(it.occurred_at)}</span>
                  </div>
                  {it.summary && <p className="text-text-secondary mt-1 text-sm">{it.summary}</p>}
                  {it.created_by_name && (
                    <p className="text-text-muted mt-1 text-xs">Ekleyen: {it.created_by_name}</p>
                  )}
                </div>
                <DeleteBtn interaction={it} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DeleteBtn({ interaction }: { interaction: Interaction }) {
  const del = useDeleteInteraction()
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={del.isPending}
      onClick={async () => {
        try {
          await del.mutateAsync(interaction)
        } catch (err) {
          toast.error(await toUserMessage(err))
        }
      }}
    >
      {del.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </Button>
  )
}

function AddForm({
  entityType,
  entityId,
  onDone,
}: {
  entityType: InteractionEntity
  entityId: number
  onDone: () => void
}) {
  const channels = useChannelOptions()
  const outcomes = useOutcomeOptions()
  const add = useAddInteraction()
  const [channelId, setChannelId] = useState<string | null>(null)
  const [outcomeId, setOutcomeId] = useState<string | null>(null)
  const [direction, setDirection] = useState<Direction>('outbound')
  const [occurredAt, setOccurredAt] = useState(nowLocal())
  const [summary, setSummary] = useState('')

  async function submit() {
    if (!channelId) {
      toast.error('Kanal seçin.')
      return
    }
    try {
      await add.mutateAsync({
        entity_type: entityType,
        entity_id: entityId,
        channel_id: Number(channelId),
        outcome_id: outcomeId ? Number(outcomeId) : null,
        direction,
        occurred_at: new Date(occurredAt).toISOString(),
        summary: summary.trim() || null,
      })
      toast.success('Etkileşim eklendi.')
      onDone()
    } catch (err) {
      toast.error(await toUserMessage(err))
    }
  }

  return (
    <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Kanal" required>
          {(p) => (
            <SearchableSelect
              id={p.id}
              options={(channels.data ?? []).map((c) => ({ value: String(c.id), label: c.label }))}
              value={channelId}
              onChange={setChannelId}
              placeholder="Kanal seç"
            />
          )}
        </FormField>
        <FormField label="Sonuç">
          {(p) => (
            <SearchableSelect
              id={p.id}
              options={(outcomes.data ?? []).map((o) => ({ value: String(o.id), label: o.label }))}
              value={outcomeId}
              onChange={setOutcomeId}
              placeholder="Sonuç seç"
              clearable
            />
          )}
        </FormField>
        <FormField label="Yön">
          {(p) => (
            <SearchableSelect
              id={p.id}
              options={[
                { value: 'outbound', label: 'Giden (biz aradık)' },
                { value: 'inbound', label: 'Gelen (bize ulaştı)' },
              ]}
              value={direction}
              onChange={(v) => setDirection((v as Direction) ?? 'outbound')}
            />
          )}
        </FormField>
        <FormField label="Zaman">
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          )}
        </FormField>
      </div>
      <FormField label="Özet">
        {(p) => (
          <Textarea {...p} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Görüşme notu…" />
        )}
      </FormField>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone} disabled={add.isPending}>
          Vazgeç
        </Button>
        <Button size="sm" onClick={() => void submit()} disabled={add.isPending}>
          {add.isPending && <Loader2 className="size-4 animate-spin" />}
          Kaydet
        </Button>
      </div>
    </div>
  )
}
