import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
  Phone, Mail, MessageCircle, Camera, Send, Globe, ArrowDownLeft, ArrowUpRight,
  FileText, Package, Receipt, ChevronUp, ChevronDown, Clock, UserRound, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { STATUS_TONE_CLASS, type StatusTone } from '@/lib/statuses'
import { useCustomer } from '@/hooks/useCustomers'
import { useContactPoints, type ContactPoint, type ContactType } from '@/hooks/useContactPoints'
import { useInteractions } from '@/hooks/useInteractions'
import { useOperationQuotes } from '@/hooks/useQuotes'
import { useOperationSamples } from '@/hooks/useSamples'
import { useEntityFiles, useSignedUrl } from '@/hooks/useFiles'
import type { FileRow } from '@/hooks/useFiles'
import type { OperationRow } from '@/hooks/useOperations'

const toneClass = (c: string | null): string =>
  c && (['success', 'warning', 'danger', 'info', 'neutral'] as string[]).includes(c)
    ? STATUS_TONE_CLASS[c as StatusTone] : 'bg-neutral-badge text-neutral-badge-foreground'

const CONTACT_ICON: Record<ContactType, typeof Phone> = {
  phone: Phone, email: Mail, whatsapp: MessageCircle, instagram: Camera, telegram: Send, website: Globe,
}

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}
function fmtDateTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
}
function fmtMoney(total: number, currency: string) {
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(total)
  } catch {
    return `${total.toLocaleString('tr-TR')} ${currency}`
  }
}

function Section({ title, icon: Icon, count, children }: {
  title: string; icon: typeof Phone; count?: number; children: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-text-secondary flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
        <Icon className="size-3.5" /> {title}
        {count != null && <span className="text-text-muted font-normal normal-case">({count})</span>}
      </h3>
      {children}
    </section>
  )
}

function ContactBadge({ cp }: { cp: ContactPoint }) {
  const Icon = CONTACT_ICON[cp.type] ?? Phone
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs',
      cp.is_primary ? 'bg-accent-pale text-accent-primary font-medium' : 'bg-subtle text-text-secondary',
    )}>
      <Icon className="size-3.5" /> {cp.value}
    </span>
  )
}

/** Dosya satırı — tıklayınca imzalı URL ile yeni sekmede açar (salt-okunur). */
function FileLink({ file }: { file: FileRow }) {
  const url = useSignedUrl({ bucket: file.bucket, storage_path: file.storage_path })
  return (
    <a
      href={url.data ?? undefined}
      target="_blank" rel="noreferrer"
      className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-sm', url.data ? 'hover:bg-subtle' : 'pointer-events-none opacity-60')}
    >
      <FileText className="text-text-muted size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{file.original_name}</span>
      <span className="text-text-muted shrink-0 text-[10px]">{fmtDate(file.created_at)}</span>
    </a>
  )
}

interface PanelProps {
  row: OperationRow | null
  onOpenChange: (open: boolean) => void
  onNavigate: (dir: 'prev' | 'next') => void
  hasPrev: boolean
  hasNext: boolean
  position?: string
}

/**
 * Hızlı Çalışma yan paneli (P3) — SALT-OKUNUR müşteri geçmişi. Aramadan önce
 * "en son ne zaman aradık / ne dedi / hangi teklif için" sorularının cevabı üstte.
 * Etkileşimler müşteri seviyesinde (tüm geçmiş); teklif/numune/dosya bu operasyona ait.
 */
export function CalismaDetailPanel({ row, onOpenChange, onNavigate, hasPrev, hasNext, position }: PanelProps) {
  const customerId = row?.customer_id ?? null
  const operationId = row?.id ?? null

  const customer = useCustomer(customerId)
  const contacts = useContactPoints('customer', customerId)
  const interactions = useInteractions('customer', customerId)
  const quotes = useOperationQuotes(operationId)
  const samples = useOperationSamples(operationId)
  const files = useEntityFiles('operation', operationId != null ? String(operationId) : null)

  const c = customer.data
  const name = c?.company_name ?? c?.full_name ?? row?.customer_name ?? '—'
  const liveQuotes = (quotes.data ?? []).filter((q) => !q.deleted_at)
  const liveSamples = (samples.data ?? []).filter((s) => !s.deleted_at)

  return (
    <Sheet open={!!row} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        {/* Başlık + gezinme */}
        <div className="bg-card flex items-start justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            <SheetTitle className="truncate text-base">{name}</SheetTitle>
            <div className="text-text-muted mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
              {c?.customer_code && <span className="font-mono">{c.customer_code}</span>}
              {row && <span className="font-mono">· {row.code}</span>}
              {row?.stage_label && <span className={cn('rounded px-1.5 py-0.5 font-medium', toneClass(row.stage_color))}>{row.stage_label}</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {position && <span className="text-text-muted mr-1 text-[10px]">{position}</span>}
            <Button variant="outline" size="icon" className="size-7" onClick={() => onNavigate('prev')} disabled={!hasPrev} aria-label="Önceki kayıt (↑)"><ChevronUp className="size-4" /></Button>
            <Button variant="outline" size="icon" className="size-7" onClick={() => onNavigate('next')} disabled={!hasNext} aria-label="Sonraki kayıt (↓)"><ChevronDown className="size-4" /></Button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {/* Künye */}
          <Section title="Künye" icon={UserRound}>
            <div className="text-text-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span>İlk temas: <span className="text-text-secondary">{fmtDate(c?.first_contact_date ?? null)}</span></span>
              <span className="inline-flex items-center gap-1"><Clock className="size-3" /> Son temas: <span className="text-text-secondary">{fmtDateTime(c?.last_interaction_at ?? null)}</span></span>
              {c?.assignee_name && <span>Takip: <span className="text-text-secondary">{c.assignee_name}</span></span>}
            </div>
            {contacts.data && contacts.data.length > 0 && (
              <div className="flex flex-wrap gap-1.5">{contacts.data.map((cp) => <ContactBadge key={cp.id} cp={cp} />)}</div>
            )}
            {row?.title && <div className="text-text-secondary pt-1 text-sm">Bu talep: {row.title}</div>}
          </Section>

          {/* Etkileşim geçmişi (müşteri seviyesi, en yeni üstte) */}
          <Section title="Etkileşim geçmişi" icon={MessageCircle} count={interactions.data?.length}>
            {interactions.isLoading ? (
              <div className="text-text-muted flex items-center gap-2 text-xs"><Loader2 className="size-3.5 animate-spin" /> Yükleniyor…</div>
            ) : (interactions.data ?? []).length === 0 ? (
              <p className="text-text-muted text-xs">Kayıtlı etkileşim yok.</p>
            ) : (
              <ul className="space-y-2">
                {interactions.data!.map((it) => {
                  const Dir = it.direction === 'inbound' ? ArrowDownLeft : ArrowUpRight
                  return (
                    <li key={it.id} className="border-l-2 border-subtle pl-2.5">
                      <div className="text-text-muted flex items-center gap-1.5 text-[11px]">
                        <Dir className={cn('size-3', it.direction === 'inbound' ? 'text-info-foreground' : 'text-accent-primary')} />
                        <span>{fmtDateTime(it.occurred_at)}</span>
                        {it.channel_label && <span>· {it.channel_label}</span>}
                        {it.outcome_label && <span className={cn(it.outcome_positive ? 'text-success-foreground' : 'text-text-muted')}>· {it.outcome_label}</span>}
                      </div>
                      {it.summary && <p className="text-text-secondary mt-0.5 whitespace-pre-wrap text-sm">{it.summary}</p>}
                      {it.created_by_name && <div className="text-text-muted mt-0.5 text-[10px]">{it.created_by_name}</div>}
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          {/* Teklifler (bu operasyon) */}
          <Section title="Teklifler" icon={Receipt} count={liveQuotes.length}>
            {liveQuotes.length === 0 ? (
              <p className="text-text-muted text-xs">Teklif yok.</p>
            ) : (
              <ul className="space-y-1.5">
                {liveQuotes.map((q) => (
                  <li key={q.id} className="flex items-center justify-between gap-2 rounded-md bg-subtle px-2 py-1.5 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium">v{q.version}</span>
                      <span className="text-text-muted ml-2 text-xs">{q.sent_at ? `İletildi ${fmtDate(q.sent_at)}` : `Oluşturuldu ${fmtDate(q.created_at)}`}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums">{fmtMoney(q.total, q.currency)}</span>
                      {q.status_label && <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', toneClass(q.status_color))}>{q.status_label}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Numuneler (bu operasyon) */}
          <Section title="Numuneler" icon={Package} count={liveSamples.length}>
            {liveSamples.length === 0 ? (
              <p className="text-text-muted text-xs">Numune yok.</p>
            ) : (
              <ul className="space-y-1.5">
                {liveSamples.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 rounded-md bg-subtle px-2 py-1.5 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium">v{s.version}</span>
                      {s.description && <span className="text-text-secondary ml-2 truncate text-xs">{s.description}</span>}
                    </div>
                    {s.status_label && <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-xs font-medium', toneClass(s.status_color))}>{s.status_label}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Dosyalar (bu talep) */}
          <Section title="Dosyalar" icon={FileText} count={files.data?.length}>
            {(files.data ?? []).length === 0 ? (
              <p className="text-text-muted text-xs">Dosya yok.</p>
            ) : (
              <ul className="-mx-2">{files.data!.map((f) => <li key={f.id}><FileLink file={f} /></li>)}</ul>
            )}
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
