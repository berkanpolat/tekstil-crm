import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { toUserMessage } from '@/lib/errors'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { FormField } from '@/components/shared/FormField'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { Input } from '@/components/ui/input'
import { parseDecimal } from '@/lib/money'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useDocCategoryOptions } from '@/hooks/useDocuments'
import { useCatalogs, useCollections, useSaveCatalogProduct, type CatalogProductDetail } from '@/hooks/useCatalog'

const BEDEN = ['Alfa', 'Numara', 'Özel']

/** Elle ürün ekle/düzenle (katalog içe aktarma tek yol değil — Kabul 5). */
export function CatalogProductForm({ editing, onClose, onSaved }: { editing?: CatalogProductDetail; onClose: () => void; onSaved: (id: number) => void }) {
  const save = useSaveCatalogProduct()
  const catalogs = useCatalogs()
  const cats = useDocCategoryOptions()
  const [f, setF] = useState({
    code: editing?.code ?? '', name: editing?.name ?? '', catalog_id: editing ? String(editing.catalog_id) : null as string | null,
    collection_id: editing?.collection_id ? String(editing.collection_id) : null as string | null,
    grup: editing?.category?.label ?? '', tur: editing?.type?.label ?? '',
    composition: editing?.composition ?? '', description: editing?.description ?? '', moq: String(editing?.moq ?? 50),
    size_system: editing?.size_system ?? 'Alfa', sizes: (editing?.sizes ?? ['XS', 'S', 'M', 'L', 'XL']).join(', '),
    colors: ((editing?.colors as string[] | null) ?? []).join(', '),
    custom_margin: editing?.custom_margin_percent != null ? String(editing.custom_margin_percent) : '',
  })
  const set = (k: keyof typeof f, v: string | null) => setF((s) => ({ ...s, [k]: v }))
  const collections = useCollections(f.catalog_id ? Number(f.catalog_id) : null)
  const groups = cats.data?.groups ?? []
  const gid = groups.find((g) => g.label === f.grup)?.id
  const types = gid != null ? (cats.data?.typesByGroup[gid] ?? []) : []

  async function submit() {
    if (!f.code.trim() || !f.name.trim() || !f.catalog_id) { toast.error('Kod, ad ve katalog zorunlu.'); return }
    try {
      const catId = groups.find((g) => g.label === f.grup)?.id ?? null
      const typeId = types.find((t) => t.label === f.tur)?.id ?? null
      await save.mutateAsync({
        id: editing?.id, code: f.code.trim(), name: f.name.trim(), catalog_id: Number(f.catalog_id),
        collection_id: f.collection_id ? Number(f.collection_id) : null, category_id: catId, type_id: typeId,
        composition: f.composition.trim() || null, description: f.description.trim() || null, moq: Number(f.moq) || 50,
        size_system: f.size_system, sizes: f.sizes.split(',').map((x) => x.trim()).filter(Boolean),
        colors: f.colors.split(',').map((x) => x.trim()).filter(Boolean),
        custom_margin_percent: f.custom_margin.trim() ? parseDecimal(f.custom_margin) : null,
      } as never)
      toast.success(editing ? 'Ürün güncellendi.' : 'Ürün eklendi.')
      onSaved(editing?.id ?? 0)
    } catch (err) { toast.error(await toUserMessage(err)) }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Ürünü düzenle' : 'Ürün ekle'}</DialogTitle>
          <DialogDescription>Katalog ürünü. Kod elle girilir (ör. ST-26SS190009).</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Ürün Kodu" required>{(p) => <Input {...p} value={f.code} onChange={(e) => set('code', e.target.value)} placeholder="ST-26SS190009" />}</FormField>
          <FormField label="Ürün Adı" required>{(p) => <Input {...p} value={f.name} onChange={(e) => set('name', e.target.value)} />}</FormField>
          <FormField label="Katalog" required>{() => <SearchableSelect options={(catalogs.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))} value={f.catalog_id} onChange={(v) => { set('catalog_id', v); set('collection_id', null) }} placeholder="Katalog seç" />}</FormField>
          <FormField label="Koleksiyon">{() => <SearchableSelect options={(collections.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))} value={f.collection_id} onChange={(v) => set('collection_id', v)} placeholder="Koleksiyon" clearable />}</FormField>
          <FormField label="Ürün Grubu">{() => <SearchableSelect options={groups.map((g) => ({ value: g.label, label: g.label }))} value={f.grup || null} onChange={(v) => { set('grup', v ?? ''); set('tur', '') }} placeholder="Grup / Dal" clearable />}</FormField>
          <FormField label="Ürün Türü">{() => <SearchableSelect options={types.map((t) => ({ value: t.label, label: t.label }))} value={f.tur || null} onChange={(v) => set('tur', v ?? '')} placeholder={gid != null ? 'Tür' : 'Önce grup'} clearable />}</FormField>
          <FormField label="Kompozisyon" className="sm:col-span-2">{(p) => <Input {...p} value={f.composition} onChange={(e) => set('composition', e.target.value)} placeholder="%95 Pamuk %5 Elastan Süprem 160-180 gr/m²" />}</FormField>
          <FormField label="MOQ (min. sipariş)">{(p) => <Input {...p} inputMode="numeric" value={f.moq} onChange={(e) => set('moq', e.target.value.replace(/\D/g, ''))} />}</FormField>
          <FormField label="Beden Sistemi">{() => <SearchableSelect options={BEDEN.map((b) => ({ value: b, label: b }))} value={f.size_system} onChange={(v) => set('size_system', v ?? 'Alfa')} />}</FormField>
          <FormField label="Bedenler (virgülle)">{(p) => <Input {...p} value={f.sizes} onChange={(e) => set('sizes', e.target.value)} />}</FormField>
          <FormField label="Renkler (virgülle)">{(p) => <Input {...p} value={f.colors} onChange={(e) => set('colors', e.target.value)} placeholder="Siyah, Beyaz, Lacivert" />}</FormField>
          <FormField label="Ürüne özel marj (%) — boş = kademeler">{(p) => <Input {...p} inputMode="decimal" value={f.custom_margin} onChange={(e) => set('custom_margin', e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="ör. 30" />}</FormField>
          <FormField label="Açıklama" className="sm:col-span-2">{(p) => <Textarea {...p} value={f.description} onChange={(e) => set('description', e.target.value)} rows={3} />}</FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>{save.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Kaydet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
