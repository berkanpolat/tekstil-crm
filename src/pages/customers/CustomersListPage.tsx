import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Plus, Trash2, X, Loader2, Upload, Download, Archive, ArchiveRestore } from 'lucide-react'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { DataTable, type DataTableColumn, type SortState } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { StatusDef, StatusTone } from '@/lib/statuses'
import { useAssigneeOptions } from '@/hooks/useLeads'
import {
  useCustomerList,
  useCustomerStatusOptions,
  useCustomerTypeOptions,
  useCustomerCityOptions,
  useSoftDeleteCustomers,
  useUnarchiveCustomer,
  useBulkAssignCustomers,
  useBulkStatusCustomers,
  fetchCustomersForExport,
  type CustomerRow,
} from '@/hooks/useCustomers'
import { useTagOptions, useBulkAddTag } from '@/hooks/useTags'
import { toCsv, downloadCsv } from '@/lib/csv'
import { CustomerFormDialog } from './CustomerFormDialog'
import { ImportDialog } from '@/components/import/ImportDialog'

const STATUS_TONE: Record<string, StatusTone> = {
  aktif: 'success',
  pasif: 'neutral',
  riskli: 'warning',
  kara_liste: 'danger',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Müşteriler listesi — arama (firma/kişi/şehir/kod/vergi no), filtre, sıralama, sayfalama: hepsi sunucuda. */
export function CustomersListPage() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [statusId, setStatusId] = useState<string | null>(null)
  const [typeId, setTypeId] = useState<string | null>(null)
  const [assignedTo, setAssignedTo] = useState<string | null>(null)
  const [city, setCity] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sort, setSort] = useState<SortState | null>({ key: 'created_at', dir: 'desc' })

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [archived, setArchived] = useState(false)

  const statuses = useCustomerStatusOptions()
  const types = useCustomerTypeOptions()
  const assignees = useAssigneeOptions()
  const cities = useCustomerCityOptions()
  const bulkAssign = useBulkAssignCustomers()
  const bulkStatus = useBulkStatusCustomers()
  const tagOptions = useTagOptions()
  const bulkTag = useBulkAddTag()
  const [exporting, setExporting] = useState(false)
  const softDelete = useSoftDeleteCustomers()
  const unarchive = useUnarchiveCustomer()

  const selectedIds = useMemo(() => [...selected].map(Number), [selected])
  const clearSelection = () => setSelected(new Set())
  const resetPage = () => setPage(1)

  async function runBulk(fn: () => Promise<unknown>, okMsg: string) {
    try {
      await fn()
      toast.success(okMsg)
      clearSelection()
    } catch (err) {
      toast.error(await toUserMessage(err))
    }
  }

  const filters = {
    search: search || undefined,
    statusId: statusId ? Number(statusId) : null,
    typeId: typeId ? Number(typeId) : null,
    assignedTo,
    city,
    archived,
    page,
    pageSize,
    sort,
  }
  const { data, isLoading, isFetching } = useCustomerList(filters)

  async function exportCsv(onlySelected: boolean) {
    setExporting(true)
    try {
      const { headers, rows } = await fetchCustomersForExport(filters, onlySelected ? selectedIds : undefined)
      downloadCsv(`musteriler-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, rows))
      toast.success(`${rows.length} kayıt dışa aktarıldı.`)
    } catch (err) {
      toast.error(await toUserMessage(err))
    } finally {
      setExporting(false)
    }
  }
  const hasFilters = !!search || !!statusId || !!typeId || !!assignedTo || !!city

  const statusRegistry = useMemo<Record<string, StatusDef>>(() => {
    const reg: Record<string, StatusDef> = {}
    for (const s of statuses.data ?? []) reg[s.key] = { label: s.label, tone: STATUS_TONE[s.key] ?? 'neutral' }
    return reg
  }, [statuses.data])

  const columns: DataTableColumn<CustomerRow>[] = [
    { key: 'customer_code', header: 'Kod', sortable: true, cell: (r) => (
      <span className="font-mono text-xs text-text-secondary">{r.customer_code ?? '—'}</span>
    ) },
    {
      key: 'company',
      header: 'Firma / Kişi',
      sortable: true,
      cell: (r) => {
        const title = r.company_name || r.full_name || '—'
        const sub = r.company_name ? r.full_name : null
        return (
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{title}</div>
            {sub && <div className="text-text-secondary truncate text-xs">{sub}</div>}
          </div>
        )
      },
    },
    { key: 'type', header: 'Tür', hideable: true, cell: (r) => r.type_label ?? '—' },
    { key: 'city', header: 'Şehir', sortable: true, cell: (r) => r.city ?? '—' },
    {
      key: 'status',
      header: 'Durum',
      cell: (r) => (r.status_key ? <StatusBadge status={r.status_key} registry={statusRegistry} /> : '—'),
    },
    {
      key: 'assignee',
      header: 'Atanan',
      hideable: true,
      cell: (r) => r.assignee_name ?? <span className="text-text-muted">Atanmamış</span>,
    },
    {
      key: 'next_action_at',
      header: 'Sonraki aksiyon',
      sortable: true,
      hideable: true,
      cell: (r) => {
        if (!r.next_action_at) return <span className="text-text-muted">—</span>
        const overdue = new Date(r.next_action_at) < new Date()
        return (
          <span className={cn('text-sm', overdue ? 'font-medium text-danger-foreground' : 'text-text-secondary')}>
            {fmtDate(r.next_action_at)}
          </span>
        )
      },
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Müşteriler"
        description="Müşteri kartları, ticari bilgiler ve iletişim geçmişi. Arama/filtre sunucu tarafında."
        action={
          <div className="flex gap-2">
            <Button
              variant={archived ? 'default' : 'outline'}
              onClick={() => { setArchived((a) => !a); clearSelection(); resetPage() }}
            >
              <Archive className="size-4" /> {archived ? 'Aktifler' : 'Arşiv'}
            </Button>
            <Button variant="outline" disabled={exporting} onClick={() => void exportCsv(false)}>
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Dışa aktar
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" /> İçe aktar
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="size-4" /> Müşteri ekle
            </Button>
          </div>
        }
      />

      {selected.size > 0 && (
        <div className="border-border bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border p-2">
          <span className="px-1 text-sm font-medium">{selected.size} seçili</span>
          {archived && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runBulk(
                  () => Promise.all(selectedIds.map((id) => unarchive.mutateAsync(id))),
                  'Arşivden çıkarıldı.',
                )
              }
            >
              <ArchiveRestore className="size-4" /> Arşivden çıkar
            </Button>
          )}
          {!archived && (
          <>
          <SearchableSelect
            options={[
              { value: 'unassigned', label: 'Atanmamış' },
              ...(assignees.data ?? []).map((u) => ({ value: u.id, label: u.full_name })),
            ]}
            value={null}
            onChange={(v) =>
              v &&
              void runBulk(
                () => bulkAssign.mutateAsync({ ids: selectedIds, assignedTo: v === 'unassigned' ? null : v }),
                'Atama güncellendi.',
              )
            }
            placeholder="Ata…"
            className="w-44"
          />
          <SearchableSelect
            options={(statuses.data ?? []).map((s) => ({ value: String(s.id), label: s.label }))}
            value={null}
            onChange={(v) =>
              v &&
              void runBulk(
                () => bulkStatus.mutateAsync({ ids: selectedIds, statusId: Number(v) }),
                'Durum güncellendi.',
              )
            }
            placeholder="Durum ata…"
            className="w-44"
          />
          <SearchableSelect
            options={(tagOptions.data ?? []).map((t) => ({ value: String(t.id), label: t.label }))}
            value={null}
            onChange={(v) =>
              v &&
              void runBulk(
                () => bulkTag.mutateAsync({ entityType: 'customer', ids: selectedIds, tagId: Number(v) }),
                'Etiket eklendi.',
              )
            }
            placeholder="Etiket ekle…"
            className="w-40"
          />
          <Button variant="outline" size="sm" disabled={exporting} onClick={() => void exportCsv(true)}>
            <Download className="size-4" /> Dışa aktar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" /> Sil
          </Button>
          </>
          )}
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            <X className="size-4" /> Seçimi bırak
          </Button>
          {(bulkAssign.isPending || bulkStatus.isPending || bulkTag.isPending || softDelete.isPending || unarchive.isPending) && (
            <Loader2 className="text-text-muted size-4 animate-spin" />
          )}
        </div>
      )}

      <FilterBar
        search={search}
        onSearchChange={(v) => {
          setSearch(v)
          resetPage()
        }}
        searchPlaceholder="Firma, kişi, şehir, kod veya vergi no ara…"
        showClear={hasFilters}
        onClear={() => {
          setSearch('')
          setStatusId(null)
          setTypeId(null)
          setAssignedTo(null)
          setCity(null)
          resetPage()
        }}
      >
        <SearchableSelect
          options={(statuses.data ?? []).map((s) => ({ value: String(s.id), label: s.label }))}
          value={statusId}
          onChange={(v) => {
            setStatusId(v)
            resetPage()
          }}
          placeholder="Durum"
          clearable
          className="w-40"
        />
        <SearchableSelect
          options={(types.data ?? []).map((t) => ({ value: String(t.id), label: t.label }))}
          value={typeId}
          onChange={(v) => {
            setTypeId(v)
            resetPage()
          }}
          placeholder="Tür"
          clearable
          className="w-36"
        />
        <SearchableSelect
          options={[
            { value: 'unassigned', label: 'Atanmamış' },
            ...(assignees.data ?? []).map((u) => ({ value: u.id, label: u.full_name })),
          ]}
          value={assignedTo}
          onChange={(v) => {
            setAssignedTo(v)
            resetPage()
          }}
          placeholder="Atanan"
          clearable
          className="w-44"
        />
        <SearchableSelect
          options={(cities.data ?? []).map((c) => ({ value: c, label: c }))}
          value={city}
          onChange={(v) => {
            setCity(v)
            resetPage()
          }}
          placeholder="Şehir"
          clearable
          className="w-40"
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        rowKey={(r) => String(r.id)}
        loading={isLoading || isFetching}
        columnToggle
        selectable
        selectedKeys={selected}
        onSelectedChange={setSelected}
        onRowClick={(r) => navigate(`/musteriler/${r.id}`)}
        page={page}
        pageSize={pageSize}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s)
          resetPage()
        }}
        sort={sort}
        onSortChange={setSort}
        emptyState={
          <EmptyState
            icon={Building2}
            title="Müşteri bulunamadı"
            description={hasFilters ? 'Filtreleri değiştirmeyi deneyin.' : 'Henüz müşteri yok.'}
            action={
              !hasFilters ? (
                <Button variant="outline" onClick={() => setFormOpen(true)}>
                  Müşteri ekle
                </Button>
              ) : undefined
            }
          />
        }
      />

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreated={(id) => navigate(`/musteriler/${id}`)}
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} entity="customer" />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`${selected.size} müşteriyi sil`}
        description="Seçili kayıtlar silinecek (yumuşak silme — geri alınabilir). Devam edilsin mi?"
        confirmLabel="Sil"
        destructive
        onConfirm={async () => {
          await runBulk(() => softDelete.mutateAsync(selectedIds), 'Seçili müşteriler silindi.')
          setDeleteOpen(false)
        }}
      />
    </div>
  )
}
