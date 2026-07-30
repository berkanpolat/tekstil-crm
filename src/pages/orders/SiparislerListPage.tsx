import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Factory, Truck, PackageCheck, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { DateRangePicker, type DateRange } from '@/components/shared/DateRangePicker'
import { DataTable, type DataTableColumn, type SortState } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { STATUS_TONE_CLASS, type StatusTone } from '@/lib/statuses'
import { formatMoney } from '@/lib/money'
import { useAllOrders, useOrderStatusOptions, type OrderListRow } from '@/hooks/useOrders'

const toneClass = (c: string | null): string =>
  c && (['success', 'warning', 'danger', 'info', 'neutral'] as string[]).includes(c)
    ? STATUS_TONE_CLASS[c as StatusTone] : 'bg-neutral-badge text-neutral-badge-foreground'
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

/** Hazır görünüm durum kümeleri (durum sözlüğü iki dilli). */
const IN_PRODUCTION = ['uretimde', 'planlaniyor', 'uretime_hazir', 'olusturuldu', 'paketleniyor', 'kalite_kontrolde']
const SHIPPING = ['kargoda', 'kargo_bekleniyor', 'sevkiyata_hazir', 'sevk_edildi']
const DELIVERED = ['teslim_edildi', 'tamamlandi']

type View = 'all' | 'production' | 'shipping' | 'delivered' | 'late'

export function SiparislerListPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useAllOrders()
  const statuses = useOrderStatusOptions()
  const [nowMs] = useState(() => Date.now())

  const [view, setView] = useState<View>('all')
  const [search, setSearch] = useState('')
  const [statusKey, setStatusKey] = useState<string | null>(null)
  const [range, setRange] = useState<DateRange | undefined>()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sort, setSort] = useState<SortState | null>({ key: 'created_at', dir: 'desc' })
  const resetPage = () => setPage(1)

  const isLate = (r: OrderListRow) => !!r.promised_delivery && !r.actual_delivery
    && new Date(r.promised_delivery).getTime() < nowMs && !DELIVERED.includes(r.status_key ?? '')

  const filtered = useMemo(() => {
    let rows = data ?? []
    const s = search.trim().toLocaleLowerCase('tr')
    if (s) rows = rows.filter((r) => r.operation_code.toLocaleLowerCase('tr').includes(s) || (r.customer_name ?? '').toLocaleLowerCase('tr').includes(s))
    if (statusKey) rows = rows.filter((r) => r.status_key === statusKey)
    if (range?.from) rows = rows.filter((r) => new Date(r.order_date).getTime() >= range.from!.getTime())
    if (range?.to) rows = rows.filter((r) => new Date(r.order_date).getTime() <= range.to!.getTime())
    if (view === 'production') rows = rows.filter((r) => IN_PRODUCTION.includes(r.status_key ?? ''))
    if (view === 'shipping') rows = rows.filter((r) => SHIPPING.includes(r.status_key ?? ''))
    if (view === 'delivered') rows = rows.filter((r) => DELIVERED.includes(r.status_key ?? ''))
    if (view === 'late') rows = rows.filter(isLate)
    const dir = sort?.dir === 'asc' ? 1 : -1
    const key = sort?.key ?? 'created_at'
    rows = [...rows].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[key], bv = (b as unknown as Record<string, unknown>)[key]
      if (av == null) return 1; if (bv == null) return -1
      return av > bv ? dir : av < bv ? -dir : 0
    })
    return rows
  }, [data, search, statusKey, range, view, sort, nowMs]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = filtered.length
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const hasFilters = !!search || !!statusKey || !!range

  const columns: DataTableColumn<OrderListRow>[] = [
    { key: 'operation_code', header: 'TAS Kodu', sortable: true, cell: (r) => (
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs text-foreground">{r.operation_code}</span>
        {isLate(r) && <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger-foreground">Gecikti</span>}
      </div>
    ) },
    { key: 'customer_name', header: 'Müşteri', cell: (r) => <span className="text-sm font-medium text-foreground">{r.customer_name ?? '—'}</span> },
    { key: 'status', header: 'Durum', cell: (r) => r.status_label
      ? <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', toneClass(r.status_color))}>{r.status_label}</span> : '—' },
    { key: 'total', header: 'Tutar', sortable: true, cell: (r) => <span className="text-sm text-foreground">{formatMoney(r.total, r.currency)}</span> },
    { key: 'order_date', header: 'Sipariş', sortable: true, cell: (r) => <span className="text-sm text-text-secondary">{fmt(r.order_date)}</span> },
    { key: 'promised_delivery', header: 'Teslim (söz)', sortable: true, cell: (r) => (
      <span className={cn('text-sm', isLate(r) ? 'font-medium text-danger-foreground' : 'text-text-secondary')}>{fmt(r.promised_delivery)}</span>
    ) },
    { key: 'actual_delivery', header: 'Teslim (fiili)', hideable: true, cell: (r) => <span className="text-sm text-text-secondary">{fmt(r.actual_delivery)}</span> },
    { key: 'cargo', header: 'Kargo', hideable: true, defaultHidden: true, cell: (r) => r.tracking_number || r.carrier
      ? <span className="text-sm text-text-secondary">{[r.carrier, r.tracking_number].filter(Boolean).join(' · ')}</span>
      : <span className="text-text-muted text-sm">—</span> },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Siparişler" description="Onaylı siparişlerin üretim ve teslim süreci. Satıra tıklayınca ilgili operasyona gider." />

      <div className="flex flex-wrap gap-2">
        <Button variant={view === 'all' && !hasFilters ? 'default' : 'outline'} size="sm" onClick={() => { setView('all'); resetPage() }}><ClipboardList className="size-4" /> Tümü</Button>
        <Button variant={view === 'production' ? 'default' : 'outline'} size="sm" onClick={() => { setView('production'); resetPage() }}><Factory className="size-4" /> Üretimde</Button>
        <Button variant={view === 'shipping' ? 'default' : 'outline'} size="sm" onClick={() => { setView('shipping'); resetPage() }}><Truck className="size-4" /> Sevkiyatta</Button>
        <Button variant={view === 'delivered' ? 'default' : 'outline'} size="sm" onClick={() => { setView('delivered'); resetPage() }}><PackageCheck className="size-4" /> Teslim edilenler</Button>
        <Button variant={view === 'late' ? 'default' : 'outline'} size="sm" onClick={() => { setView('late'); resetPage() }}><AlertTriangle className="size-4" /> Gecikenler</Button>
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
        rowClassName={(r) => (isLate(r) ? 'bg-danger/5 hover:bg-danger/10' : undefined)}
        page={page} pageSize={pageSize} total={total}
        onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); resetPage() }}
        sort={sort} onSortChange={setSort}
        emptyState={<EmptyState icon={ClipboardList} title="Sipariş bulunamadı" description={hasFilters || view !== 'all' ? 'Filtreleri değiştirin.' : 'Siparişler operasyon kartından oluşturulur.'} />}
      />
    </div>
  )
}
