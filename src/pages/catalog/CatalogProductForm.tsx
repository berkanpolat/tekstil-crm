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
import { useFabricOptions, useFitOptions, usePrintOptions } from '@/hooks/useFabricDictionaries'
import { Checkbox } from '@/components/ui/checkbox'
import { slugify, isValidSlug } from '@/lib/catalogSlug'

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
    slug: editing?.slug ?? '',
    fabric_group_id: editing?.fabric_group_id ? String(editing.fabric_group_id) : null as string | null,
    fabric_type_id: editing?.fabric_type_id ? String(editing.fabric_type_id) : null as string | null,
    fit_type_id: editing?.fit_type_id ? String(editing.fit_type_id) : null as string | null,
    print_type_id: editing?.print_type_id ? String(editing.print_type_id) : null as string | null,
    print_details: editing?.print_details ?? '',
    gramaj: editing?.gramaj != null ? String(editing.gramaj) : '',
  })
  const [hasPrint, setHasPrint] = useState(editing?.has_print ?? false)
  const set = (k: keyof typeof f, v: string | null) => setF((s) => ({ ...s, [k]: v }))
  const collections = useCollections(f.catalog_id ? Number(f.catalog_id) : null)
  const fabrics = useFabricOptions()
  const fits = useFitOptions()
  const prints = usePrintOptions()
  // Kumaş tipi listesi seçili gruba bağlı; grup yoksa seçilemez (aynı ad birden çok grupta olabilir).
  const fabricTypes = f.fabric_group_id ? (fabrics.data?.typesByGroup[Number(f.fabric_group_id)] ?? []) : []
  const groups = cats.data?.groups ?? []
  const gid = groups.find((g) => g.label === f.grup)?.id
  const types = gid != null ? (cats.data?.typesByGroup[gid] ?? []) : []

  async function submit() {
    if (!f.code.trim() || !f.name.trim() || !f.catalog_id) { toast.error('Kod, ad ve katalog zorunlu.'); return }
    if (f.gramaj.trim() && Number(f.gramaj) <= 0) { toast.error('Gramaj sıfırdan büyük olmalı.'); return }
    if (f.slug.trim() && !isValidSlug(f.slug.trim())) { toast.error('Site adresi yalnız küçük harf, rakam ve tek tire içerebilir.'); return }
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
        slug: f.slug.trim() || null,
        fabric_group_id: f.fabric_group_id ? Number(f.fabric_group_id) : null,
        fabric_type_id: f.fabric_type_id ? Number(f.fabric_type_id) : null,
        fit_type_id: f.fit_type_id ? Number(f.fit_type_id) : null,
        gramaj: f.gramaj.trim() ? Number(f.gramaj) : null,
        // Baskı kapalıysa tip ve ayrıntı da temizlenir — tutarsız kayıt kalmasın.
        has_print: hasPrint,
        print_type_id: hasPrint && f.print_type_id ? Number(f.print_type_id) : null,
        print_details: hasPrint ? (f.print_details.trim() || null) : null,
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
          <FormField label="Kumaş Grubu">{() => <SearchableSelect options={(fabrics.data?.groups ?? []).map((g) => ({ value: String(g.id), label: g.label }))} value={f.fabric_group_id} onChange={(v) => { set('fabric_group_id', v); set('fabric_type_id', null) }} placeholder="Dokuma / Örme / Denim…" clearable />}</FormField>
          <FormField label="Kumaş Tipi">{() => <SearchableSelect options={fabricTypes.map((x) => ({ value: String(x.id), label: x.label }))} value={f.fabric_type_id} onChange={(v) => set('fabric_type_id', v)} placeholder={f.fabric_group_id ? 'Kumaş tipi' : 'Önce kumaş grubu'} clearable />}</FormField>
          <FormField label="Kalıp (Fit)">{() => <SearchableSelect options={(fits.data ?? []).map((x) => ({ value: String(x.id), label: x.label }))} value={f.fit_type_id} onChange={(v) => set('fit_type_id', v)} placeholder="Regular / Slim / Oversize…" clearable />}</FormField>
          <FormField label="Gramaj (gr/m²)">{(p) => <Input {...p} inputMode="numeric" value={f.gramaj} onChange={(e) => set('gramaj', e.target.value.replace(/\D/g, ''))} placeholder="ör. 180" />}</FormField>
          <FormField label="Kompozisyon" className="sm:col-span-2">{(p) => <Input {...p} value={f.composition} onChange={(e) => set('composition', e.target.value)} placeholder="%95 Pamuk %5 Elastan Süprem 160-180 gr/m²" />}</FormField>
          <div className="sm:col-span-2 rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Checkbox checked={hasPrint} onCheckedChange={(v) => setHasPrint(v === true)} />
              Baskı var
            </label>
            {hasPrint && (
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Baskı Tekniği">{() => <SearchableSelect options={(prints.data ?? []).map((x) => ({ value: String(x.id), label: x.label }))} value={f.print_type_id} onChange={(v) => set('print_type_id', v)} placeholder="Serigrafi / Dijital / Nakış…" clearable />}</FormField>
                <FormField label="Baskı Ayrıntısı">{(p) => <Input {...p} value={f.print_details} onChange={(e) => set('print_details', e.target.value)} placeholder="ör. ön göğüs, 20×25 cm" />}</FormField>
              </div>
            )}
          </div>
          <FormField label="MOQ (min. sipariş)">{(p) => <Input {...p} inputMode="numeric" value={f.moq} onChange={(e) => set('moq', e.target.value.replace(/\D/g, ''))} />}</FormField>
          <FormField label="Beden Sistemi">{() => <SearchableSelect options={BEDEN.map((b) => ({ value: b, label: b }))} value={f.size_system} onChange={(v) => set('size_system', v ?? 'Alfa')} />}</FormField>
          <FormField label="Bedenler (virgülle)">{(p) => <Input {...p} value={f.sizes} onChange={(e) => set('sizes', e.target.value)} />}</FormField>
          <FormField label="Renkler (virgülle)">{(p) => <Input {...p} value={f.colors} onChange={(e) => set('colors', e.target.value)} placeholder="Siyah, Beyaz, Lacivert" />}</FormField>
          <FormField label="Ürüne özel marj (%) — boş = kademeler">{(p) => <Input {...p} inputMode="decimal" value={f.custom_margin} onChange={(e) => set('custom_margin', e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="ör. 30" />}</FormField>
          <FormField
            label="Site adresi (slug)"
            hint="tekstilas.com/katalog/<slug>/ — değiştirmek sitedeki eski bağlantıyı ve SEO'yu kırar."
            className="sm:col-span-2"
            labelAction={!f.slug.trim() && f.name.trim()
              ? <button type="button" className="text-xs text-primary hover:underline" onClick={() => set('slug', slugify(f.name))}>addan öner</button>
              : undefined}
          >{(p) => <Input {...p} value={f.slug} onChange={(e) => set('slug', e.target.value)} placeholder="cep-detayli-baskili-penye-tunik-yesil" />}</FormField>
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
