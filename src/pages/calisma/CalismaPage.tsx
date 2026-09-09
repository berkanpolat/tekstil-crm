import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Phone, FileText, ListChecks, MessageSquare } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { DataTable, type DataTableColumn, type SortState } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { STATUS_TONE_CLASS, type StatusTone } from '@/lib/statuses'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useAssigneeOptions } from '@/hooks/useLeads'
import {
  useOperationList, useOperationStageOptions, useChannelOptions, type OperationRow,
} from '@/hooks/useOperations'
import { useLastNotes } from '@/hooks/useCalisma'
import {
  CALISMA_TABS, defaultTabForRole, parseTab, tabStorageKey, formatWaiting, isStale,
  type CalismaTab,
} from './calismaUtils'

const TAB_ICON: Record<CalismaTab, typeof Phone> = { bugun: Phone, teklif: FileText, tumu: ListChecks }

const toneClass = (c: string | null): string =>
  c && (['success', 'warning', 'danger', 'info', 'neutral'] as string[]).includes(c)
    ? STATUS_TONE_CLASS[c as StatusTone] : 'bg-neutral-badge text-neutral-badge-foreground'

/**
 * Hızlı Çalışma Ekranı (/calisma) — PROTOTİP, Paket 1: tek liste, salt-okunur.
 * Zengin veri modelini koruyup üstüne hızlı bir tarama yüzeyi koyar. Satır içi
 * güncelleme (P2), yan panel (P3) ve hızlı kayıt (P4) sonraki paketlerde gelir.
 */
export function CalismaPage() {
  const navigate = useNavigate()
  const { data: me } = useCurrentUser()

  // Bekleme süresi için sabit "şimdi" (render purity: Date.now() render'da yasak).
  const [nowMs] = useState(() => Date.now())

  const [tab, setTab] = useState<CalismaTab>('tumu')
  // İlk açılış: kullanıcının son seçtiği sekme (localStorage) → yoksa role göre varsayılan.
  const [tabReady, setTabReady] = useState(false)
  useEffect(() => {
    if (tabReady || me === undefined) return
    const saved = parseTab(localStorage.getItem(tabStorageKey(me?.id)))
    setTab(saved ?? defaultTabForRole(me?.role_key))
    setTabReady(true)
  }, [me, tabReady])
  const selectTab = (t: CalismaTab) => {
    setTab(t); setPage(1)
    if (me?.id) localStorage.setItem(tabStorageKey(me.id), t)
  }

  const [search, setSearch] = useState('')
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [channelId, setChannelId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [sort, setSort] = useState<SortState | null>({ key: 'created_at', dir: 'desc' })

  const stages = useOperationStageOptions()
  const owners = useAssigneeOptions()
  const channels = useChannelOptions()

  // Sekme → mevcut useOperationList filtresine eşleme:
  //  - teklif: aşama = teklif_bekliyor
  //  - bugun : SLA süresi geçmiş açık talepler (P1 ara-çözüm). Nihai sürüm P4'te
  //            customers.next_action_at'e bağlanacak (o alan hızlı kayıtta yazılıyor).
  //  - tumu  : filtresiz
  const teklifStageId = useMemo(
    () => stages.data?.find((s) => s.key === 'teklif_bekliyor')?.id ?? null,
    [stages.data],
  )
  const resetPage = () => setPage(1)

  const filters = {
    search: search || undefined,
    stageId: tab === 'teklif' ? teklifStageId : null,
    channelId: channelId ? Number(channelId) : null,
    ownerId,
    slaState: tab === 'bugun' ? ('overdue' as const) : null,
    page, pageSize, sort,
  }
  const { data, isLoading, isFetching } = useOperationList(filters)
  const rows = data?.rows ?? []

  // Son not + son temas (bekleme) — sayfadaki operasyonlar için toplu tek sorgu.
  const opIds = useMemo(() => rows.map((r) => r.id), [rows])
  const lastNotes = useLastNotes(opIds)
  const waitingBasis = (r: OperationRow) =>
    lastNotes.data?.get(r.id)?.occurred_at ?? r.requested_at ?? r.created_at

  const columns: DataTableColumn<OperationRow>[] = [
    { key: 'customer', header: 'Müşteri', cell: (r) => (
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">{r.customer_name ?? '—'}</div>
        <div className="text-text-muted truncate font-mono text-[10px]">{r.code}</div>
      </div>
    ) },
    { key: 'product', header: 'Ürün', cell: (r) => (
      <div className="min-w-0">
        <div className="truncate text-sm text-foreground">{r.title}</div>
        {(r.category_label || r.type_label) && (
          <div className="text-text-secondary truncate text-xs">{[r.category_label, r.type_label].filter(Boolean).join(' · ')}</div>
        )}
      </div>
    ) },
    { key: 'stage', header: 'Durum', cell: (r) => r.stage_label
      ? <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', toneClass(r.stage_color))}>{r.stage_label}</span> : '—' },
    { key: 'note', header: 'Son not', className: 'max-w-[280px]', cell: (r) => {
      const n = lastNotes.data?.get(r.id)
      if (lastNotes.isLoading) return <span className="text-text-muted text-xs">…</span>
      if (!n?.summary) return <span className="text-text-muted text-xs">—</span>
      return (
        <div className="min-w-0">
          <div className="flex items-start gap-1.5">
            <MessageSquare className="text-text-muted mt-0.5 size-3.5 shrink-0" />
            <span className="text-text-secondary line-clamp-2 text-xs">{n.summary}</span>
          </div>
          {n.author_name && <div className="text-text-muted pl-5 text-[10px]">{n.author_name}</div>}
        </div>
      )
    } },
    { key: 'waiting', header: 'Bekleme', cell: (r) => {
      const basis = waitingBasis(r)
      return (
        <span className={cn('text-sm', isStale(basis, nowMs) ? 'text-danger-foreground font-medium' : 'text-text-secondary')}>
          {formatWaiting(basis, nowMs)}
        </span>
      )
    } },
    { key: 'owner', header: 'Takip eden', cell: (r) => (
      <span className={cn('text-sm', r.owner_name ? 'text-text-secondary' : 'text-text-muted')}>{r.owner_name ?? 'Atanmamış'}</span>
    ) },
  ]

  const hasFilters = !!search || !!ownerId || !!channelId
  const clearAll = () => { setSearch(''); setOwnerId(null); setChannelId(null); resetPage() }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hızlı Çalışma"
        description="Tek liste; müşteri, durum ve son notu tek bakışta gör. (Deneme sürüyor — satır içi güncelleme ve yan panel yakında.)"
      />

      <div className="flex flex-wrap gap-2">
        {CALISMA_TABS.map(({ key, label }) => {
          const Icon = TAB_ICON[key]
          return (
            <Button key={key} variant={tab === key ? 'default' : 'outline'} size="sm" onClick={() => selectTab(key)}>
              <Icon className="size-4" /> {label}
            </Button>
          )
        })}
      </div>

      <FilterBar
        search={search} onSearchChange={(v) => { setSearch(v); resetPage() }}
        searchPlaceholder="Müşteri, kod veya proje ara…"
        showClear={hasFilters} onClear={clearAll}
      >
        <SearchableSelect
          options={[{ value: 'unassigned', label: 'Atanmamış' }, ...(owners.data ?? []).map((u) => ({ value: u.id, label: u.full_name }))]}
          value={ownerId} onChange={(v) => { setOwnerId(v); resetPage() }} placeholder="Takip eden" clearable className="w-44" />
        <SearchableSelect
          options={(channels.data ?? []).map((c) => ({ value: String(c.id), label: c.label }))}
          value={channelId} onChange={(v) => { setChannelId(v); resetPage() }} placeholder="Kanal" clearable className="w-40" />
      </FilterBar>

      <DataTable
        columns={columns} data={rows} rowKey={(r) => String(r.id)}
        loading={isLoading || isFetching} columnToggle={false}
        onRowClick={(r) => navigate(`/talepler/${r.id}`)}
        page={page} pageSize={pageSize} total={data?.total ?? 0}
        onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); resetPage() }}
        pageSizeOptions={[50, 100]}
        sort={sort} onSortChange={setSort}
        emptyState={<EmptyState icon={Zap} title="Kayıt yok"
          description={tab === 'bugun' ? 'Bugün acil aranacak talep görünmüyor.' : hasFilters ? 'Filtreleri değiştirin.' : 'Bu listede kayıt yok.'} />}
      />
    </div>
  )
}
