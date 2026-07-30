import { useState } from 'react'
import { Lock, Globe, Trash2, Plus, Loader2, MessageSquare, StickyNote, History } from 'lucide-react'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/shared/EmptyState'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { useNotes, useAddNote, useDeleteNote } from '@/hooks/useNotes'
import { useChannelOptions, useOutcomeOptions } from '@/hooks/useInteractions'
import { useOperationInteractions, useAddOperationInteraction, useOperationRevisions, type RevisionRow } from '@/hooks/useOperationActivity'

const fmtDT = (iso: string) => new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// ============ Notlar (iç/dış ayrımı) ============
export function OperationNotesTab({ operationId }: { operationId: number }) {
  const { data: notes, isLoading } = useNotes('operation', operationId)
  const add = useAddNote()
  const del = useDeleteNote()
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(true)

  async function submit() {
    if (!body.trim()) { toast.error('Not boş olamaz.'); return }
    try { await add.mutateAsync({ entity_type: 'operation', entity_id: operationId, body: body.trim(), is_internal: internal }); setBody(''); toast.success('Not eklendi.') }
    catch (err) { toast.error(await toUserMessage(err)) }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="border-border space-y-2 rounded-lg border p-3">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Not ekle…" />
        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="size-4" />
            <span className={cn('flex items-center gap-1', internal ? 'text-amber-700 dark:text-amber-400' : 'text-text-secondary')}>
              {internal ? <><Lock className="size-3.5" /> İç not (müşteriye gitmez)</> : <><Globe className="size-3.5" /> Dış not</>}
            </span>
          </label>
          <Button size="sm" onClick={() => void submit()} disabled={add.isPending || !body.trim()}>
            {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Ekle
          </Button>
        </div>
      </div>

      {isLoading ? <Skeleton className="h-24 w-full" /> : (notes ?? []).length === 0 ? (
        <EmptyState icon={StickyNote} title="Not yok" description="İlk notu yukarıdan ekleyin." />
      ) : (
        <ul className="space-y-2">
          {(notes ?? []).map((n) => (
            <li key={n.id} className={cn('rounded-lg border p-3', n.is_internal
              ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30' : 'border-border')}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm whitespace-pre-wrap text-foreground">{n.body}</p>
                <Button variant="ghost" size="icon" className="size-7 shrink-0" disabled={del.isPending}
                  onClick={async () => { try { await del.mutateAsync(n) } catch (err) { toast.error(await toUserMessage(err)) } }}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <div className="text-text-muted mt-1 flex items-center gap-2 text-xs">
                {n.is_internal ? <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400"><Lock className="size-3" /> İç</span> : <span className="flex items-center gap-1"><Globe className="size-3" /> Dış</span>}
                {n.author_name && <>· {n.author_name}</>} · {fmtDT(n.created_at)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ============ İletişim (operation_id filtreli) ============
export function OperationInteractionsTab({ operationId, customerId }: { operationId: number; customerId: number }) {
  const { data: items, isLoading } = useOperationInteractions(operationId)
  const channels = useChannelOptions()
  const outcomes = useOutcomeOptions()
  const add = useAddOperationInteraction()
  const [channelId, setChannelId] = useState<string | null>(null)
  const [outcomeId, setOutcomeId] = useState<string | null>(null)
  const [direction, setDirection] = useState('outbound')
  const [summary, setSummary] = useState('')

  async function submit() {
    if (!channelId) { toast.error('Kanal seçin.'); return }
    try {
      await add.mutateAsync({ operation_id: operationId, customer_id: customerId, channel_id: Number(channelId),
        outcome_id: outcomeId ? Number(outcomeId) : null, direction, occurred_at: new Date().toISOString(), summary: summary.trim() || null })
      setSummary(''); setOutcomeId(null); toast.success('Görüşme kaydedildi.')
    } catch (err) { toast.error(await toUserMessage(err)) }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="border-border grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-2">
        <SearchableSelect options={(channels.data ?? []).map((c) => ({ value: String(c.id), label: c.label }))} value={channelId} onChange={setChannelId} placeholder="Kanal *" />
        <SearchableSelect options={[{ value: 'outbound', label: 'Giden' }, { value: 'inbound', label: 'Gelen' }]} value={direction} onChange={(v) => setDirection(v ?? 'outbound')} />
        <SearchableSelect clearable options={(outcomes.data ?? []).map((o) => ({ value: String(o.id), label: o.label }))} value={outcomeId} onChange={setOutcomeId} placeholder="Sonuç" className="sm:col-span-2" />
        <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} placeholder="Ne konuşuldu?" className="sm:col-span-2" />
        <Button size="sm" onClick={() => void submit()} disabled={add.isPending || !channelId} className="sm:col-span-2 sm:justify-self-end">
          {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Görüşme ekle
        </Button>
      </div>

      {isLoading ? <Skeleton className="h-24 w-full" /> : (items ?? []).length === 0 ? (
        <EmptyState icon={MessageSquare} title="Görüşme yok" description="Bu operasyona ait ilk görüşmeyi ekleyin." />
      ) : (
        <ul className="space-y-2">
          {(items ?? []).map((it) => (
            <li key={it.id} className="border-border rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                {it.direction === 'inbound' ? 'Gelen' : 'Giden'} {it.channel_label ?? ''}
                {it.outcome_label && <span className="text-text-secondary font-normal">— {it.outcome_label}</span>}
              </div>
              {it.summary && <p className="text-text-secondary mt-1 text-sm">{it.summary}</p>}
              <div className="text-text-muted mt-1 text-xs">{it.author_name && <>{it.author_name} · </>}{fmtDT(it.occurred_at)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ============ Revizyon geçmişi (audit_log okuma katmanı) ============
const TABLE_LABEL: Record<string, string> = {
  operations: 'Operasyon', operation_items: 'Ürün kalemi', quotes: 'Teklif', quote_items: 'Teklif kalemi',
  samples: 'Numune', orders: 'Sipariş', order_items: 'Sipariş kalemi',
}
const FIELD_LABEL: Record<string, string> = {
  quantity: 'adet', produced_quantity: 'üretilen adet', unit_price: 'birim fiyat', discount_rate: 'iskonto %',
  total: 'toplam', subtotal: 'ara toplam', tax_rate: 'KDV %', fabric: 'kumaş', colors: 'renkler', sizes: 'bedenler',
  promised_delivery: 'söz verilen termin', planned_delivery: 'iç plan tarihi', actual_delivery: 'fiili teslim',
  expected_delivery: 'termin beklentisi', valid_until: 'geçerlilik', title: 'başlık', description: 'açıklama',
  name: 'ad', status_id: 'durum', stage_id: 'aşama', priority_id: 'öncelik', owner_id: 'sorumlu',
  hold_reason: 'askı nedeni', rejection_reason: 'red nedeni', print_embroidery: 'baskı/nakış', technical_notes: 'teknik not',
}
const IMPORTANT = new Set(['quantity', 'unit_price', 'total', 'promised_delivery', 'planned_delivery', 'actual_delivery', 'fabric', 'colors', 'expected_delivery', 'valid_until'])
const fieldLabel = (f: string) => FIELD_LABEL[f] ?? f
function valStr(v: unknown): string {
  if (v == null) return '—'
  if (Array.isArray(v)) return v.join(', ') || '—'
  return String(v)
}

export function OperationRevisionsTab({ operationId }: { operationId: number }) {
  const { data, isLoading } = useOperationRevisions(operationId)

  if (isLoading) return <Skeleton className="h-40 w-full" />
  const rows = (data ?? []).filter((r) => r.action !== 'insert' || r.table_name === 'operations')
  if (rows.length === 0) return <EmptyState icon={History} title="Değişiklik yok" description="Henüz kayıtlı değişiklik yok." />

  return (
    <div className="max-w-2xl space-y-2">
      {rows.map((r) => <RevisionItem key={r.id} r={r} />)}
    </div>
  )
}

function RevisionItem({ r }: { r: RevisionRow }) {
  const changed = (r.changed_fields ?? []).filter((f) => FIELD_LABEL[f] || IMPORTANT.has(f) || !['updated_at', 'created_at', 'title_normalized', 'full_name_normalized'].includes(f))
  const actionLabel = r.action === 'insert' ? 'oluşturuldu' : r.action === 'delete' ? 'silindi' : 'güncellendi'

  return (
    <div className="border-border rounded-lg border p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">{TABLE_LABEL[r.table_name] ?? r.table_name} {actionLabel}</span>
        <span className="text-text-muted text-xs">{fmtDT(r.created_at)}</span>
      </div>
      {r.action === 'update' && changed.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {changed.map((f) => (
            <li key={f} className={cn('text-xs', IMPORTANT.has(f) ? 'text-foreground font-medium' : 'text-text-secondary')}>
              {fieldLabel(f)}: <span className="line-through opacity-70">{valStr(r.old_values?.[f])}</span> → {valStr(r.new_values?.[f])}
            </li>
          ))}
        </ul>
      )}
      <div className="text-text-muted mt-1 text-xs">{r.actor_email ?? 'sistem'}</div>
    </div>
  )
}
