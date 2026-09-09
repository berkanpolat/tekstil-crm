import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Zap, Phone, PhoneCall, FileText, ListChecks, Inbox, Clock, MessageSquare, MessageCircle,
  Mail, Camera, Send, Globe, Pencil,
} from 'lucide-react'
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
import { useOperationList, useChannelOptions, type OperationRow } from '@/hooks/useOperations'
import { useLastNotes, useWorklist, type WorklistBucket } from '@/hooks/useCalisma'
import { CalismaDetailPanel } from './CalismaDetailPanel'
import { tabStorageKey, formatWaiting, formatRelative, isStale, stepIndex } from './calismaUtils'

/** Son aksiyon hücresinde kanal ikonu (interaction_channels.key). */
const CHANNEL_ICON: Record<string, typeof Phone> = {
  telefon: Phone, whatsapp: MessageCircle, instagram: Camera, email: Mail, eposta: Mail, telegram: Send, web: Globe, website: Globe,
}
const ALLOWED = ['success', 'warning', 'danger', 'info', 'neutral']
const toneOf = (c: string | null): StatusTone => (ALLOWED.includes(c ?? '') ? (c as StatusTone) : 'neutral')
const toneClass = (c: string | null): string =>
  c && ALLOWED.includes(c) ? STATUS_TONE_CLASS[c as StatusTone] : 'bg-neutral-badge text-neutral-badge-foreground'
const TONE_TEXT: Record<StatusTone, string> = {
  success: 'text-success-foreground', danger: 'text-danger-foreground',
  warning: 'text-warning-foreground', info: 'text-info-foreground', neutral: 'text-text-muted',
}

// 5 özet kartı (kova). Tıklayınca liste o kovanın id'leriyle filtrelenir.
const CARDS: { bucket: WorklistBucket; label: string; icon: typeof Phone; tone: StatusTone }[] = [
  { bucket: 'bugun_aranacaklar', label: 'Bugün aranacaklar', icon: Phone, tone: 'danger' },
  { bucket: 'arandi', label: 'Arandı', icon: PhoneCall, tone: 'success' },
  { bucket: 'gelen_talep', label: 'Gelen talep', icon: Inbox, tone: 'info' },
  { bucket: 'bekleyen_talep', label: 'Bekleyen talep', icon: Clock, tone: 'warning' },
  { bucket: 'iletilen_teklif', label: 'İletilen teklif', icon: FileText, tone: 'info' },
]
const VALID_BUCKETS = new Set(CARDS.map((c) => c.bucket))
const defaultBucketForRole = (roleKey: string | null | undefined): WorklistBucket | null =>
  roleKey === 'sales' ? 'bugun_aranacaklar' : null

/**
 * Hızlı Çalışma Ekranı (/calisma) — PROTOTİP. Üstte 5 özet kartı; kart tıklanınca
 * liste o kovanın (calisma_worklist RPC) id'leriyle filtrelenir. "Bugün aranacaklar"
 * en eski teklif üstte (sent_at asc). Satıra tıkla → yan panelden aksiyon/teklif sonucu.
 * Aşama ve son sonuç salt bilgidir; durum yalnız aksiyon ekleyerek değişir.
 */
export function CalismaPage() {
  const { data: me } = useCurrentUser()
  const navigate = useNavigate()
  const [nowMs] = useState(() => Date.now())

  // v1: tüm kovalar "bugün" (RPC p_from/p_to null → bugün).
  const worklist = useWorklist(null, null)
  const counts = worklist.data?.counts

  // Aktif kova (null = Tümü). İlk açılış: son seçim (localStorage) → yoksa role varsayılanı.
  const [bucket, setBucket] = useState<WorklistBucket | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (ready || me === undefined) return
    const saved = localStorage.getItem(tabStorageKey(me?.id))
    setBucket(saved && VALID_BUCKETS.has(saved as WorklistBucket) ? (saved as WorklistBucket) : saved === 'tumu' ? null : defaultBucketForRole(me?.role_key))
    setReady(true)
  }, [me, ready])
  const selectBucket = (b: WorklistBucket | null) => {
    setBucket(b); setPage(1)
    if (me?.id) localStorage.setItem(tabStorageKey(me.id), b ?? 'tumu')
  }

  const [search, setSearch] = useState('')
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [channelId, setChannelId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [sort, setSort] = useState<SortState | null>({ key: 'created_at', dir: 'desc' })
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const owners = useAssigneeOptions()
  const channels = useChannelOptions()
  const resetPage = () => setPage(1)

  // Kova modunda: worklist id'lerini (sıralı) sayfaya böl, o dilimi getir, sırayı koru.
  const bucketIds = bucket ? worklist.data?.ids[bucket] ?? [] : null
  const total = bucket ? bucketIds!.length : undefined
  const pageIds = bucket ? bucketIds!.slice((page - 1) * pageSize, page * pageSize) : null

  const filters = bucket
    ? { operationIds: pageIds ?? [], page: 1, pageSize, sort: null }
    : { search: search || undefined, channelId: channelId ? Number(channelId) : null, ownerId, page, pageSize, sort }
  const { data, isLoading, isFetching } = useOperationList(filters)

  // Kova modunda satırları verilen id sırasına (sent_at asc vb.) göre yeniden diz.
  const rows = useMemo(() => {
    const fetched = data?.rows ?? []
    if (!bucket) return fetched
    const byId = new Map(fetched.map((r) => [r.id, r]))
    return (pageIds ?? []).map((id) => byId.get(id)).filter(Boolean) as OperationRow[]
  }, [data?.rows, bucket, pageIds])

  const loading = (bucket ? worklist.isLoading : false) || isLoading || isFetching

  // Son aksiyon + bekleme — sayfadaki operasyonlar için toplu tek sorgu.
  const opIds = useMemo(() => rows.map((r) => r.id), [rows])
  const lastNotes = useLastNotes(opIds)
  const waitingBasis = (r: OperationRow) => lastNotes.data?.get(r.id)?.occurred_at ?? r.requested_at ?? r.created_at

  // Yan panel + klavye ok gezinmesi (sayfa içinde).
  const selectedIndex = selectedId == null ? -1 : rows.findIndex((r) => r.id === selectedId)
  const selectedRow = selectedIndex >= 0 ? rows[selectedIndex]! : null
  const navigateRow = (dir: 'prev' | 'next') => {
    const next = stepIndex(selectedIndex, rows.length, dir)
    if (next >= 0 && next !== selectedIndex) setSelectedId(rows[next]!.id)
  }
  useEffect(() => {
    if (selectedId == null) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowDown') { e.preventDefault(); navigateRow('next') }
      else if (e.key === 'ArrowUp') { e.preventDefault(); navigateRow('prev') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, selectedIndex, rows])

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
    // Aşama — SALT BİLGİ. Çocuk kayıtların yansıması; trigger'larla ilerler.
    { key: 'stage', header: 'Aşama', cell: (r) => r.stage_label
      ? <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', toneClass(r.stage_color))}>{r.stage_label}</span> : '—' },
    // Son sonuç — son aksiyonun outcome'u (SALT BİLGİ).
    { key: 'outcome', header: 'Son sonuç', cell: (r) => {
      const n = lastNotes.data?.get(r.id)
      return n?.outcome_label
        ? <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', toneClass(n.outcome_color))}>{n.outcome_label}</span>
        : <span className="text-text-muted text-xs">—</span>
    } },
    { key: 'action', header: 'Son aksiyon', className: 'max-w-[300px]', cell: (r) => {
      const n = lastNotes.data?.get(r.id)
      if (lastNotes.isLoading) return <span className="text-text-muted text-xs">…</span>
      if (!n) return <span className="text-text-muted text-xs">—</span>
      const Icon = (n.channel_key && CHANNEL_ICON[n.channel_key]) || MessageSquare
      return (
        <div className="min-w-0">
          <div className="text-text-muted flex items-center gap-1.5 text-[11px]">
            <Icon className={cn('size-3.5 shrink-0', TONE_TEXT[toneOf(n.channel_color)])} />
            <span>{formatRelative(n.occurred_at, nowMs)}</span>
          </div>
          {n.summary && <span className="text-text-secondary line-clamp-1 mt-0.5 block text-xs">{n.summary}</span>}
        </div>
      )
    } },
    { key: 'waiting', header: 'Bekleme', cell: (r) => {
      const basis = waitingBasis(r)
      return <span className={cn('text-sm', isStale(basis, nowMs) ? 'text-danger-foreground font-medium' : 'text-text-secondary')}>{formatWaiting(basis, nowMs)}</span>
    } },
    { key: 'owner', header: 'Takip eden', cell: (r) => (
      <span className={cn('text-sm', r.owner_name ? 'text-text-secondary' : 'text-text-muted')}>{r.owner_name ?? 'Atanmamış'}</span>
    ) },
    { key: 'edit', header: '', align: 'right', cell: (r) => (
      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); navigate(`/talepler/${r.id}`) }}>
        <Pencil className="size-3.5" /> Düzenle
      </Button>
    ) },
  ]

  const hasFilters = !!search || !!ownerId || !!channelId
  const clearAll = () => { setSearch(''); setOwnerId(null); setChannelId(null); resetPage() }
  const activeCard = CARDS.find((c) => c.bucket === bucket)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hızlı Çalışma"
        description="Üstteki karta tıkla → o iş listesi. Satıra tıkla → yan panelden aksiyon ekle, teklif sonucu işaretle. Aşama ve son sonuç salt bilgidir."
      />

      {/* Özet kartları */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {CARDS.map((c) => {
          const Icon = c.icon
          const active = bucket === c.bucket
          const n = counts?.[c.bucket]
          return (
            <button key={c.bucket} type="button" onClick={() => selectBucket(active ? null : c.bucket)}
              className={cn('flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors',
                active ? 'border-accent-primary bg-accent-pale' : 'bg-card hover:bg-subtle')}>
              <span className="text-text-secondary flex items-center gap-1.5 text-xs">
                <Icon className={cn('size-3.5', TONE_TEXT[c.tone])} /> {c.label}
              </span>
              <span className="text-2xl font-semibold tabular-nums text-foreground">{worklist.isLoading ? '…' : n ?? 0}</span>
            </button>
          )
        })}
      </div>

      {/* Aktif kova bandı / Tümü */}
      <div className="flex items-center gap-2">
        <Button variant={bucket ? 'outline' : 'default'} size="sm" onClick={() => selectBucket(null)}>
          <ListChecks className="size-4" /> Tümü
        </Button>
        {activeCard && (
          <span className="text-text-secondary text-sm">
            <span className="font-medium text-foreground">{activeCard.label}</span> · {total ?? 0} kayıt
          </span>
        )}
      </div>

      {/* Serbest filtreler yalnız Tümü modunda (kova modu = kovanın kendisi filtredir) */}
      {!bucket && (
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
      )}

      <DataTable
        columns={columns} data={rows} rowKey={(r) => String(r.id)}
        loading={loading} columnToggle={false}
        onRowClick={(r) => setSelectedId(r.id)}
        rowClassName={(r) => (r.id === selectedId ? 'bg-accent-pale/60 hover:bg-accent-pale/60' : undefined)}
        page={page} pageSize={pageSize} total={bucket ? (total ?? 0) : (data?.total ?? 0)}
        onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); resetPage() }}
        pageSizeOptions={[50, 100]}
        sort={bucket ? null : sort} onSortChange={bucket ? undefined : setSort}
        emptyState={<EmptyState icon={Zap} title="Kayıt yok"
          description={bucket === 'bugun_aranacaklar' ? 'Bugün aranacak talep yok.' : hasFilters ? 'Filtreleri değiştirin.' : 'Bu listede kayıt yok.'} />}
      />

      <CalismaDetailPanel
        row={selectedRow}
        onOpenChange={(open) => { if (!open) setSelectedId(null) }}
        onNavigate={navigateRow}
        hasPrev={selectedIndex > 0}
        hasNext={selectedIndex >= 0 && selectedIndex < rows.length - 1}
        position={selectedIndex >= 0 ? `${selectedIndex + 1}/${rows.length}` : undefined}
      />
    </div>
  )
}
