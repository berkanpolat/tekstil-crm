import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Building2, Paperclip, Plus, Trash2, FileText, Shirt, ClipboardList,
  StickyNote, Clock, AlertTriangle, ArrowRight, Package, Loader2, ListTodo,
} from 'lucide-react'
import { useEntityFiles, useSignedUrl } from '@/hooks/useFiles'
import { OpenFileBand } from './OpenFileBand'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import { EmptyState } from '@/components/shared/EmptyState'
import { FilesPanel } from '@/components/files/FilesPanel'
import { EntityTimeline } from '@/components/timeline/EntityTimeline'
import { QuotesTab } from './QuotesTab'
import { SamplesTab } from './SamplesTab'
import { OrdersTab } from './OrdersTab'
import { OperationTasks } from '@/pages/tasks/OperationTasks'
import { TalepAnalizi } from '@/pages/ai/TalepAnalizi'
import { OperationNotesTab } from './OperationTabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { STATUS_TONE_CLASS, type StatusTone } from '@/lib/statuses'
import { slaStatus } from '@/lib/workingHours'
import { HandHelping, GitMerge, X as XIcon, Search } from 'lucide-react'
import { useOperation, useOperationStageOptions, useClaimOperation, useMergeSuggestion, useMergeOperations, useDismissMerge } from '@/hooks/useOperations'
import { useTimeline } from '@/hooks/useTimeline'
import { useTaskList } from '@/hooks/useTasks'
import { pickNextAction } from '@/lib/nextAction'
import { useOperationInteractions } from '@/hooks/useOperationActivity'
import { useOperationCatalogItems, useAddCatalogItem, useDeleteCatalogItem, useCatalogProductSearch, useCatalogCollections, useResolveCatalogItem, useCreateCatalogProductAndLink, type CatalogItem } from '@/hooks/useOperationCatalog'

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}
function fmtDT(iso: string) {
  return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
/** Teklif Süresi = son tarih ("29.07 Çar 14:00'a kadar"). */
function teklifSuresi(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  const label = d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' })
  return d.getTime() < Date.now() ? label : `${label}'a kadar`
}
const toneClass = (c: string | null): string =>
  c && (['success', 'warning', 'danger', 'info', 'neutral'] as string[]).includes(c)
    ? STATUS_TONE_CLASS[c as StatusTone] : 'bg-neutral-badge text-neutral-badge-foreground'
const PRODUCT_SOURCE_LABEL: Record<string, string> = { gorsel_yukleme: 'Görsel yükleme', katalogdan_secim: 'Katalogdan seçim' }

const STAGE_DESC: Record<string, string> = {
  teklif_bekliyor: 'Talep alındı; teklif dosyası hazırlanıp yüklenmesi bekleniyor.',
  teklif_iletildi: 'Teklif dosyası yüklendi/iletildi; müşteri yanıtı bekleniyor.',
  numune: 'Numune üretiliyor / onaya sunuldu.',
  siparis: 'Sipariş formu yüklendi; üretim planlaması yapılıyor.',
  uretim: 'Ürün üretimde.', teslimat: 'Sevkiyat / teslim aşamasında.',
  tamamlandi: 'Operasyon tamamlandı.', iptal: 'Operasyon iptal edildi.',
}
const NEXT_STEP: Record<string, string> = {
  teklif_bekliyor: 'Teklif dosyası yükle', teklif_iletildi: 'Müşteri kararını bekle / numune-sipariş',
  numune: 'Numune onayı al, sipariş formu yükle', siparis: 'Üretime başla', uretim: 'Sevkiyata hazırla',
  teslimat: 'Teslimatı tamamla', tamamlandi: '—', iptal: '—',
}

const TABS = [
  { key: 'genel', label: 'Genel', icon: Building2 },
  { key: 'teklif', label: 'Teklif', icon: FileText },
  { key: 'numune', label: 'Numune', icon: Shirt },
  { key: 'siparis', label: 'Sipariş', icon: ClipboardList },
  { key: 'gorevler', label: 'Görevler', icon: ListTodo },
  { key: 'dosyalar', label: 'Dosyalar', icon: Paperclip },
  { key: 'notlar', label: 'Notlar', icon: StickyNote },
  { key: 'zaman', label: 'Zaman Çizelgesi', icon: Clock },
] as const
type TabKey = (typeof TABS)[number]['key']

/** Operasyon ekranı — 7 sekme (Merhaba.docx 9). */
export function OperationCardPage() {
  const { id } = useParams<{ id: string }>()
  const opId = id ? Number(id) : null
  const navigate = useNavigate()
  const { data: op, isLoading, isError } = useOperation(opId)
  const stages = useOperationStageOptions()
  const [tab, setTab] = useState<TabKey>('genel')
  const [stagePeek, setStagePeek] = useState<string | null>(null)
  const [nowMs] = useState(() => Date.now())
  const claim = useClaimOperation()

  async function onClaim() {
    if (!opId) return
    try {
      const r = await claim.mutateAsync(opId)
      if (r.claimed) toast.success(r.already ? 'Zaten sizde.' : 'Talebi üstlendiniz.')
      else toast.error(`Bu talebi ${r.owner_name ?? 'başka biri'} üstlendi.`)
    } catch (err) { toast.error(await toUserMessage(err)) }
  }

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>
  if (isError || !op) {
    return <EmptyState icon={Building2} title="Operasyon bulunamadı" description="Kayıt silinmiş ya da erişiminiz yok olabilir."
      action={<Button variant="outline" onClick={() => navigate('/talepler')}>Listeye dön</Button>} />
  }

  const stage = (stages.data ?? []).find((s) => s.id === op.stage_id)
  const sla = slaStatus(op.sla_deadline, new Date(nowMs))
  const risks: string[] = []
  if (sla.overdue && op.stage_key === 'teklif_bekliyor') risks.push('Teklif süresi doldu')
  else if (sla.soon && op.stage_key === 'teklif_bekliyor') risks.push('Teklif süresi yaklaşıyor')

  return (
    <div className="space-y-5">
      <Link to="/talepler" className="text-text-secondary hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeft className="size-4" /> Talepler
      </Link>

      {opId != null && <MergeBanner operationId={opId} />}

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground">{op.title}</h1>
          <span className="text-text-secondary bg-muted rounded px-1.5 py-0.5 font-mono text-xs">{op.code}</span>
          {stage && <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', toneClass(stage.color))}>{stage.label}</span>}
          {!op.owner_id && (
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => void onClaim()} disabled={claim.isPending}>
              <HandHelping className="size-4" /> Üstlen
            </Button>
          )}
        </div>
        <p className="text-text-secondary mt-1 text-sm">
          <Link to={`/musteriler/${op.customer_id}`} className="hover:underline">{op.customer_name ?? '—'}</Link>
          {op.category_label && <> · {[op.category_label, op.type_label].filter(Boolean).join(' / ')}</>}
          {op.channel_label && <> · {op.channel_label}</>}
        </p>
      </div>

      {risks.length > 0 && (
        <div className="border-danger/40 bg-danger/5 text-danger-foreground flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-2 text-sm">
          <span className="flex items-center gap-1 font-medium"><AlertTriangle className="size-4" /> Risk</span>
          {risks.map((r) => <span key={r}>{r}</span>)}
        </div>
      )}

      {/* Tıklanabilir aşama göstergesi */}
      <div>
        <div className="flex flex-wrap gap-1">
          {(stages.data ?? []).filter((s) => s.key !== 'iptal').map((s) => (
            <button key={s.id} type="button" onClick={() => setStagePeek(stagePeek === s.key ? null : s.key)}
              className={cn('rounded px-2 py-0.5 text-xs transition-colors',
                s.id === op.stage_id ? cn('font-medium', toneClass(s.color)) : 'bg-muted text-text-muted hover:bg-muted/70')}>
              {s.label}
            </button>
          ))}
        </div>
        {stagePeek && <p className="text-text-secondary mt-1.5 text-xs">{STAGE_DESC[stagePeek] ?? ''}</p>}
      </div>

      {/* B.7 — açık dosya bandı: kalan süre + Ertele/Git + erteleme geçmişi */}
      <OpenFileBand operationId={op.id} onGoto={() => setTab('teklif')} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
        <div className="min-w-0">
          <div className="border-border flex flex-wrap gap-1 border-b">
            {TABS.map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={cn('inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  tab === t.key ? 'border-primary text-foreground' : 'text-text-secondary hover:text-foreground border-transparent')}>
                <t.icon className="size-4" /> {t.label}
              </button>
            ))}
          </div>

          <div className="pt-4">
            {tab === 'genel' && <GeneralTab op={op} />}
            {tab === 'teklif' && <QuotesTab operationId={op.id} />}
            {tab === 'numune' && <SamplesTab operationId={op.id} />}
            {tab === 'siparis' && <OrdersTab operationId={op.id} customerId={op.customer_id} />}
            {tab === 'gorevler' && <OperationTasks operationId={op.id} />}
            {tab === 'dosyalar' && <FilesPanel entityType="operation" entityId={op.id} />}
            {tab === 'notlar' && <OperationNotesTab operationId={op.id} />}
            {tab === 'zaman' && <EntityTimeline entityType="operation" entityId={op.id} />}
          </div>
        </div>

        <SummaryPanel op={op} nextStep={NEXT_STEP[op.stage_key ?? ''] ?? '—'} />
      </div>
    </div>
  )
}

/** H2 — Talebin görseli Genel sekmesinde büyük ve hemen görünür (dosyalarda saklı değil). */
function OperationHero({ operationId }: { operationId: number }) {
  const files = useEntityFiles('operation', String(operationId))
  const img = (files.data ?? []).find((f) => (f.mime_type ?? '').startsWith('image/'))
  const url = useSignedUrl(img ? { bucket: img.bucket, storage_path: img.storage_path } : null)
  if (!img) return null
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
      {url.data
        ? <img src={url.data} alt="Talep görseli" className="max-h-80 w-full object-contain" />
        : <div className="flex h-48 items-center justify-center text-text-muted"><Loader2 className="size-5 animate-spin" /></div>}
    </div>
  )
}

function GeneralTab({ op }: { op: NonNullable<ReturnType<typeof useOperation>['data']> }) {
  return (
    <div className="max-w-2xl space-y-4">
      <OperationHero operationId={op.id} />
      <dl className="border-border divide-border grid grid-cols-1 divide-y rounded-lg border sm:grid-cols-2 sm:divide-y-0">
        {([
          ['Kategori / Tür', [op.category_label, op.type_label].filter(Boolean).join(' · ') || '—'],
          ['Kanal', op.channel_label], ['İl / İlçe', [op.province_name, op.district].filter(Boolean).join(' / ') || '—'],
          ['Ürün geliş türü', op.product_source ? PRODUCT_SOURCE_LABEL[op.product_source] : '—'],
          ['Durum', op.status_label], ['Sorumlu', op.owner_name ?? 'Atanmamış'],
          ['Talep tarihi', fmtDate(op.requested_at)], ['Teklif Süresi', teklifSuresi(op.sla_deadline)],
        ] as [string, string | null | undefined][]).map(([label, value], i) => (
          <div key={label} className={cn('border-border px-4 py-3', i % 2 === 0 ? 'sm:border-r' : '', 'sm:border-b')}>
            <dt className="text-text-muted text-xs">{label}</dt>
            <dd className="mt-0.5 text-sm text-foreground">{value || '—'}</dd>
          </div>
        ))}
        {op.description && (
          <div className="border-border px-4 py-3 sm:col-span-2 sm:border-b">
            <dt className="text-text-muted text-xs">Not</dt>
            <dd className="mt-0.5 text-sm whitespace-pre-wrap text-foreground">{op.description}</dd>
          </div>
        )}
      </dl>

      {op.product_source === 'katalogdan_secim' && <CatalogItems operationId={op.id} />}

      <TalepAnalizi operationId={op.id} />
    </div>
  )
}

/** Katalogdan seçilen ürünler — yatay küçük kartlar (kod + ad). Katalog Faz 4'te FK. */
function CatalogItems({ operationId }: { operationId: number }) {
  const { data: items, isLoading } = useOperationCatalogItems(operationId)
  const add = useAddCatalogItem()
  const del = useDeleteCatalogItem()
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')

  async function submit() {
    if (!code.trim()) { toast.error('Ürün kodu gerekli.'); return }
    try { await add.mutateAsync({ operation_id: operationId, catalog_product_code: code.trim(), label: label.trim() || null }); setCode(''); setLabel('') }
    catch (err) { toast.error(await toUserMessage(err)) }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Package className="text-text-muted size-4" />
        <span className="text-sm font-medium text-foreground">Katalog ürünleri</span>
      </div>
      {isLoading ? <Skeleton className="h-16 w-full" /> : (
        <div className="space-y-2">
          {/* Eşleşmeyen (siteden gelen, katalogta yok) — çözüm düğmeleri */}
          {(items ?? []).filter((it) => it.catalog_product_id == null).map((it) => (
            <UnresolvedCatalogItem key={it.id} item={it} operationId={operationId} />
          ))}
          {/* Eşleşen ürünler */}
          <div className="flex flex-wrap gap-2">
            {(items ?? []).filter((it) => it.catalog_product_id != null).map((it) => (
              <div key={it.id} className="border-border flex items-center gap-2 rounded-lg border px-3 py-2">
                <div>
                  <div className="font-mono text-xs text-foreground">{it.catalog_product_code}</div>
                  {it.label && <div className="text-text-secondary text-xs">{it.label}</div>}
                </div>
                <button type="button" className="text-text-muted hover:text-danger-foreground" disabled={del.isPending}
                  onClick={async () => { try { await del.mutateAsync({ id: it.id, operation_id: operationId }) } catch (err) { toast.error(await toUserMessage(err)) } }}>
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            {(items ?? []).length === 0 && <span className="text-text-muted text-xs">Henüz ürün eklenmedi.</span>}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ürün kodu" className="h-8 w-32" />
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ad (opsiyonel)" className="h-8 flex-1" />
        <Button size="sm" variant="outline" onClick={() => void submit()} disabled={add.isPending || !code.trim()}><Plus className="size-4" /> Ekle</Button>
      </div>
    </div>
  )
}

// #2A — Eşleşmeyen katalog kalemi: elle eşleştir ya da yeni ürün olarak ekle
function UnresolvedCatalogItem({ item, operationId }: { item: CatalogItem; operationId: number }) {
  const [mode, setMode] = useState<'none' | 'search' | 'create'>('none')
  const [query, setQuery] = useState('')
  const [name, setName] = useState(item.label ?? '')
  const [collectionId, setCollectionId] = useState<string>('')
  const search = useCatalogProductSearch(query)
  const collections = useCatalogCollections()
  const resolve = useResolveCatalogItem()
  const create = useCreateCatalogProductAndLink()
  const busy = resolve.isPending || create.isPending

  return (
    <div className="border-warning bg-warning space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="text-warning-foreground size-4 shrink-0" />
        <span className="text-sm font-medium text-foreground">Katalogda yok:</span>
        <span className="font-mono text-xs text-foreground">{item.catalog_product_code}</span>
        {item.label && <span className="text-text-secondary text-xs">· {item.label}</span>}
        {mode === 'none' && (
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setMode('search')}><Search className="size-3.5" /> Katalogda ara</Button>
            <Button size="sm" variant="outline" onClick={() => setMode('create')}><Plus className="size-3.5" /> Yeni ürün olarak ekle</Button>
          </div>
        )}
      </div>

      {mode === 'search' && (
        <div className="space-y-1">
          <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ürün kodu ya da adı ara (en az 2 harf)" className="h-8" />
          {query.trim().length >= 2 && (
            <div className="bg-card max-h-40 overflow-y-auto rounded-md border border-border">
              {(search.data ?? []).length === 0
                ? <div className="text-text-muted p-2 text-xs">Sonuç yok.</div>
                : (search.data ?? []).map((p) => (
                  <button key={p.id} type="button" disabled={busy}
                    className="hover:bg-muted flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm"
                    onClick={async () => { try { await resolve.mutateAsync({ itemId: item.id, productId: p.id, operationId }); toast.success('Ürün eşleştirildi.') } catch (err) { toast.error(await toUserMessage(err)) } }}>
                    <span className="font-mono text-xs">{p.code}</span><span className="text-text-secondary truncate">{p.name}</span>
                  </button>
                ))}
            </div>
          )}
          <button type="button" onClick={() => setMode('none')} className="text-text-muted text-xs hover:underline">Vazgeç</button>
        </div>
      )}

      {mode === 'create' && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1">
            <label className="text-text-secondary text-xs">Ad</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ürün adı" className="h-8" />
          </div>
          <div>
            <label className="text-text-secondary text-xs">Kategori</label>
            <select value={collectionId} onChange={(e) => setCollectionId(e.target.value)} className="block h-8 rounded-md border border-border bg-card px-2 text-sm">
              <option value="">— (yok)</option>
              {(collections.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <Button size="sm" disabled={busy}
            onClick={async () => { try { await create.mutateAsync({ itemId: item.id, code: item.catalog_product_code, name, collectionId: collectionId ? Number(collectionId) : null, operationId }); toast.success('Yeni ürün kataloğa eklendi ve bağlandı.') } catch (err) { toast.error(await toUserMessage(err)) } }}>
            <Plus className="size-3.5" /> Oluştur
          </Button>
          <button type="button" onClick={() => setMode('none')} className="text-text-muted h-8 text-xs hover:underline">Vazgeç</button>
        </div>
      )}
    </div>
  )
}

function SummaryPanel({ op, nextStep }: { op: NonNullable<ReturnType<typeof useOperation>['data']>; nextStep: string }) {
  const timeline = useTimeline('operation', op.id, 1)
  const interactions = useOperationInteractions(op.id)
  const opTasks = useTaskList({ entityType: 'operation', entityId: op.id })
  const openTasks = (opTasks.data ?? []).filter((t) => !t.status_closed && !t.completed_at).length
  const [nowMs] = useState(() => Date.now())
  const nextAction = pickNextAction(opTasks.data ?? [], nowMs)
  const lastEvent = timeline.data?.rows[0]
  const lastTalk = interactions.data?.[0]

  return (
    <aside className="border-border h-fit rounded-lg border">
      <div className="border-border border-b px-3 py-2 text-sm font-medium text-foreground">Özet</div>
      <dl>
        <SummaryRow label="Sıradaki adım"><span className="flex items-center gap-1"><ArrowRight className="text-primary size-3.5" /> {nextStep}</span></SummaryRow>
        <SummaryRow label="Sıradaki aksiyon">
          {opTasks.isLoading ? <span className="text-text-muted text-xs">…</span>
            : nextAction ? (
              <span className={cn('block', nextAction.overdue ? 'text-danger-foreground font-medium' : 'text-foreground')}>
                {nextAction.title}
                {nextAction.due_at && <span className={cn('ml-1 text-xs', !nextAction.overdue && 'text-text-muted')}>· {fmtDate(nextAction.due_at)}</span>}
              </span>
            ) : <span className="text-text-muted text-xs">Açık görev yok</span>}
        </SummaryRow>
        <SummaryRow label="Teklif Süresi">{teklifSuresi(op.sla_deadline)}</SummaryRow>
        <SummaryRow label="Son işlem">{lastEvent ? fmtDT(lastEvent.occurred_at) : '—'}</SummaryRow>
        <SummaryRow label="Son müşteri görüşmesi">
          {lastTalk ? <span className="block"><span className="text-xs">{fmtDT(lastTalk.occurred_at)}</span>{lastTalk.summary && <span className="text-text-secondary mt-0.5 block text-xs">{lastTalk.summary}</span>}</span> : '—'}
        </SummaryRow>
        <SummaryRow label="Açık görevler">
          {opTasks.isLoading ? <span className="text-text-muted text-xs">…</span>
            : openTasks > 0 ? <span className="text-xs font-medium text-foreground">{openTasks} açık görev</span>
            : <span className="text-text-muted text-xs">Açık görev yok</span>}
        </SummaryRow>
      </dl>
    </aside>
  )
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-border border-b px-3 py-2.5 last:border-0">
      <dt className="text-text-muted text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  )
}

// E.4 — Birleştirme öneri bandı (aynı müşterinin açık talebi)
function MergeBanner({ operationId }: { operationId: number }) {
  const navigate = useNavigate()
  const { data: sug } = useMergeSuggestion(operationId)
  const merge = useMergeOperations()
  const dismiss = useDismissMerge()
  const [nowMs] = useState(() => Date.now())
  if (!sug) return null
  const hrs = Math.max(0, Math.floor((nowMs - new Date(sug.targetCreatedAt).getTime()) / 3600e3))
  const age = hrs < 24 ? `${hrs} saattir açık` : `${Math.floor(hrs / 24)} gündür açık`
  const busy = merge.isPending || dismiss.isPending
  return (
    <div className="border-warning bg-warning flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <GitMerge className="text-warning-foreground size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">Bu müşterinin açık bir talebi daha var</div>
        <button type="button" onClick={() => navigate(`/talepler/${sug.targetId}`)} className="text-text-secondary hover:text-foreground text-xs underline-offset-2 hover:underline">
          {sug.targetCode} · {age} — diğer talebe git
        </button>
      </div>
      <Button size="sm" disabled={busy}
        onClick={async () => {
          if (!confirm(`Bu talep ${sug.targetCode} ile birleştirilsin mi? Kalemler, dosyalar ve not diğer talebe taşınır.`)) return
          try { await merge.mutateAsync({ sourceId: operationId, targetId: sug.targetId }); toast.success('Talepler birleştirildi.'); navigate(`/talepler/${sug.targetId}`) }
          catch (err) { toast.error(await toUserMessage(err)) }
        }}>
        <GitMerge className="size-3.5" /> Bu talebe birleştir
      </Button>
      <Button size="sm" variant="outline" disabled={busy}
        onClick={async () => { try { await dismiss.mutateAsync({ operationId }); toast.success('Ayrı kalacak.') } catch (err) { toast.error(await toUserMessage(err)) } }}>
        <XIcon className="size-3.5" /> Ayrı kalsın
      </Button>
    </div>
  )
}
