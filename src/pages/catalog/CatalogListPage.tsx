import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, List, Package, Plus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { DataTable, type DataTableColumn, type SortState } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toUserMessage } from '@/lib/errors'
import { useDocCategoryOptions } from '@/hooks/useDocuments'
import { useCatalogProducts, useCatalogs, useCollections, useDeleteCatalog, type CatalogRow } from '@/hooks/useCatalog'
import { CatalogImage } from './CatalogImage'
import { RateBadge } from './RateBadge'
import { CatalogProductForm } from './CatalogProductForm'
import { CatalogImportDialog } from './CatalogImportDialog'

/** P4B.3 — Katalog listesi: ızgara/liste + filtreler + arama. */
export function CatalogListPage() {
  const navigate = useNavigate()
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [search, setSearch] = useState('')
  const [catalogId, setCatalogId] = useState<string | null>(null)
  const [collectionId, setCollectionId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [hasCost, setHasCost] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(24)
  const [sort, setSort] = useState<SortState | null>({ key: 'code', dir: 'asc' })
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [catDelOpen, setCatDelOpen] = useState(false)
  const delCatalog = useDeleteCatalog()

  const catalogs = useCatalogs()
  const collections = useCollections(catalogId ? Number(catalogId) : null)
  const cats = useDocCategoryOptions()
  const resetPage = () => setPage(1)
  const filters = {
    search: search || undefined, catalogId: catalogId ? Number(catalogId) : null, collectionId: collectionId ? Number(collectionId) : null,
    categoryId: categoryId ? Number(categoryId) : null, hasCost: (hasCost as 'yes' | 'no' | null) || null,
    active: active == null ? null : active === 'true', page, pageSize, sort,
  }
  const { data, isLoading, isFetching } = useCatalogProducts(filters)
  const selectedCatalog = (catalogs.data ?? []).find((c) => String(c.id) === catalogId)
  const hasFilters = !!search || !!catalogId || !!collectionId || !!categoryId || !!hasCost || active != null
  const clearAll = () => { setSearch(''); setCatalogId(null); setCollectionId(null); setCategoryId(null); setHasCost(null); setActive(null); resetPage() }

  const columns: DataTableColumn<CatalogRow>[] = [
    { key: 'image', header: '', cell: (r) => <CatalogImage path={r.image_path} alt={r.name} width={80} className="size-10 rounded" /> },
    { key: 'code', header: 'Kod', sortable: true, cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { key: 'name', header: 'Ürün', sortable: true, cell: (r) => <span className="text-sm font-medium">{r.name}</span> },
    { key: 'cat', header: 'Kategori / Tür', hideable: true, cell: (r) => <span className="text-text-secondary text-xs">{[r.category_label, r.type_label].filter(Boolean).join(' / ') || '—'}</span> },
    { key: 'coll', header: 'Koleksiyon', hideable: true, cell: (r) => <span className="text-text-secondary text-xs">{r.collection_name ?? '—'}</span> },
    { key: 'moq', header: 'MOQ', hideable: true, cell: (r) => <span className="text-text-secondary text-sm">{r.moq}</span> },
  ]
  const rows = data?.rows ?? []

  return (
    <div className="space-y-5">
      <PageHeader title="Katalog" description="Ürünler, koleksiyonlar, maliyet ve fiyatlandırma."
        action={<div className="flex flex-wrap items-center gap-2">
          <RateBadge />
          <div className="inline-flex overflow-hidden rounded-md border border-border">
            <button type="button" onClick={() => setView('grid')} className={cn('px-2.5 py-1.5', view === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-background')} title="Izgara"><LayoutGrid className="size-4" /></button>
            <button type="button" onClick={() => setView('list')} className={cn('px-2.5 py-1.5', view === 'list' ? 'bg-primary text-primary-foreground' : 'bg-background')} title="Liste"><List className="size-4" /></button>
          </div>
          <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="size-4" /> İçe aktar</Button>
          <Button onClick={() => setFormOpen(true)}><Plus className="size-4" /> Ürün ekle</Button>
        </div>} />

      <FilterBar search={search} onSearchChange={(v) => { setSearch(v); resetPage() }} searchPlaceholder="Kod, ad veya kompozisyon ara…" showClear={hasFilters} onClear={clearAll}>
        <SearchableSelect options={(catalogs.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))} value={catalogId} onChange={(v) => { setCatalogId(v); setCollectionId(null); resetPage() }} placeholder="Katalog" clearable className="w-48" />
        {selectedCatalog && <Button variant="ghost" size="icon" className="text-destructive" title="Seçili kataloğu sil" onClick={() => setCatDelOpen(true)}><Trash2 className="size-4" /></Button>}
        <SearchableSelect options={(collections.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))} value={collectionId} onChange={(v) => { setCollectionId(v); resetPage() }} placeholder="Koleksiyon" clearable className="w-40" />
        <SearchableSelect options={(cats.data?.groups ?? []).map((g) => ({ value: String(g.id), label: g.label }))} value={categoryId} onChange={(v) => { setCategoryId(v); resetPage() }} placeholder="Kategori" clearable className="w-48" />
        <SearchableSelect options={[{ value: 'yes', label: 'Maliyet girilmiş' }, { value: 'no', label: 'Maliyet yok' }]} value={hasCost} onChange={(v) => { setHasCost(v); resetPage() }} placeholder="Maliyet" clearable className="w-40" />
        <SearchableSelect options={[{ value: 'true', label: 'Aktif' }, { value: 'false', label: 'Pasif' }]} value={active} onChange={(v) => { setActive(v); resetPage() }} placeholder="Durum" clearable className="w-32" />
      </FilterBar>

      {rows.length === 0 && !isLoading ? (
        <EmptyState icon={Package} title="Ürün bulunamadı" description={hasFilters ? 'Filtreleri değiştirin.' : 'Katalog boş. "Ürün ekle" ya da içe aktarma ile başlayın.'} />
      ) : view === 'grid' ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {rows.map((r) => (
              <button key={r.id} type="button" onClick={() => navigate(`/katalog/${r.id}`)} className="group overflow-hidden rounded-lg border border-border bg-card text-left transition-shadow hover:shadow-card">
                <CatalogImage path={r.image_path} alt={r.name} width={400} contain className="aspect-[2/3] w-full bg-muted/30" />
                <div className="p-2">
                  <div className="truncate text-sm font-medium text-foreground">{r.name}</div>
                  <div className="font-mono text-[11px] text-text-muted">{r.code}</div>
                  <div className="truncate text-[11px] text-text-secondary">{[r.category_label, r.type_label].filter(Boolean).join(' / ')}</div>
                </div>
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-text-muted">{data?.total ?? 0} ürün {isFetching && '· yükleniyor…'}</p>
        </>
      ) : (
        <DataTable columns={columns} data={rows} rowKey={(r) => String(r.id)} loading={isLoading || isFetching}
          onRowClick={(r) => navigate(`/katalog/${r.id}`)} page={page} pageSize={pageSize} total={data?.total ?? 0}
          onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); resetPage() }} sort={sort} onSortChange={setSort} />
      )}

      {formOpen && <CatalogProductForm onClose={() => setFormOpen(false)} onSaved={(id) => { setFormOpen(false); navigate(`/katalog/${id}`) }} />}
      {importOpen && <CatalogImportDialog onClose={() => setImportOpen(false)} onDone={() => setImportOpen(false)} />}
      <ConfirmDialog
        open={catDelOpen}
        onOpenChange={setCatDelOpen}
        title="Kataloğu sil"
        description={`"${selectedCatalog?.name}" kataloğu listeden kaldırılacak. İçindeki ürünler silinmez (ayrıca silinebilir); geçmiş belgeler etkilenmez.`}
        confirmLabel="Sil"
        destructive
        onConfirm={async () => {
          if (!selectedCatalog) return
          try {
            await delCatalog.mutateAsync(selectedCatalog.id)
            toast.success('Katalog silindi.')
            setCatalogId(null)
            setCollectionId(null)
            setCatDelOpen(false)
          } catch (err) {
            toast.error(await toUserMessage(err))
          }
        }}
      />
    </div>
  )
}
