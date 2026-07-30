import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Pencil,
  UserRoundCheck,
  MessageSquare,
  StickyNote,
  Paperclip,
  Clock,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { toUserMessage } from '@/lib/errors'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { InteractionsPanel } from '@/components/interactions/InteractionsPanel'
import { EntityTimeline } from '@/components/timeline/EntityTimeline'
import { NotesPanel } from '@/components/notes/NotesPanel'
import { FilesPanel } from '@/components/files/FilesPanel'
import { TagsPanel } from '@/components/tags/TagsPanel'
import { DuplicateBand } from '@/components/search/DuplicateBand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { cn } from '@/lib/utils'
import type { StatusDef, StatusTone } from '@/lib/statuses'
import { useLead, useLeadStatusOptions } from '@/hooks/useLeads'
import {
  useContactPoints,
  useAddContactPoint,
  useDeleteContactPoint,
  type ContactType,
} from '@/hooks/useContactPoints'
import { ContactLine } from '@/components/shared/ContactLine'
import { LeadFormDialog } from './LeadFormDialog'
import { ConvertLeadDialog } from './ConvertLeadDialog'

const STATUS_TONE: Record<string, StatusTone> = {
  yeni: 'info',
  temas_kuruldu: 'info',
  ilgileniyor: 'warning',
  ulasilamiyor: 'neutral',
  olumsuz: 'danger',
  donusturuldu: 'success',
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
  { key: 'genel', label: 'Genel', icon: UserRoundCheck },
  { key: 'etkilesimler', label: 'Etkileşimler', icon: MessageSquare },
  { key: 'notlar', label: 'Notlar', icon: StickyNote },
  { key: 'dosyalar', label: 'Dosyalar', icon: Paperclip },
  { key: 'zaman', label: 'Zaman Çizelgesi', icon: Clock },
] as const
type TabKey = (typeof TABS)[number]['key']

export function LeadCardPage() {
  const { id } = useParams<{ id: string }>()
  const leadId = id ? Number(id) : null
  const navigate = useNavigate()
  const { data: lead, isLoading, isError } = useLead(leadId)
  const statuses = useLeadStatusOptions()
  const { data: cardContacts } = useContactPoints('lead', leadId)
  const [tab, setTab] = useState<TabKey>('genel')
  const [editOpen, setEditOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)

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
  if (isError || !lead) {
    return (
      <EmptyState
        icon={UserRoundCheck}
        title="Potansiyel bulunamadı"
        description="Kayıt silinmiş ya da erişiminiz yok olabilir."
        action={
          <Button variant="outline" onClick={() => navigate('/potansiyeller')}>
            Listeye dön
          </Button>
        }
      />
    )
  }

  const title = lead.full_name || lead.company_name || `#${lead.id}`

  return (
    <div className="space-y-5">
      <div>
        <Link
          to="/potansiyeller"
          className="text-text-secondary hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" /> Potansiyeller
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
            {lead.status_key && <StatusBadge status={lead.status_key} registry={statusRegistry} />}
            {lead.external_id && (
              <span className="text-text-muted rounded bg-neutral-badge px-1.5 py-0.5 text-xs">
                {lead.external_source ?? 'dış'}: {lead.external_id}
              </span>
            )}
          </div>
          {(lead.full_name && lead.company_name ? lead.company_name : null) && (
            <p className="mt-1 text-sm text-text-secondary">
              {lead.full_name && lead.company_name ? lead.company_name : null}
            </p>
          )}
          <div className="mt-2">
            <TagsPanel entityType="lead" entityId={lead.id} />
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" /> Düzenle
          </Button>
          {!lead.converted_customer_id && (
            <Button onClick={() => setConvertOpen(true)}>
              <UserRoundCheck className="size-4" /> Müşteriye dönüştür
            </Button>
          )}
        </div>
      </div>

      <DuplicateBand
        company={lead.company_name}
        phone={cardContacts?.find((c) => c.type === 'phone')?.value ?? null}
        excludeType="lead"
        excludeId={lead.id}
      />

      {lead.converted_customer_id && (
        <div className="border-success/40 bg-success/10 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3">
          <p className="text-sm text-foreground">
            <UserRoundCheck className="mr-1 inline size-4 text-success-foreground" />
            Bu potansiyel müşteriye dönüştürüldü. Tüm geçmiş müşteri kartında.
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate(`/musteriler/${lead.converted_customer_id}`)}>
            Müşteri kartına git
          </Button>
        </div>
      )}

      {/* Dönüşünce lead arşiv: sekme/timeline gösterilmez (her şey müşteride). */}
      {!lead.converted_customer_id && (
      <>
      {/* Sekme çubuğu */}
      <div className="border-border flex gap-1 border-b">
        {TABS.map((t) => (
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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <DetailGrid
              rows={[
                ['Kişi', lead.full_name],
                ['Firma', lead.company_name],
                ['Kaynak', lead.source_label],
                ['Atanan', lead.assignee_name ?? 'Atanmamış'],
                ['Ülke', lead.country],
                ['Şehir', lead.city],
                ['İlçe', lead.district],
                ['Adres', lead.address],
                ['Sonraki aksiyon', fmtDateTime(lead.next_action_at)],
                ['Son etkileşim', fmtDateTime(lead.last_interaction_at)],
                ['Oluşturulma', fmtDateTime(lead.created_at)],
              ]}
            />
          </div>
          <div>
            <ContactPointsPanel leadId={lead.id} />
          </div>
        </div>
      )}

      {tab === 'etkilesimler' && (
        <div className="max-w-3xl">
          <InteractionsPanel entityType="lead" entityId={lead.id} />
        </div>
      )}
      {tab === 'notlar' && <NotesPanel entityType="lead" entityId={lead.id} />}
      {tab === 'dosyalar' && <FilesPanel entityType="lead" entityId={lead.id} />}
      {tab === 'zaman' && (
        <div className="max-w-2xl">
          <EntityTimeline entityType="lead" entityId={lead.id} />
        </div>
      )}
      </>
      )}

      <LeadFormDialog open={editOpen} onOpenChange={setEditOpen} editing={lead} />
      <ConvertLeadDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        leadId={lead.id}
        leadTitle={title}
        onConverted={(customerId) => {
          setConvertOpen(false)
          navigate(`/musteriler/${customerId}`)
        }}
      />
    </div>
  )
}

function DetailGrid({ rows }: { rows: [string, string | null | undefined][] }) {
  return (
    <dl className="border-border divide-border grid grid-cols-1 divide-y rounded-lg border sm:grid-cols-2 sm:divide-y-0">
      {rows.map(([label, value], i) => (
        <div
          key={label}
          className={cn(
            'border-border px-4 py-3',
            i % 2 === 0 ? 'sm:border-r' : '',
            'sm:border-b',
          )}
        >
          <dt className="text-text-muted text-xs">{label}</dt>
          <dd className="mt-0.5 text-sm text-foreground">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

function ContactPointsPanel({ leadId }: { leadId: number }) {
  const { data: contacts, isLoading } = useContactPoints('lead', leadId)
  const add = useAddContactPoint()
  const del = useDeleteContactPoint()
  const [type, setType] = useState<ContactType>('phone')
  const [value, setValue] = useState('')

  async function handleAdd() {
    if (!value.trim()) return
    try {
      await add.mutateAsync({ entity_type: 'lead', entity_id: leadId, type, value: value.trim() })
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
          (contacts ?? []).map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <ContactLine type={c.type} value={c.value} className="min-w-0 truncate" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={async () => {
                  try {
                    await del.mutateAsync(c)
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
