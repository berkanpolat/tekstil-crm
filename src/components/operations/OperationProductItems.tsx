import { useState } from 'react'
import { Plus, Trash2, Pencil, Check, X, ChevronUp, ChevronDown, Loader2, Boxes } from 'lucide-react'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useOperationItems, useAddOperationItem, useUpdateOperationItem, useDeleteOperationItem,
  type OperationItem, type OperationItemInput,
} from '@/hooks/useOperations'

const toArr = (s: string): string[] => s.split(',').map((t) => t.trim()).filter(Boolean)
const fromArr = (a: string[] | null): string => (a ?? []).join(', ')
const toInt = (s: string): number | null => { const n = parseInt(s.replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null }

interface Draft { name: string; fabric: string; colors: string; sizes: string; quantity: string; print_embroidery: string; label_request: string; packaging_request: string }
const emptyDraft: Draft = { name: '', fabric: '', colors: '', sizes: '', quantity: '', print_embroidery: '', label_request: '', packaging_request: '' }
const toDraft = (it: OperationItem): Draft => ({
  name: it.name, fabric: it.fabric ?? '', colors: fromArr(it.colors), sizes: fromArr(it.sizes),
  quantity: it.quantity != null ? String(it.quantity) : '', print_embroidery: it.print_embroidery ?? '',
  label_request: it.label_request ?? '', packaging_request: it.packaging_request ?? '',
})
const draftToInput = (d: Draft, operationId: number): Omit<OperationItemInput, never> => ({
  operation_id: operationId, name: d.name.trim(),
  fabric: d.fabric.trim() || null, colors: toArr(d.colors).length ? toArr(d.colors) : null,
  sizes: toArr(d.sizes).length ? toArr(d.sizes) : null, quantity: toInt(d.quantity),
  print_embroidery: d.print_embroidery.trim() || null, label_request: d.label_request.trim() || null,
  packaging_request: d.packaging_request.trim() || null,
})

/** Serbest (katalog dışı) ürünler — çoklu ürün: ad/kumaş/renk/beden/miktar/baskı/etiket/paketleme.
 *  Ekle/düzenle/sil + sıralama. Miktar teklife beslenmek üzere ürün başına tutulur. */
export function OperationProductItems({ operationId }: { operationId: number }) {
  const { data: items, isLoading } = useOperationItems(operationId)
  const add = useAddOperationItem()
  const update = useUpdateOperationItem()
  const del = useDeleteOperationItem()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const list = items ?? []
  const busy = add.isPending || update.isPending

  const openNew = () => { setDraft(emptyDraft); setEditing('new') }
  const openEdit = (it: OperationItem) => { setDraft(toDraft(it)); setEditing(it.id) }
  const cancel = () => { setEditing(null); setDraft(emptyDraft) }

  async function save() {
    if (!draft.name.trim()) { toast.error('Ürün adı gerekli.'); return }
    try {
      if (editing === 'new') {
        const nextSort = list.reduce((m, it) => Math.max(m, it.sort_order), 0) + 1
        await add.mutateAsync({ ...draftToInput(draft, operationId), sort_order: nextSort })
      } else if (typeof editing === 'number') {
        await update.mutateAsync({ id: editing, ...draftToInput(draft, operationId) })
      }
      cancel()
    } catch (err) { toast.error(await toUserMessage(err)) }
  }

  // Sıralama: komşu ile sort_order takas.
  async function move(it: OperationItem, dir: -1 | 1) {
    const idx = list.findIndex((x) => x.id === it.id)
    const other = list[idx + dir]
    if (!other) return
    try {
      await update.mutateAsync({ id: it.id, operation_id: operationId, name: it.name, sort_order: other.sort_order })
      await update.mutateAsync({ id: other.id, operation_id: operationId, name: other.name, sort_order: it.sort_order })
    } catch (err) { toast.error(await toUserMessage(err)) }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Boxes className="text-text-muted size-4" />
          <span className="text-sm font-medium text-foreground">Serbest ürünler</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-text-muted">Katalog dışı</span>
        </div>
        {editing !== 'new' && <Button size="sm" variant="outline" onClick={openNew}><Plus className="size-3.5" /> Ürün ekle</Button>}
      </div>

      {editing === 'new' && <ProductEditor draft={draft} setDraft={setDraft} onSave={() => void save()} onCancel={cancel} busy={busy} />}

      {isLoading ? <Skeleton className="h-16 w-full" /> : list.length === 0 && editing !== 'new' ? (
        <p className="text-text-muted text-xs">Henüz serbest ürün eklenmedi.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((it, i) => (
            <li key={it.id} className="border-border rounded-lg border p-3">
              {editing === it.id ? (
                <ProductEditor draft={draft} setDraft={setDraft} onSave={() => void save()} onCancel={cancel} busy={busy} />
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-foreground">
                      {it.name}
                      {it.quantity != null && <span className="rounded bg-accent-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-accent-primary">{it.quantity} adet</span>}
                    </div>
                    <div className="text-text-secondary flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                      {it.fabric && <span>Kumaş: {it.fabric}</span>}
                      {it.colors?.length ? <span>Renk: {it.colors.join(', ')}</span> : null}
                      {it.sizes?.length ? <span>Beden: {it.sizes.join(', ')}</span> : null}
                      {it.print_embroidery && <span>Baskı: {it.print_embroidery}</span>}
                      {it.label_request && <span>Etiket: {it.label_request}</span>}
                      {it.packaging_request && <span>Paketleme: {it.packaging_request}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => void move(it, -1)} disabled={i === 0}><ChevronUp className="size-3.5" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => void move(it, 1)} disabled={i === list.length - 1}><ChevronDown className="size-3.5" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => openEdit(it)}><Pencil className="size-3.5" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive" disabled={del.isPending}
                      onClick={async () => { if (!confirm(`"${it.name}" silinsin mi?`)) return; try { await del.mutateAsync({ id: it.id, operation_id: operationId }) } catch (err) { toast.error(await toUserMessage(err)) } }}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ProductEditor({ draft, setDraft, onSave, onCancel, busy }: { draft: Draft; setDraft: (d: Draft) => void; onSave: () => void; onCancel: () => void; busy: boolean }) {
  const set = <K extends keyof Draft>(k: K, v: string) => setDraft({ ...draft, [k]: v })
  // NOT: alanları BİLEŞEN (<F/>) olarak tanımlamıyoruz — her render'da remount olur, input odağı
  // her karakterde kaybolurdu. Düz JSX döndüren yardımcıyı ÇAĞIRIYORUz (eleman kimliği sabit kalır).
  const field = (label: string, k: keyof Draft, opts?: { wide?: boolean; placeholder?: string; numeric?: boolean }) => (
    <div className={opts?.wide ? 'sm:col-span-2' : ''}>
      <Label className="text-text-muted text-xs">{label}</Label>
      <Input value={draft[k]} inputMode={opts?.numeric ? 'numeric' : undefined} placeholder={opts?.placeholder}
        onChange={(e) => set(k, opts?.numeric ? e.target.value.replace(/[^\d]/g, '') : e.target.value)} className="mt-1 h-8" />
    </div>
  )
  return (
    <div className="bg-subtle space-y-3 rounded-lg p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {field('Ürün adı *', 'name', { wide: true })}
        {field('Kumaş', 'fabric')}
        {field('Miktar (adet)', 'quantity', { numeric: true, placeholder: 'ör. 200' })}
        {field('Renk (virgülle)', 'colors', { placeholder: 'ör. Siyah, Beyaz' })}
        {field('Beden (virgülle)', 'sizes', { placeholder: 'ör. S, M, L' })}
        {field('Baskı / Nakış', 'print_embroidery')}
        {field('Etiket', 'label_request')}
        {field('Paketleme', 'packaging_request', { wide: true })}
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}><X className="size-4" /> Vazgeç</Button>
        <Button size="sm" onClick={onSave} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Kaydet</Button>
      </div>
    </div>
  )
}
