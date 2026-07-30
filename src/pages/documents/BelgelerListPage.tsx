import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Download, Eye, FolderClosed, Loader2, DownloadCloud, FileEdit, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toUserMessage } from '@/lib/errors'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { DatePicker } from '@/components/shared/DatePicker'
import { DataTable, type DataTableColumn, type SortState } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { getSignedUrl } from '@/hooks/useFiles'
import { useAllCustomerOptions } from '@/hooks/useOperations'
import { useDocumentsList, type DocumentListRow } from '@/hooks/useDocumentsList'
import { useDeleteDocument } from '@/hooks/useDocuments'
import { NewDocumentButton } from './NewDocumentButton'

function useDocumentTypeOptions() {
  return useQuery({
    queryKey: ['document-type-options'],
    queryFn: async () => (await supabase.from('document_types').select('id, key, label_tr').eq('is_active', true).order('sort_order')).data ?? [],
  })
}
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

async function openFile(storagePath: string | null, name: string | null, download: boolean) {
  if (!storagePath) return
  const url = await getSignedUrl('documents', storagePath, 60, download ? (name ?? undefined) : undefined)
  if (download) { const a = document.createElement('a'); a.href = url; a.download = name ?? 'belge.pdf'; document.body.appendChild(a); a.click(); a.remove() }
  else window.open(url, '_blank', 'noopener')
}

/** Belgeler menüsü — tüm üretilmiş belgeler, filtre + içerik araması + indir/önizle. */
export function BelgelerListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [typeId, setTypeId] = useState<string | null>(null)
  const [language, setLanguage] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sort, setSort] = useState<SortState | null>({ key: 'created_at', dir: 'desc' })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const types = useDocumentTypeOptions()
  const customers = useAllCustomerOptions()
  const resetPage = () => setPage(1)
  const filters = {
    search: search || undefined, typeId: typeId ? Number(typeId) : null, language,
    customerId: customerId ? Number(customerId) : null, from, to, page, pageSize, sort,
  }
  const { data, isLoading, isFetching } = useDocumentsList(filters)
  const hasFilters = !!search || !!typeId || !!language || !!customerId || !!from || !!to
  const clearAll = () => { setSearch(''); setTypeId(null); setLanguage(null); setCustomerId(null); setFrom(null); setTo(null); resetPage() }

  const qc = useQueryClient()
  const del = useDeleteDocument()
  // A9 — Belgeler listesi gerçek zamanlı: biri belge üretince/silince herkeste anında güncellenir.
  useEffect(() => {
    const ch = supabase.channel('documents-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' },
        () => qc.invalidateQueries({ queryKey: ['documents-list'] }))
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [qc])

  async function deleteDoc(r: DocumentListRow) {
    const extra = r.type_key === 'fiyat_teklifi' && r.operation_id != null ? ' Bağlı teklif de silinecek; operasyon "Teklif Bekliyor"a döner.' : ''
    if (!confirm(`"${r.type_label}" belgesi silinsin mi?${extra}`)) return
    try { await del.mutateAsync({ id: r.id, operationId: r.operation_id, typeKey: r.type_key, fileId: r.file_id }); toast.success('Belge silindi.') }
    catch (err) { toast.error(await toUserMessage(err)) }
  }

  async function bulkDownload() {
    const rows = (data?.rows ?? []).filter((r) => selected.has(String(r.id)) && r.storage_path)
    if (!rows.length) { toast.error('İndirilecek belge seçilmedi.'); return }
    setBulkBusy(true)
    try {
      for (const r of rows) { await openFile(r.storage_path, r.file_name, true); await new Promise((res) => setTimeout(res, 250)) }
      toast.success(`${rows.length} belge indirildi.`)
    } catch (err) { toast.error(await toUserMessage(err)) } finally { setBulkBusy(false) }
  }

  const columns: DataTableColumn<DocumentListRow>[] = [
    { key: 'type', header: 'Belge', sortable: true, cell: (r) => (
      <div className="flex items-center gap-2"><FileText className="text-text-muted size-4" />
        <span className="text-sm font-medium text-foreground">{r.type_label}</span>
        <span className="text-text-muted rounded bg-muted px-1 py-0.5 text-[10px] uppercase">{r.language}</span></div>
    ) },
    { key: 'operation', header: 'Operasyon / Müşteri', cell: (r) => (
      <div className="min-w-0"><div className="font-mono text-xs text-foreground">{r.operation_code}</div>
        <div className="text-text-secondary truncate text-xs">{r.customer_name ?? '—'}</div></div>
    ) },
    { key: 'created_at', header: 'Tarih', sortable: true, cell: (r) => <span className="text-text-secondary text-sm">{fmtDate(r.generated_at ?? r.created_at)}</span> },
    { key: 'actions', header: '', align: 'right', cell: (r) => (
      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        <Button size="icon" variant="ghost" className="size-8" title="Düzenle / yeni sürüm" onClick={() => navigate(`/belgeler/${r.id}/duzenle`)}><FileEdit className="size-4" /></Button>
        <Button size="icon" variant="ghost" className="size-8" title="Önizle" disabled={!r.storage_path} onClick={() => void openFile(r.storage_path, r.file_name, false)}><Eye className="size-4" /></Button>
        <Button size="icon" variant="ghost" className="size-8" title="İndir" disabled={!r.storage_path} onClick={() => void openFile(r.storage_path, r.file_name, true)}><Download className="size-4" /></Button>
        <Button size="icon" variant="ghost" className="size-8 text-destructive" title="Sil" onClick={() => void deleteDoc(r)}><Trash2 className="size-4" /></Button>
      </div>
    ) },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Belgeler" description="Üretilmiş tüm belgeler. İçerikte arama, filtre, indirme."
        action={selected.size > 0
          ? <Button onClick={() => void bulkDownload()} disabled={bulkBusy}>{bulkBusy ? <Loader2 className="size-4 animate-spin" /> : <DownloadCloud className="size-4" />} {selected.size} belgeyi indir</Button>
          : <NewDocumentButton />} />

      <FilterBar search={search} onSearchChange={(v) => { setSearch(v); resetPage() }}
        searchPlaceholder="TAS kodu, müşteri ya da belge içeriği ara…" showClear={hasFilters} onClear={clearAll}>
        <SearchableSelect options={(types.data ?? []).map((t) => ({ value: String(t.id), label: t.label_tr }))} value={typeId} onChange={(v) => { setTypeId(v); resetPage() }} placeholder="Belge tipi" clearable className="w-44" />
        <SearchableSelect options={[{ value: 'tr', label: 'Türkçe' }, { value: 'en', label: 'İngilizce' }]} value={language} onChange={(v) => { setLanguage(v); resetPage() }} placeholder="Dil" clearable className="w-32" />
        <SearchableSelect options={customers.data ?? []} value={customerId} onChange={(v) => { setCustomerId(v); resetPage() }} placeholder="Müşteri" clearable className="w-52" />
        <div className="w-36"><DatePicker value={from} onChange={(v) => { setFrom(v); resetPage() }} placeholder="Başlangıç" clearable /></div>
        <div className="w-36"><DatePicker value={to} onChange={(v) => { setTo(v); resetPage() }} placeholder="Bitiş" clearable /></div>
      </FilterBar>

      <DataTable columns={columns} data={data?.rows ?? []} rowKey={(r) => String(r.id)}
        loading={isLoading || isFetching} selectable selectedKeys={selected} onSelectedChange={setSelected}
        onRowClick={(r) => { if (r.operation_id != null) navigate(`/talepler/${r.operation_id}`) }}
        page={page} pageSize={pageSize} total={data?.total ?? 0}
        onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); resetPage() }}
        sort={sort} onSortChange={setSort}
        emptyState={<EmptyState icon={FolderClosed} title="Belge bulunamadı" description={hasFilters ? 'Filtreleri değiştirin.' : 'Henüz belge üretilmedi. Sağ üstteki "Yeni belge" ile başlayın (operasyon bağlantısı opsiyonel).'} />} />
    </div>
  )
}
