import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shirt, PackageOpen, Truck, ClipboardCheck, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { DateRangePicker, type DateRange } from '@/components/shared/DateRangePicker'
import { DataTable, type DataTableColumn, type SortState } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { STATUS_TONE_CLASS, type StatusTone } from '@/lib/statuses'
import { useAllSamples, useSampleStatusOptions, type SampleListRow } from '@/hooks/useSamples'

const toneClass = (c: string | null): string =>
  c && (['success', 'warning', 'danger', 'info', 'neutral'] as string[]).includes(c)
    ? STATUS_TONE_CLASS[c as StatusTone] : 'bg-neutral-badge text-neutral-badge-foreground'
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

/** Hazır görünüm durum kümeleri (durum sözlüğü iki dilli). */
const AT_CUSTOMER = ['teslim_edildi', 'musteriye_gonderildi', 'inceleniyor']
const IN_TRANSIT = ['kargoda', 'kargo_bekleniyor']
const AWAITING_APPROVAL = ['inceleniyor', 'revize_bekleniyor', 'musteriye_gonderildi']

type View = 'all' | 'atcustomer' | 'transit' | 'approval' | 'revisions'

export function NumunelerListPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useAllSamples()
  const statuses = useSampleStatusOptions()

  const [view, setView] = useState<View>('all')
  const [search, setSearch] = useState('')
  const [statusKey, setStatusKey] = useState<string | null>(null)
  const [range, setRange] = useState<DateRange | undefined>()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sort, setSort] = useState<SortState | null>({ key: 'created_at', dir: 'desc' })
  const resetPage = () => setPage(1)

  const filtered = useMemo(() => {
    let rows = data ?? []
    const s = search.trim().toLocaleLowerCase('tr')
    if (s) rows = rows.filter((r) => r.operation_code.toLocaleLowerCase('tr').includes(s) || (r.customer_name ?? '').toLocaleLowerCase('tr').includes(s))
    if (statusKey) rows = rows.filter((r) => r.status_key === statusKey)
    if (range?.from) rows = rows.filter((r) => new Date(r.created_at).getTime() >= range.from!.getTime())
    if (range?.to) rows = rows.filter((r) => new Date(r.created_at).getTime() <= range.to!.getTime())
    if (view === 'atcustomer') rows = rows.filter((r) => AT_CUSTOMER.includes(r.status_key ?? ''))
    if (view === 'transit') rows = rows.filter((r) => IN_TRANSIT.includes(r.status_key ?? ''))
    if (view === 'approval') rows = rows.filter((r) => AWAITING_APPROVAL.includes(r.status_key ?? ''))
    if (view === 'revisions') rows = rows.filter((r) => r.revision_round >= 3)
    const dir = sort?.dir === 'asc' ? 1 : -1
    const key = sort?.key ?? 'created_at'
    rows = [...rows].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[key], bv = (b as unknown as Record<string, unknown>)[key]
      if (av == null) return 1; if (bv == null) return -1
      return av > bv ? dir : av < bv ? -dir : 0
    })
    return rows
  }, [data, search, statusKey, range, view, sort])

  const total = filtered.length
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const hasFilters = !!search || !!statusKey || !!range

  const columns: DataTableColumn<SampleListRow>[] = [
    { key: 'operation_code', header: 'TAS Kodu', sortable: true, cell: (r) => <span className="font-mono text-xs text-foreground">{r.operation_code}</span> },
    { key: 'customer_name', header: 'Müşteri', cell: (r) => <span className="text-sm font-medium text-foreground">{r.customer_name ?? '—'}</span> },
    { key: 'revision_round', header: 'Tur', sortable: true, cell: (r) => (
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-text-secondary">{r.revision_round > 0 ? `${r.revision_round}. rev.` : 'İlk'}</span>
        {r.revision_round >= 3 && <span className="rounded bg-warning-badge px-1.5 py-0.5 text-[10px] font-medium text-warning-foreground">3+ revizyon</span>}
      </div>
    ) },
    { key: 'status', header: 'Durum', cell: (r) => r.status_label
      ? <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', toneClass(r.status_color))}>{r.status_label}</span> : '—' },
    { key: 'cargo', header: 'Kargo', hideable: true, cell: (r) => r.tracking_number || r.carrier
      ? <span className="text-sm text-text-secondary">{[r.carrier, r.tracking_number].filter(Boolean).join(' · ')}</span>
      : <span className="text-text-muted text-sm">—</span> },
    { key: 'shipped_at', header: 'Gönderim', sortable: true, cell: (r) => <span className="text-sm text-text-secondary">{fmt(r.shipped_at)}</span> },
    { key: 'received_at', header: 'Teslim', sortable: true, cell: (r) => <span className="text-sm text-text-secondary">{fmt(r.received_at)}</span> },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Numuneler" description="Tüm numuneler, revizyon turları ve kargo takibi. Satıra tıklayınca ilgili operasyona gider." />

      <div className="flex flex-wrap gap-2">
        <Button variant={view === 'all' && !hasFilters ? 'default' : 'outline'} size="sm" onClick={() => { setView('all'); resetPage() }}><Shirt className="size-4" /> Tümü</Button>
        <Button variant={view === 'atcustomer' ? 'default' : 'outline'} size="sm" onClick={() => { setView('atcustomer'); resetPage() }}><PackageOpen className="size-4" /> Müşteride bekleyenler</Button>
        <Button variant={view === 'transit' ? 'default' : 'outline'} size="sm" onClick={() => { setView('transit'); resetPage() }}><Truck className="size-4" /> Kargoda</Button>
        <Button variant={view === 'approval' ? 'default' : 'outline'} size="sm" onClick={() => { setView('approval'); resetPage() }}><ClipboardCheck className="size-4" /> Onay bekleyenler</Button>
        <Button variant={view === 'revisions' ? 'default' : 'outline'} size="sm" onClick={() => { setView('revisions'); resetPage() }}><AlertTriangle className="size-4" /> 3+ revizyon</Button>
      </div>

      <FilterBar
        search={search} onSearchChange={(v) => { setSearch(v); resetPage() }}
        searchPlaceholder="TAS kodu veya müşteri ara…"
        showClear={hasFilters} onClear={() => { setSearch(''); setStatusKey(null); setRange(undefined); resetPage() }}
      >
        <SearchableSelect className="w-52" clearable placeholder="Durum"
          options={(statuses.data ?? []).map((s) => ({ value: s.key as string, label: s.label as string }))}
          value={statusKey} onChange={(v) => { setStatusKey(v); resetPage() }} />
        <DateRangePicker value={range} onChange={(r) => { setRange(r); resetPage() }} />
      </FilterBar>

      <DataTable
        columns={columns} data={pageRows} rowKey={(r) => String(r.id)} loading={isLoading} columnToggle
        onRowClick={(r) => navigate(`/talepler/${r.operation_id}`)}
        rowClassName={(r) => (r.revision_round >= 3 ? 'bg-warning-badge/30' : undefined)}
        page={page} pageSize={pageSize} total={total}
        onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); resetPage() }}
        sort={sort} onSortChange={setSort}
        emptyState={<EmptyState icon={Shirt} title="Numune bulunamadı" description={hasFilters || view !== 'all' ? 'Filtreleri değiştirin.' : 'Numuneler operasyon kartından oluşturulur.'} />}
      />
    </div>
  )
}
