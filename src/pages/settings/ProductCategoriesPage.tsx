import { useState } from 'react'
import { Plus, ChevronRight, ChevronDown, Layers, Loader2, EyeOff, Eye, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useCategoryTree, useCreateCategory, useUpdateCategory, type ProductCategory,
} from '@/hooks/useProductCategories'

/** Kategori/Tür hiyerarşisi yönetimi (Kadın Giyim → Bluz). Talep formundaki bağlı menüler buradan. */
export function ProductCategoriesPage() {
  const { data: rows, isLoading } = useCategoryTree()
  const createCat = useCreateCategory()
  const [newCat, setNewCat] = useState('')

  const categories = (rows ?? []).filter((r) => r.parent_id == null)
  const typesByParent = new Map<number, ProductCategory[]>()
  for (const r of rows ?? []) if (r.parent_id != null) {
    const arr = typesByParent.get(r.parent_id) ?? []
    arr.push(r); typesByParent.set(r.parent_id, arr)
  }

  async function addCategory() {
    if (!newCat.trim()) return
    try { await createCat.mutateAsync({ label: newCat.trim(), parentId: null }); setNewCat(''); toast.success('Kategori eklendi.') }
    catch (err) { toast.error(await toUserMessage(err)) }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Kategori / Tür" description="İki seviyeli ürün hiyerarşisi. Talep ve katalog bu listeyi kullanır." />

      <div className="flex max-w-md gap-2">
        <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Yeni kategori (ör. Ev Tekstili)"
          onKeyDown={(e) => e.key === 'Enter' && void addCategory()} />
        <Button onClick={() => void addCategory()} disabled={createCat.isPending || !newCat.trim()}>
          {createCat.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Kategori ekle
        </Button>
      </div>

      {isLoading ? <Skeleton className="h-64 w-full" /> : categories.length === 0 ? (
        <EmptyState icon={Layers} title="Kategori yok" description="İlk kategoriyi yukarıdan ekleyin." />
      ) : (
        <div className="space-y-2">
          {categories.map((cat) => (
            <CategoryRow key={cat.id} category={cat} types={typesByParent.get(cat.id) ?? []} />
          ))}
        </div>
      )}
    </div>
  )
}

function CategoryRow({ category, types }: { category: ProductCategory; types: ProductCategory[] }) {
  const [open, setOpen] = useState(true)
  const createType = useCreateCategory()
  const update = useUpdateCategory()
  const [newType, setNewType] = useState('')

  async function addType() {
    if (!newType.trim()) return
    try { await createType.mutateAsync({ label: newType.trim(), parentId: category.id }); setNewType(''); toast.success('Tür eklendi.') }
    catch (err) { toast.error(await toUserMessage(err)) }
  }

  return (
    <div className={cn('border-border rounded-lg border', !category.is_active && 'opacity-60')}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-text-muted">
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <EditableLabel value={category.label} isSystem={category.is_system}
          onSave={(label) => update.mutateAsync({ id: category.id, label })} />
        <span className="text-text-muted text-xs">{types.filter((t) => t.is_active).length} tür</span>
        <div className="ml-auto">
          <ToggleActive active={category.is_active} onToggle={() => update.mutateAsync({ id: category.id, is_active: !category.is_active })} />
        </div>
      </div>

      {open && (
        <div className="border-border space-y-1 border-t px-3 py-2 pl-9">
          {types.length === 0 && <p className="text-text-muted py-1 text-xs">Henüz tür yok.</p>}
          {types.map((t) => (
            <div key={t.id} className={cn('flex items-center gap-2 py-1', !t.is_active && 'opacity-60')}>
              <EditableLabel value={t.label} isSystem={t.is_system} small
                onSave={(label) => update.mutateAsync({ id: t.id, label })} />
              <div className="ml-auto">
                <ToggleActive active={t.is_active} onToggle={() => update.mutateAsync({ id: t.id, is_active: !t.is_active })} />
              </div>
            </div>
          ))}
          <div className="flex max-w-sm gap-2 pt-1">
            <Input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="Yeni tür (ör. Bluz)" className="h-8"
              onKeyDown={(e) => e.key === 'Enter' && void addType()} />
            <Button size="sm" variant="outline" onClick={() => void addType()} disabled={createType.isPending || !newType.trim()}>
              {createType.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Ekle
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function EditableLabel({ value, onSave, isSystem, small }: { value: string; onSave: (label: string) => Promise<unknown>; isSystem: boolean; small?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)

  if (!editing) {
    return (
      <button type="button" onClick={() => { setDraft(value); setEditing(true) }}
        className={cn('hover:underline', small ? 'text-sm' : 'text-sm font-medium', 'text-foreground')}>
        {value}{isSystem && <span className="text-text-muted ml-1.5 text-[10px]">sistem</span>}
      </button>
    )
  }
  return (
    <span className="flex items-center gap-1">
      <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="h-7 w-48" autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') void doSave(); if (e.key === 'Escape') setEditing(false) }} />
      <Button size="icon" variant="ghost" className="size-7" disabled={busy} onClick={() => void doSave()}><Check className="size-3.5" /></Button>
      <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditing(false)}><X className="size-3.5" /></Button>
    </span>
  )
  async function doSave() {
    if (!draft.trim() || draft.trim() === value) { setEditing(false); return }
    setBusy(true)
    try { await onSave(draft.trim()); setEditing(false) } catch (err) { toast.error(await toUserMessage(err)) } finally { setBusy(false) }
  }
}

function ToggleActive({ active, onToggle }: { active: boolean; onToggle: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button size="sm" variant="ghost" disabled={busy} className="text-text-muted h-7 gap-1 text-xs"
      onClick={async () => { setBusy(true); try { await onToggle() } catch (err) { toast.error(await toUserMessage(err)) } finally { setBusy(false) } }}>
      {active ? <><EyeOff className="size-3.5" /> Gizle</> : <><Eye className="size-3.5" /> Aktifleştir</>}
    </Button>
  )
}
