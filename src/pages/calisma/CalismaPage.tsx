import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Zap, Phone, FileText, ListChecks, MessageSquare, ChevronDown, Pencil, Plus, Check } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { DataTable, type DataTableColumn, type SortState } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { toUserMessage } from '@/lib/errors'
import { STATUS_TONE_CLASS, type StatusTone } from '@/lib/statuses'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useAssigneeOptions } from '@/hooks/useLeads'
import {
  useOperationList, useOperationStageOptions, useChannelOptions, useRequestStatusOptions,
  useUpdateOperation, type OperationRow,
} from '@/hooks/useOperations'
import { useAddOperationInteraction } from '@/hooks/useOperationActivity'
import { useLastNotes } from '@/hooks/useCalisma'
import { CalismaDetailPanel } from './CalismaDetailPanel'
import {
  CALISMA_TABS, defaultTabForRole, parseTab, tabStorageKey, formatWaiting, isStale, stepIndex,
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
  const { data: me } = useCurrentUser()
  const navigate = useNavigate()
  const qc = useQueryClient()

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
  const [selectedId, setSelectedId] = useState<number | null>(null)
  // Satır içi not düzenleme (Enter → interactions).
  const [noteEditId, setNoteEditId] = useState<number | null>(null)
  const [noteDraft, setNoteDraft] = useState('')

  const stages = useOperationStageOptions()
  const owners = useAssigneeOptions()
  const channels = useChannelOptions()
  const requestStatuses = useRequestStatusOptions()
  const updateOp = useUpdateOperation()
  const addInteraction = useAddOperationInteraction()
  // Not kanalı varsayılan "telefon" — Zeynep her seferinde seçmesin.
  const telefonChannelId = useMemo(
    () => channels.data?.find((c) => c.key === 'telefon')?.id ?? null,
    [channels.data],
  )

  // B — hafif talep durumu (request_status_id). Aşama (stage_id) DEĞİL; aşama
  // çocuk kayıtların yansıması olarak trigger'larla ilerler, satır içinden değişmez.
  async function changeStatus(row: OperationRow, statusId: number) {
    if (statusId === undefined) return
    try {
      await updateOp.mutateAsync({ id: row.id, request_status_id: statusId })
    } catch (err) { toast.error(await toUserMessage(err)) }
  }

  // Satır içi not → interactions (kanal varsayılan telefon, yön giden).
  async function saveNote(row: OperationRow) {
    const text = noteDraft.trim()
    if (!text) { setNoteEditId(null); return }
    if (telefonChannelId == null) { toast.error('Telefon kanalı bulunamadı; not kaydedilemedi.'); return }
    try {
      await addInteraction.mutateAsync({
        operation_id: row.id, customer_id: row.customer_id, channel_id: telefonChannelId,
        outcome_id: null, direction: 'outbound', occurred_at: new Date().toISOString(), summary: text,
      })
      await qc.invalidateQueries({ queryKey: ['calisma-last-notes'] })
      setNoteEditId(null); setNoteDraft('')
      toast.success('Not eklendi.')
    } catch (err) { toast.error(await toUserMessage(err)) }
  }

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

  // Yan panel — seçili satır + klavye ok gezinmesi (mevcut sayfa içinde).
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
    // Aşama — SALT BİLGİ (tıklanmaz). Çocuk kayıtların yansıması; trigger'larla ilerler.
    { key: 'stage', header: 'Aşama', cell: (r) => r.stage_label
      ? <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', toneClass(r.stage_color))}>{r.stage_label}</span> : '—' },
    // Durum — hafif talep durumu (request_status); tıkla → açılır liste → kaydet.
    { key: 'status', header: 'Durum', cell: (r) => (
      <div onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="hover:bg-subtle inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-border">
              {r.status_label ?? 'Belirle'}
              <ChevronDown className="size-3 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(requestStatuses.data ?? []).map((s) => (
              <DropdownMenuItem key={s.id} onClick={() => void changeStatus(r, s.id)}>
                {s.key === r.status_key && <Check className="size-3.5" />}
                <span className={cn(s.key === r.status_key ? 'font-medium' : '', s.key !== r.status_key && 'pl-[18px]')}>{s.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ) },
    { key: 'note', header: 'Son not', className: 'max-w-[300px]', cell: (r) => {
      if (noteEditId === r.id) {
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <Input
              autoFocus value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Not yaz, Enter ile kaydet…" className="h-8 text-xs"
              disabled={addInteraction.isPending}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); void saveNote(r) }
                else if (e.key === 'Escape') { e.preventDefault(); setNoteEditId(null); setNoteDraft('') }
              }}
              onBlur={() => { if (!addInteraction.isPending) { setNoteEditId(null); setNoteDraft('') } }}
            />
          </div>
        )
      }
      const n = lastNotes.data?.get(r.id)
      return (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setNoteDraft(''); setNoteEditId(r.id) }}
          className="hover:bg-subtle group -mx-1 flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left"
          title="Not eklemek için tıkla"
        >
          {lastNotes.isLoading ? (
            <span className="text-text-muted text-xs">…</span>
          ) : n?.summary ? (
            <>
              <MessageSquare className="text-text-muted mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0">
                <span className="text-text-secondary line-clamp-2 block text-xs">{n.summary}</span>
                {n.author_name && <span className="text-text-muted text-[10px]">{n.author_name}</span>}
              </span>
            </>
          ) : (
            <span className="text-text-muted group-hover:text-accent-primary inline-flex items-center gap-1 text-xs"><Plus className="size-3.5" /> Not ekle</span>
          )}
        </button>
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
    // Düzenle → tüm alanlar operasyon detayında (tek modal edit bileşeni yok; detayda
    // düzenleme + aşama süreci mevcut). Satır içi elle aşama değişimi bilinçli olarak yok.
    { key: 'edit', header: '', align: 'right', cell: (r) => (
      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); navigate(`/talepler/${r.id}`) }}>
        <Pencil className="size-3.5" /> Düzenle
      </Button>
    ) },
  ]

  const hasFilters = !!search || !!ownerId || !!channelId
  const clearAll = () => { setSearch(''); setOwnerId(null); setChannelId(null); resetPage() }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hızlı Çalışma"
        description="Satırdan durumu güncelle, not ekle (Enter), geçmişi yan panelde gör. Aşama süreçle ilerler; değiştirmek için Düzenle."
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
        onRowClick={(r) => setSelectedId(r.id)}
        rowClassName={(r) => (r.id === selectedId ? 'bg-accent-pale/60 hover:bg-accent-pale/60' : undefined)}
        page={page} pageSize={pageSize} total={data?.total ?? 0}
        onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); resetPage() }}
        pageSizeOptions={[50, 100]}
        sort={sort} onSortChange={setSort}
        emptyState={<EmptyState icon={Zap} title="Kayıt yok"
          description={tab === 'bugun' ? 'Bugün acil aranacak talep görünmüyor.' : hasFilters ? 'Filtreleri değiştirin.' : 'Bu listede kayıt yok.'} />}
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
