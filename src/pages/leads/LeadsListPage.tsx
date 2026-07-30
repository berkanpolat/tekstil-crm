import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, UserRound, Clock, Plus, Trash2, X, Loader2, Upload, Download } from 'lucide-react'
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
import { useCurrentUser } from '@/hooks/useCurrentUser'
import {
  useLeadList,
  useLeadStatusOptions,
  useLeadSourceOptions,
  useAssigneeOptions,
  useLeadCityOptions,
  useSoftDeleteLeads,
  useBulkAssignLeads,
  useBulkStatusLeads,
  fetchLeadsForExport,
  type LeadRow,
} from '@/hooks/useLeads'
import { useTagOptions, useBulkAddTag } from '@/hooks/useTags'
import { toCsv, downloadCsv } from '@/lib/csv'
import { LeadFormDialog } from './LeadFormDialog'
import { ImportDialog } from '@/components/import/ImportDialog'

// Durum anahtarı → ton. Etiket DB'den (referans veri), renk buradan tek elden.
const STATUS_TONE: Record<string, StatusTone> = {
  yeni: 'info',
  temas_kuruldu: 'info',
  ilgileniyor: 'warning',
  ulasilamiyor: 'neutral',
  olumsuz: 'danger',
  donusturuldu: 'success',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Potansiyeller (leads) listesi — arama/filtre/sıralama/sayfalama tümü SUNUCU tarafında. */
export function LeadsListPage() {
  const { data: me } = useCurrentUser()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [statusId, setStatusId] = useState<string | null>(null)
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [assignedTo, setAssignedTo] = useState<string | null>(null)
  const [city, setCity] = useState<string | null>(null)
  const [showConverted, setShowConverted] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sort, setSort] = useState<SortState | null>({ key: 'created_at', dir: 'desc' })

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const statuses = useLeadStatusOptions()
  const sources = useLeadSourceOptions()
  const assignees = useAssigneeOptions()
  const cities = useLeadCityOptions()
  const tagOptions = useTagOptions()
  const bulkAssign = useBulkAssignLeads()
  const bulkStatus = useBulkStatusLeads()
  const bulkTag = useBulkAddTag()
  const softDelete = useSoftDeleteLeads()

  const selectedIds = useMemo(() => [...selected].map(Number), [selected])
  const clearSelection = () => setSelected(new Set())

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
    sourceId: sourceId ? Number(sourceId) : null,
    assignedTo,
    city,
    showConverted,
    page,
    pageSize,
    sort,
  }
  const { data, isLoading, isFetching } = useLeadList(filters)

  async function exportCsv(onlySelected: boolean) {
    setExporting(true)
    try {
      const { headers, rows } = await fetchLeadsForExport(filters, onlySelected ? selectedIds : undefined)
      downloadCsv(`potansiyeller-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, rows))
      toast.success(`${rows.length} kayıt dışa aktarıldı.`)
    } catch (err) {
      toast.error(await toUserMessage(err))
    } finally {
      setExporting(false)
    }
  }

  const hasFilters = !!search || !!statusId || !!sourceId || !!assignedTo || !!city
  const resetPage = () => setPage(1)

  // StatusBadge için dinamik registry (etiket DB'den, ton haritadan).
  const statusRegistry = useMemo<Record<string, StatusDef>>(() => {
    const reg: Record<string, StatusDef> = {}
    for (const s of statuses.data ?? []) {
      reg[s.key] = { label: s.label, tone: STATUS_TONE[s.key] ?? 'neutral' }
    }
    return reg
  }, [statuses.data])

  const columns: DataTableColumn<LeadRow>[] = [
    {
      key: 'company',
      header: 'Firma / Kişi',
      sortable: true,
      cell: (r) => {
        // Kart başlığı: full_name varsa o, yoksa company_name (CHECK ikisinden biri dolu).
        const title = r.full_name || r.company_name || '—'
        const sub = r.full_name ? r.company_name : null
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium text-foreground">{title}</span>
              {r.external_id && (
                <span className="text-text-muted rounded bg-neutral-badge px-1 text-[10px] leading-4">
                  {r.external_source ?? 'dış'}
                </span>
              )}
            </div>
            {sub && <div className="text-text-secondary truncate text-xs">{sub}</div>}
          </div>
        )
      },
    },
    { key: 'city', header: 'Şehir', sortable: true, cell: (r) => r.city ?? '—' },
    {
      key: 'status',
      header: 'Durum',
      cell: (r) =>
        r.status_key ? <StatusBadge status={r.status_key} registry={statusRegistry} /> : '—',
    },
    { key: 'source', header: 'Kaynak', hideable: true, cell: (r) => r.source_label ?? '—' },
    {
      key: 'assignee',
      header: 'Atanan',
      hideable: true,
      cell: (r) =>
        r.assignee_name ?? <span className="text-text-muted">Atanmamış</span>,
    },
    {
      key: 'last_interaction_at',
      header: 'Son etkileşim',
      sortable: true,
      hideable: true,
      cell: (r) => <span className="text-text-secondary text-sm">{fmtDate(r.last_interaction_at)}</span>,
    },
    {
      key: 'next_action_at',
      header: 'Sonraki aksiyon',
      sortable: true,
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
        title="Potansiyeller"
        description="Potansiyel müşteriler. Arama, filtre ve sıralama sunucu tarafında çalışır."
        action={
          <div className="flex gap-2">
            <Button variant="outline" disabled={exporting} onClick={() => void exportCsv(false)}>
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Dışa aktar
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" /> İçe aktar
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="size-4" /> Potansiyel ekle
            </Button>
          </div>
        }
      />

      {/* Toplu işlem çubuğu — seçim varken */}
      {selected.size > 0 && (
        <div className="border-border bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border p-2">
          <span className="px-1 text-sm font-medium">{selected.size} seçili</span>
          <SearchableSelect
            options={[
              { value: 'unassigned', label: 'Atanmamış' },
              ...(assignees.data ?? []).map((u) => ({ value: u.id, label: u.full_name })),
            ]}
            value={null}
            onChange={(v) =>
              v &&
              void runBulk(
                () =>
                  bulkAssign.mutateAsync({
                    ids: selectedIds,
                    assignedTo: v === 'unassigned' ? null : v,
                  }),
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
                () => bulkTag.mutateAsync({ entityType: 'lead', ids: selectedIds, tagId: Number(v) }),
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
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            <X className="size-4" /> Seçimi bırak
          </Button>
          {(bulkAssign.isPending || bulkStatus.isPending || bulkTag.isPending || softDelete.isPending) && (
            <Loader2 className="text-text-muted size-4 animate-spin" />
          )}
        </div>
      )}

      {/* Hızlı görünümler — sunucu tarafı filtreyi tek tıkla değiştirir */}
      <div className="flex flex-wrap gap-2">
        <QuickView
          active={!hasFilters && !showConverted}
          icon={Sparkles}
          label="Tümü"
          onClick={() => {
            setSearch('')
            setStatusId(null)
            setSourceId(null)
            setAssignedTo(null)
            setCity(null)
            setShowConverted(false)
            resetPage()
          }}
        />
        {me && (
          <QuickView
            active={assignedTo === me.id}
            icon={UserRound}
            label="Bana atanan"
            onClick={() => {
              setAssignedTo(me.id)
              resetPage()
            }}
          />
        )}
        <QuickView
          active={assignedTo === 'unassigned'}
          icon={UserRound}
          label="Atanmamış"
          onClick={() => {
            setAssignedTo('unassigned')
            resetPage()
          }}
        />
        <QuickView
          active={statusId === '1'}
          icon={Clock}
          label="Yeni"
          onClick={() => {
            const yeni = (statuses.data ?? []).find((s) => s.key === 'yeni')
            if (yeni) setStatusId(String(yeni.id))
            resetPage()
          }}
        />
        <QuickView
          active={showConverted}
          icon={UserRound}
          label={showConverted ? 'Dönüştürülenler görünür' : 'Dönüştürülenleri göster'}
          onClick={() => {
            setShowConverted((v) => !v)
            resetPage()
          }}
        />
      </div>

      <FilterBar
        search={search}
        onSearchChange={(v) => {
          setSearch(v)
          resetPage()
        }}
        searchPlaceholder="Firma, kişi veya şehir ara…"
        showClear={hasFilters}
        onClear={() => {
          setSearch('')
          setStatusId(null)
          setSourceId(null)
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
          options={(sources.data ?? []).map((s) => ({ value: String(s.id), label: s.label }))}
          value={sourceId}
          onChange={(v) => {
            setSourceId(v)
            resetPage()
          }}
          placeholder="Kaynak"
          clearable
          className="w-40"
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
        onRowClick={(r) => navigate(`/potansiyeller/${r.id}`)}
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
            icon={Sparkles}
            title="Potansiyel bulunamadı"
            description={hasFilters ? 'Filtreleri değiştirmeyi deneyin.' : 'Henüz potansiyel yok.'}
            action={
              !hasFilters ? (
                <Button variant="outline" onClick={() => setFormOpen(true)}>
                  Potansiyel ekle
                </Button>
              ) : undefined
            }
          />
        }
      />

      <LeadFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreated={(id) => navigate(`/potansiyeller/${id}`)}
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} entity="lead" />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`${selected.size} potansiyeli sil`}
        description="Seçili kayıtlar silinecek (yumuşak silme — kalıcı değil, geri alınabilir). Devam edilsin mi?"
        confirmLabel="Sil"
        destructive
        onConfirm={async () => {
          await runBulk(() => softDelete.mutateAsync(selectedIds), 'Seçili potansiyeller silindi.')
          setDeleteOpen(false)
        }}
      />
    </div>
  )
}

function QuickView({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: typeof Sparkles
  label: string
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant={active ? 'default' : 'outline'}
      size="sm"
      onClick={onClick}
    >
      <Icon className="size-4" /> {label}
    </Button>
  )
}
