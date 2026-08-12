import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ClipboardList, Plus, Clock, AlertTriangle, UserRound, UserX, Shirt, HandHelping, GitMerge } from 'lucide-react'
import { useSignedUrl } from '@/hooks/useFiles'
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
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import {
  useOperationList, useOperationStageOptions, useRequestStatusOptions, useChannelOptions, useClaimOperation, type OperationRow,
} from '@/hooks/useOperations'
import { OperationFormDialog } from './OperationFormDialog'

const toneClass = (c: string | null): string =>
  c && (['success', 'warning', 'danger', 'info', 'neutral'] as string[]).includes(c)
    ? STATUS_TONE_CLASS[c as StatusTone] : 'bg-neutral-badge text-neutral-badge-foreground'

/** Teklif Süresi = son tarih ("29.07 Çar 14:00'a kadar"); süresi geçen kırmızı. */
function teklifSuresiCell(iso: string | null) {
  if (!iso) return <span className="text-text-muted text-xs">—</span>
  const d = new Date(iso)
  const label = d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' })
  const overdue = d.getTime() < Date.now()
  return <span className={cn('text-sm', overdue ? 'text-danger-foreground font-medium' : 'text-text-secondary')}>{label}{overdue ? '' : "'a kadar"}</span>
}
function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}
/** Liste önizleme — küçük thumbnail (Supabase transform, katalogdaki yaklaşım). Görsel
 *  yoksa kırık ikon değil, nötr bir ürün (tekstil) yer tutucusu. */
function Thumb({ path }: { path: string | null }) {
  const [noTx, setNoTx] = useState(false)
  const url = useSignedUrl(path ? { bucket: 'documents', storage_path: path } : null, path && !noTx ? { width: 120, resize: 'contain' } : undefined)
  if (!path) return <div className="bg-muted text-text-muted flex size-12 items-center justify-center rounded-md"><Shirt className="size-4" /></div>
  return url.data
    ? <img src={url.data} alt="" className="size-12 rounded-md bg-muted object-contain" loading="lazy" decoding="async" onError={() => { if (!noTx) setNoTx(true) }} />
    : <div className="size-12 animate-pulse rounded-md bg-muted" />
}

/** Talepler = operasyonlar. Sunucu tarafı liste/arama/filtre/sayfalama. */
export function OperationsListPage() {
  const navigate = useNavigate()
  const { data: me } = useCurrentUser()
  const [search, setSearch] = useState('')
  const [stageId, setStageId] = useState<string | null>(null)
  const [statusId, setStatusId] = useState<string | null>(null)
  const [channelId, setChannelId] = useState<string | null>(null)
  // QA#7a — rozet/gösterge ?view= filtresi (mount'ta URL'den). 'me' = açık dosyalarım, 'unassigned' = sahipsiz.
  const [sp] = useSearchParams()
  const [ownerId, setOwnerId] = useState<string | null>(
    sp.get('view') === 'sahipsiz' ? 'unassigned' : sp.get('view') === 'acik-dosyalarim' ? 'me' : null,
  )
  const [slaState, setSlaState] = useState<'overdue' | 'today' | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sort, setSort] = useState<SortState | null>({ key: 'created_at', dir: 'desc' })
  const [formOpen, setFormOpen] = useState(false)

  const stages = useOperationStageOptions()
  const statuses = useRequestStatusOptions()
  const channels = useChannelOptions()
  const owners = useAssigneeOptions()
  const claim = useClaimOperation()

  async function onClaim(id: number) {
    try {
      const r = await claim.mutateAsync(id)
      if (r.claimed) toast.success(r.already ? 'Zaten sizde.' : 'Talebi üstlendiniz.')
      else if (r.gone) toast.error('Talep bulunamadı.')
      else toast.error(`Bu talebi ${r.owner_name ?? 'başka biri'} üstlendi.`)
    } catch (err) { toast.error(await toUserMessage(err)) }
  }

  const resetPage = () => setPage(1)
  const filters = {
    search: search || undefined,
    stageId: stageId ? Number(stageId) : null,
    statusId: statusId ? Number(statusId) : null,
    channelId: channelId ? Number(channelId) : null,
    ownerId: ownerId === 'me' ? (me?.id ?? null) : ownerId, slaState, page, pageSize, sort,
  }
  const { data, isLoading, isFetching } = useOperationList(filters)
  const hasFilters = !!search || !!stageId || !!statusId || !!channelId || !!ownerId || !!slaState
  const clearAll = () => { setSearch(''); setStageId(null); setStatusId(null); setChannelId(null); setOwnerId(null); setSlaState(null); resetPage() }

  const columns: DataTableColumn<OperationRow>[] = [
    { key: 'photo', header: '', cell: (r) => <Thumb path={r.photo_path} /> },
    { key: 'code', header: 'Kod', sortable: true, cell: (r) => (
      <div className="min-w-0">
        <div className="flex items-center gap-1 font-mono text-xs text-foreground">
          {r.code}
          {r.possible_merge_with && <GitMerge className="text-warning-foreground size-3.5" aria-label="Birleştirme önerisi var" />}
        </div>
        {r.legacy_code && <div className="text-text-muted text-[10px]">{r.legacy_code}</div>}
      </div>
    ) },
    { key: 'customer', header: 'Müşteri', cell: (r) => (
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">{r.customer_name ?? '—'}</div>
        <div className="text-text-secondary truncate text-xs">{r.title}</div>
      </div>
    ) },
    { key: 'type', header: 'Kategori / Tür', hideable: true, defaultHidden: true, cell: (r) => (
      <span className="text-text-secondary text-sm">{[r.category_label, r.type_label].filter(Boolean).join(' · ') || '—'}</span>
    ) },
    { key: 'requested_at', header: 'Tarih', sortable: true, hideable: true, cell: (r) => <span className="text-text-secondary text-sm">{fmtDate(r.requested_at)}</span> },
    { key: 'stage', header: 'Aşama', cell: (r) => r.stage_label
      ? <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', toneClass(r.stage_color))}>{r.stage_label}</span> : '—' },
    { key: 'channel', header: 'Kanal', hideable: true, defaultHidden: true, cell: (r) => r.channel_label
      ? <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', toneClass(r.channel_color))}>{r.channel_label}</span> : '—' },
    { key: 'owner', header: 'Sorumlu', hideable: true, cell: (r) => r.owner_name
      ? r.owner_name
      : <Button size="sm" variant="outline" className="h-7" onClick={(e) => { e.stopPropagation(); void onClaim(r.id) }} disabled={claim.isPending}>
          <HandHelping className="size-3.5" /> Üstlen</Button> },
    { key: 'sla_deadline', header: 'Teklif Süresi', sortable: true, cell: (r) => teklifSuresiCell(r.sla_deadline) },
  ]

  const overdueRow = (r: OperationRow) =>
    r.sla_deadline && new Date(r.sla_deadline).getTime() < Date.now() && r.status_key !== 'teklif_iletildi'
      ? 'bg-danger/5 hover:bg-danger/10' : undefined

  return (
    <div className="space-y-5">
      <PageHeader
        title="Talepler"
        description="Her talep bir operasyondur (TAS kodu). Teklif dosyası yüklenince durum otomatik ilerler."
        action={<Button onClick={() => setFormOpen(true)}><Plus className="size-4" /> Talep oluştur</Button>}
      />

      <div className="flex flex-wrap gap-2">
        <Button variant={!hasFilters ? 'default' : 'outline'} size="sm" onClick={clearAll}><ClipboardList className="size-4" /> Tümü</Button>
        <Button variant={slaState === 'overdue' ? 'default' : 'outline'} size="sm" onClick={() => { setSlaState('overdue'); resetPage() }}>
          <AlertTriangle className="size-4" /> Süresi dolanlar</Button>
        <Button variant={slaState === 'today' ? 'default' : 'outline'} size="sm" onClick={() => { setSlaState('today'); resetPage() }}>
          <Clock className="size-4" /> Bugün dolacaklar</Button>
        {me && <Button variant={ownerId === me.id ? 'default' : 'outline'} size="sm" onClick={() => { setOwnerId(me.id); resetPage() }}>
          <UserRound className="size-4" /> Bana atananlar</Button>}
        <Button variant={ownerId === 'unassigned' ? 'default' : 'outline'} size="sm" onClick={() => { setOwnerId('unassigned'); resetPage() }}>
          <UserX className="size-4" /> Atanmamış</Button>
      </div>

      <FilterBar
        search={search} onSearchChange={(v) => { setSearch(v); resetPage() }}
        searchPlaceholder="Kod, eski kod, proje veya müşteri ara…"
        showClear={hasFilters} onClear={clearAll}
      >
        <SearchableSelect options={(stages.data ?? []).map((s) => ({ value: String(s.id), label: s.label }))} value={stageId} onChange={(v) => { setStageId(v); resetPage() }} placeholder="Aşama" clearable className="w-40" />
        <SearchableSelect options={(statuses.data ?? []).map((s) => ({ value: String(s.id), label: s.label }))} value={statusId} onChange={(v) => { setStatusId(v); resetPage() }} placeholder="Durum" clearable className="w-40" />
        <SearchableSelect options={(channels.data ?? []).map((c) => ({ value: String(c.id), label: c.label }))} value={channelId} onChange={(v) => { setChannelId(v); resetPage() }} placeholder="Kanal" clearable className="w-40" />
        <SearchableSelect options={[{ value: 'unassigned', label: 'Atanmamış' }, ...(owners.data ?? []).map((u) => ({ value: u.id, label: u.full_name }))]} value={ownerId} onChange={(v) => { setOwnerId(v); resetPage() }} placeholder="Sorumlu" clearable className="w-44" />
      </FilterBar>

      <DataTable
        columns={columns} data={data?.rows ?? []} rowKey={(r) => String(r.id)}
        loading={isLoading || isFetching} columnToggle
        onRowClick={(r) => navigate(`/talepler/${r.id}`)}
        rowClassName={overdueRow}
        renderMobileCard={(r) => (
          <div className="flex gap-3">
            <Thumb path={r.photo_path} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{r.customer_name ?? '—'}</div>
                  <div className="text-text-secondary truncate text-xs">{r.title}</div>
                </div>
                {r.stage_label && <span className={cn('shrink-0 rounded-md px-2 py-0.5 text-xs font-medium', toneClass(r.stage_color))}>{r.stage_label}</span>}
              </div>
              <div className="text-text-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="font-mono">{r.code}</span>
                {r.channel_label && <span>{r.channel_label}</span>}
                <span>{fmtDate(r.requested_at)}</span>
                {teklifSuresiCell(r.sla_deadline)}
              </div>
            </div>
          </div>
        )}
        page={page} pageSize={pageSize} total={data?.total ?? 0}
        onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); resetPage() }}
        sort={sort} onSortChange={setSort}
        emptyState={<EmptyState icon={ClipboardList} title="Talep bulunamadı" description={hasFilters ? 'Filtreleri değiştirin.' : 'İlk talebi oluşturun.'}
          action={!hasFilters ? <Button variant="outline" onClick={() => setFormOpen(true)}>Talep oluştur</Button> : undefined} />}
      />

      <OperationFormDialog open={formOpen} onOpenChange={setFormOpen} onCreated={(id) => navigate(`/talepler/${id}`)} />
    </div>
  )
}
