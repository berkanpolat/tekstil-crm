import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Clock, AlertTriangle, ThumbsUp } from 'lucide-react'
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
import { useAssigneeOptions } from '@/hooks/useLeads'
import { useAllQuotes, type QuoteListRow } from '@/hooks/useQuotes'

const toneClass = (c: string | null): string =>
  c && (['success', 'warning', 'danger', 'info', 'neutral'] as string[]).includes(c)
    ? STATUS_TONE_CLASS[c as StatusTone] : 'bg-neutral-badge text-neutral-badge-foreground'
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

/** Kapalı (artık bekleme olmayan) teklif durumları — "süresi doldu" işareti bunlarda gösterilmez. */
const CLOSED = new Set(['numune_asamasina_gecildi', 'kabul_edildi', 'olumsuz', 'reddedildi', 'iptal_edildi', 'suresi_doldu'])
/** Sonuç filtresi grupları (durum sözlüğü iki dilli olduğundan anahtar kümesiyle eşleriz). */
const RESULT_GROUPS: Record<string, { label: string; keys: string[] }> = {
  bekliyor: { label: 'Cevap bekleniyor', keys: ['cevap_bekleniyor', 'incelemede', 'musteri_inceliyor', 'gonderildi', 'gonderilmeye_hazir', 'hazirlaniyor'] },
  olumlu: { label: 'Olumlu — beklemede', keys: ['olumlu_beklemede', 'revize_bekleniyor'] },
  numune: { label: 'Numuneye geçildi', keys: ['numune_asamasina_gecildi', 'kabul_edildi'] },
  olumsuz: { label: 'Olumsuz', keys: ['olumsuz', 'reddedildi', 'iptal_edildi', 'suresi_doldu'] },
}
const resultOf = (key: string | null): string | null => {
  for (const [g, def] of Object.entries(RESULT_GROUPS)) if (key && def.keys.includes(key)) return g
  return null
}

type View = 'all' | 'waiting' | 'expired' | 'positive'

export function TekliflerListPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useAllQuotes()
  const owners = useAssigneeOptions()
  const [nowMs] = useState(() => Date.now())

  const [view, setView] = useState<View>('all')
  const [search, setSearch] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [preparer, setPreparer] = useState<string | null>(null)
  const [range, setRange] = useState<DateRange | undefined>()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sort, setSort] = useState<SortState | null>({ key: 'created_at', dir: 'desc' })

  const isExpired = (q: QuoteListRow) => !!q.valid_until && new Date(q.valid_until).getTime() < nowMs && !CLOSED.has(q.status_key ?? '')
  const resetPage = () => setPage(1)

  const filtered = useMemo(() => {
    let rows = data ?? []
    const s = search.trim().toLocaleLowerCase('tr')
    if (s) rows = rows.filter((r) => r.operation_code.toLocaleLowerCase('tr').includes(s) || (r.customer_name ?? '').toLocaleLowerCase('tr').includes(s))
    if (result) rows = rows.filter((r) => resultOf(r.status_key) === result)
    if (preparer) rows = rows.filter((r) => r.prepared_by === owners.data?.find((u) => u.id === preparer)?.full_name)
    if (range?.from) rows = rows.filter((r) => new Date(r.created_at).getTime() >= range.from!.getTime())
    if (range?.to) rows = rows.filter((r) => new Date(r.created_at).getTime() <= range.to!.getTime())
    if (view === 'waiting') rows = rows.filter((r) => resultOf(r.status_key) === 'bekliyor')
    if (view === 'positive') rows = rows.filter((r) => r.status_key === 'olumlu_beklemede')
    if (view === 'expired') rows = rows.filter(isExpired)
    const dir = sort?.dir === 'asc' ? 1 : -1
    const key = sort?.key ?? 'created_at'
    rows = [...rows].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[key], bv = (b as unknown as Record<string, unknown>)[key]
      if (av == null) return 1; if (bv == null) return -1
      return av > bv ? dir : av < bv ? -dir : 0
    })
    return rows
  }, [data, search, result, preparer, range, view, sort, owners.data, nowMs]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = filtered.length
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const hasFilters = !!search || !!result || !!preparer || !!range

  const columns: DataTableColumn<QuoteListRow>[] = [
    { key: 'operation_code', header: 'TAS Kodu', sortable: true, cell: (r) => (
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs text-foreground">{r.operation_code}</span>
        {isExpired(r) && <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger-foreground">Süresi doldu</span>}
      </div>
    ) },
    { key: 'customer_name', header: 'Müşteri', cell: (r) => <span className="text-sm font-medium text-foreground">{r.customer_name ?? '—'}</span> },
    { key: 'version', header: 'Ver.', sortable: true, cell: (r) => <span className="font-mono text-sm text-text-secondary">v{r.version}</span> },
    { key: 'total', header: 'Tutar', sortable: true, cell: (r) => <span className="text-sm text-foreground">{r.total ? formatMoney(r.total, r.currency) : <span className="text-text-muted">—</span>}</span> },
    { key: 'created_at', header: 'Tarih', sortable: true, cell: (r) => <span className="text-sm text-text-secondary">{fmt(r.created_at)}</span> },
    { key: 'valid_until', header: 'Geçerlilik', sortable: true, cell: (r) => (
      <span className={cn('text-sm', isExpired(r) ? 'font-medium text-danger-foreground' : 'text-text-secondary')}>{fmt(r.valid_until)}</span>
    ) },
    { key: 'status', header: 'Durum / Sonuç', cell: (r) => r.status_label
      ? <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', toneClass(r.status_color))}>{r.status_label}</span> : '—' },
    { key: 'prepared_by', header: 'Hazırlayan', hideable: true, cell: (r) => <span className="text-sm text-text-secondary">{r.prepared_by ?? '—'}</span> },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Teklifler" description="Tüm fiyat teklifleri, sürümleri ve sonuçları. Satıra tıklayınca ilgili operasyona gider." />

      <div className="flex flex-wrap gap-2">
        <Button variant={view === 'all' && !hasFilters ? 'default' : 'outline'} size="sm" onClick={() => { setView('all'); resetPage() }}><FileText className="size-4" /> Tümü</Button>
        <Button variant={view === 'waiting' ? 'default' : 'outline'} size="sm" onClick={() => { setView('waiting'); resetPage() }}><Clock className="size-4" /> Cevap bekleyenler</Button>
        <Button variant={view === 'expired' ? 'default' : 'outline'} size="sm" onClick={() => { setView('expired'); resetPage() }}><AlertTriangle className="size-4" /> Süresi dolanlar</Button>
        <Button variant={view === 'positive' ? 'default' : 'outline'} size="sm" onClick={() => { setView('positive'); resetPage() }}><ThumbsUp className="size-4" /> Olumlu beklemede</Button>
      </div>

      <FilterBar
        search={search} onSearchChange={(v) => { setSearch(v); resetPage() }}
        searchPlaceholder="TAS kodu veya müşteri ara…"
        showClear={hasFilters} onClear={() => { setSearch(''); setResult(null); setPreparer(null); setRange(undefined); resetPage() }}
      >
        <SearchableSelect className="w-48" clearable placeholder="Sonuç"
          options={Object.entries(RESULT_GROUPS).map(([k, d]) => ({ value: k, label: d.label }))}
          value={result} onChange={(v) => { setResult(v); resetPage() }} />
        <SearchableSelect className="w-44" clearable placeholder="Hazırlayan"
          options={(owners.data ?? []).map((u) => ({ value: u.id, label: u.full_name }))}
          value={preparer} onChange={(v) => { setPreparer(v); resetPage() }} />
        <DateRangePicker value={range} onChange={(r) => { setRange(r); resetPage() }} />
      </FilterBar>

      <DataTable
        columns={columns} data={pageRows} rowKey={(r) => String(r.id)} loading={isLoading} columnToggle
        onRowClick={(r) => navigate(`/talepler/${r.operation_id}`)}
        rowClassName={(r) => (isExpired(r) ? 'bg-danger/5 hover:bg-danger/10' : undefined)}
        page={page} pageSize={pageSize} total={total}
        onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); resetPage() }}
        sort={sort} onSortChange={setSort}
        emptyState={<EmptyState icon={FileText} title="Teklif bulunamadı" description={hasFilters || view !== 'all' ? 'Filtreleri değiştirin.' : 'Teklifler operasyon kartından oluşturulur.'} />}
      />
    </div>
  )
}
