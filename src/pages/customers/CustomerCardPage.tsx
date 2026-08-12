import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Pencil,
  Building2,
  MessageSquare,
  StickyNote,
  Paperclip,
  Clock,
  Trash2,
  Plus,
  Loader2,
  Inbox,
  FileText,
  Shirt,
  ClipboardList,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { InteractionsPanel } from '@/components/interactions/InteractionsPanel'
import { EntityTimeline } from '@/components/timeline/EntityTimeline'
import { NotesPanel } from '@/components/notes/NotesPanel'
import { CustomerFilesTab } from './CustomerFilesTab'
import { TagsPanel } from '@/components/tags/TagsPanel'
import { DuplicateBand } from '@/components/search/DuplicateBand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { cn } from '@/lib/utils'
import type { StatusDef, StatusTone } from '@/lib/statuses'
import { useCustomer, useCustomerStatusOptions, useCustomerSummary } from '@/hooks/useCustomers'
import { formatMoney, balanceTone } from '@/lib/money'
import {
  useContactPoints,
  useAddContactPoint,
  useDeleteContactPoint,
  type ContactType,
} from '@/hooks/useContactPoints'
import { ContactLine } from '@/components/shared/ContactLine'
import { CustomerFormDialog } from './CustomerFormDialog'
import { CustomerTaleplerTab, CustomerChildTab } from './CustomerOperationTabs'
import { CariTab } from '@/pages/finance/CariTab'
import { useFinancePerms } from '@/hooks/useFinance'
import { CustomerSummary } from '@/pages/ai/CustomerSummary'

const STATUS_TONE: Record<string, StatusTone> = {
  aktif: 'success',
  pasif: 'neutral',
  riskli: 'warning',
  kara_liste: 'danger',
}

const CONTACT_TYPES: { value: ContactType; label: string }[] = [
  { value: 'phone', label: 'Telefon' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'E-posta' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'website', label: 'Web sitesi' },
]

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const TABS = [
  { key: 'genel', label: 'Genel', icon: Building2 },
  { key: 'etkilesimler', label: 'Etkileşimler', icon: MessageSquare },
  { key: 'notlar', label: 'Notlar', icon: StickyNote },
  { key: 'dosyalar', label: 'Dosyalar', icon: Paperclip },
  { key: 'zaman', label: 'Zaman Çizelgesi', icon: Clock },
  { key: 'talepler', label: 'Talepler', icon: Inbox },
  { key: 'teklifler', label: 'Teklifler', icon: FileText },
  { key: 'numuneler', label: 'Numuneler', icon: Shirt },
  { key: 'siparisler', label: 'Siparişler', icon: ClipboardList },
  { key: 'cari', label: 'Cari', icon: Wallet },
] as const

type TabKey = (typeof TABS)[number]['key']

export function CustomerCardPage() {
  const { id } = useParams<{ id: string }>()
  const customerId = id ? Number(id) : null
  const navigate = useNavigate()
  const { data: c, isLoading, isError } = useCustomer(customerId)
  const statuses = useCustomerStatusOptions()
  const { data: cardContacts } = useContactPoints('customer', customerId)
  const [tab, setTab] = useState<TabKey>('genel')
  const [editOpen, setEditOpen] = useState(false)
  const finance = useFinancePerms()
  // QA#1: Cari sekmesi yalnız finans yetkisi (finance.view) olana görünür.
  const visibleTabs = TABS.filter((t) => t.key !== 'cari' || finance.data?.view)

  const statusRegistry: Record<string, StatusDef> = {}
  for (const s of statuses.data ?? []) {
    statusRegistry[s.key] = { label: s.label, tone: STATUS_TONE[s.key] ?? 'neutral' }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (isError || !c) {
    return (
      <EmptyState
        icon={Building2}
        title="Müşteri bulunamadı"
        description="Kayıt silinmiş ya da erişiminiz yok olabilir."
        action={
          <Button variant="outline" onClick={() => navigate('/musteriler')}>
            Listeye dön
          </Button>
        }
      />
    )
  }

  const title = c.company_name || c.full_name || `#${c.id}`

  return (
    <div className="space-y-5">
      <Link
        to="/musteriler"
        className="text-text-secondary hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Müşteriler
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
            {c.customer_code && (
              <span className="text-text-secondary bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                {c.customer_code}
              </span>
            )}
            {c.status_key && <StatusBadge status={c.status_key} registry={statusRegistry} />}
            {c.type_label && (
              <span className="text-text-muted rounded bg-neutral-badge px-1.5 py-0.5 text-xs">
                {c.type_label}
              </span>
            )}
          </div>
          {(c.company_name && c.full_name ? c.full_name : null) && (
            <p className="mt-1 text-sm text-text-secondary">
              {c.company_name && c.full_name ? c.full_name : null}
            </p>
          )}
          <div className="mt-2">
            <TagsPanel entityType="customer" entityId={c.id} />
          </div>
        </div>
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="size-4" /> Düzenle
        </Button>
      </div>

      <DuplicateBand
        company={c.company_name}
        phone={cardContacts?.find((cp) => cp.type === 'phone')?.value ?? null}
        taxNumber={c.tax_number}
        excludeType="customer"
        excludeId={c.id}
      />

      <div className="border-border flex gap-1 border-b">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t.key
                ? 'border-primary text-foreground'
                : 'text-text-secondary hover:text-foreground border-transparent',
            )}
          >
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'genel' && (
        <div className="space-y-6">
        <CustomerStats customerId={c.id} onNavigate={setTab} showFinance={!!finance.data?.view} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <DetailGrid
              title="Genel"
              rows={[
                ['Firma', c.company_name],
                ['Kişi', c.full_name],
                ['Tür', c.type_label],
                ['Atanan', c.assignee_name ?? 'Atanmamış'],
                ['Ülke', c.country],
                ['Şehir', c.city],
                ['İlçe', c.district],
                ['Adres', c.address],
                ['Sonraki aksiyon', fmtDateTime(c.next_action_at)],
                ['Son etkileşim', fmtDateTime(c.last_interaction_at)],
                ['Oluşturulma', fmtDateTime(c.created_at)],
              ]}
            />
            <DetailGrid
              title="Ticari bilgiler"
              rows={[
                ['Vergi dairesi', c.tax_office],
                ['Vergi numarası', c.tax_number],
                ['IBAN', c.iban],
                ['Banka', c.bank_name],
                ['Hesap sahibi', c.account_holder],
              ]}
            />
            <CustomerSummary customerId={c.id} />
          </div>
          <div>
            <ContactPointsPanel customerId={c.id} />
          </div>
        </div>
        </div>
      )}

      {tab === 'etkilesimler' && (
        <div className="max-w-3xl">
          <InteractionsPanel entityType="customer" entityId={c.id} />
        </div>
      )}
      {tab === 'notlar' && <NotesPanel entityType="customer" entityId={c.id} />}
      {tab === 'dosyalar' && <CustomerFilesTab customerId={c.id} />}
      {tab === 'zaman' && (
        <div className="max-w-2xl">
          <EntityTimeline entityType="customer" entityId={c.id} />
        </div>
      )}
      {tab === 'talepler' && <CustomerTaleplerTab customerId={c.id} />}
      {tab === 'teklifler' && <CustomerChildTab customerId={c.id} kind="quotes" />}
      {tab === 'numuneler' && <CustomerChildTab customerId={c.id} kind="samples" />}
      {tab === 'siparisler' && <CustomerChildTab customerId={c.id} kind="orders" />}
      {tab === 'cari' && <CariTab customerId={c.id} />}

      <CustomerFormDialog open={editOpen} onOpenChange={setEditOpen} editing={c} />
    </div>
  )
}

function DetailGrid({ title, rows }: { title: string; rows: [string, string | null | undefined][] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-foreground">{title}</h3>
      <dl className="border-border divide-border grid grid-cols-1 divide-y rounded-lg border sm:grid-cols-2 sm:divide-y-0">
        {rows.map(([label, value], i) => (
          <div key={label} className={cn('border-border px-4 py-3', i % 2 === 0 ? 'sm:border-r' : '', 'sm:border-b')}>
            <dt className="text-text-muted text-xs">{label}</dt>
            <dd className="mt-0.5 text-sm text-foreground">{value || '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function ContactPointsPanel({ customerId }: { customerId: number }) {
  const { data: contacts, isLoading } = useContactPoints('customer', customerId)
  const add = useAddContactPoint()
  const del = useDeleteContactPoint()
  const [type, setType] = useState<ContactType>('phone')
  const [value, setValue] = useState('')

  async function handleAdd() {
    if (!value.trim()) return
    try {
      await add.mutateAsync({ entity_type: 'customer', entity_id: customerId, type, value: value.trim() })
      setValue('')
      toast.success('İletişim eklendi.')
    } catch (err) {
      toast.error(await toUserMessage(err))
    }
  }

  return (
    <div className="border-border rounded-lg border p-4">
      <h3 className="text-sm font-medium text-foreground">İletişim noktaları</h3>
      <div className="mt-3 space-y-2">
        {isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : (contacts ?? []).length === 0 ? (
          <p className="text-text-secondary text-sm">Henüz iletişim yok.</p>
        ) : (
          (contacts ?? []).map((cp) => (
            <div key={cp.id} className="flex items-center justify-between gap-2 text-sm">
              <ContactLine type={cp.type} value={cp.value} className="min-w-0 truncate" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={async () => {
                  try {
                    await del.mutateAsync(cp)
                  } catch (err) {
                    toast.error(await toUserMessage(err))
                  }
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <SearchableSelect
          options={CONTACT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          value={type}
          onChange={(v) => v && setType(v as ContactType)}
          className="w-32 shrink-0"
        />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Değer"
          onKeyDown={(e) => e.key === 'Enter' && void handleAdd()}
        />
        <Button type="button" onClick={() => void handleAdd()} disabled={add.isPending || !value.trim()}>
          {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </Button>
      </div>
    </div>
  )
}

/** 1.7 — Müşteri özet kartı: tıklanabilir sayımlar + ciro/bakiye (finance) + son etkileşim. */
function CustomerStats({ customerId, onNavigate, showFinance }: { customerId: number; onNavigate: (k: TabKey) => void; showFinance: boolean }) {
  const { data: s } = useCustomerSummary(customerId)
  if (!s) return null
  const stats: { label: string; value: number; tab: TabKey }[] = [
    { label: 'Talep', value: s.talep, tab: 'talepler' },
    { label: 'Teklif', value: s.teklif, tab: 'teklifler' },
    { label: 'Numune', value: s.numune, tab: 'numuneler' },
    { label: 'Sipariş', value: s.siparis, tab: 'siparisler' },
    { label: 'Açık dosya', value: s.acik_dosya, tab: 'talepler' },
  ]
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-card">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {stats.map((st) => (
          <button key={st.label} type="button" onClick={() => onNavigate(st.tab)}
            className="rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-muted/50">
            <div className="text-xl font-semibold tabular-nums text-foreground">{st.value}</div>
            <div className="text-text-secondary text-xs">{st.label}</div>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        {showFinance && s.ciro_usd != null && (
          <button type="button" onClick={() => onNavigate('cari')} className="hover:underline">
            <span className="text-text-muted">Toplam ciro: </span><span className="font-medium text-foreground">{formatMoney(s.ciro_usd, 'USD')}</span>
          </button>
        )}
        {showFinance && s.balance_usd != null && (
          <button type="button" onClick={() => onNavigate('cari')} className="hover:underline">
            <span className="text-text-muted">Bakiye: </span>
            <span className={cn('font-medium', balanceTone(s.balance_usd) === 'debt' ? 'text-destructive' : balanceTone(s.balance_usd) === 'credit' ? 'text-success-foreground' : 'text-foreground')}>{formatMoney(s.balance_usd, 'USD')}</span>
          </button>
        )}
        <button type="button" onClick={() => onNavigate('etkilesimler')} className="hover:underline">
          <span className="text-text-muted">Son etkileşim: </span><span className="font-medium text-foreground">{s.last_interaction ? fmtDateTime(s.last_interaction) : '—'}</span>
        </button>
      </div>
    </div>
  )
}
