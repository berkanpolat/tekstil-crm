import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Phone, Mail, MessageCircle, Camera, Send, Globe, ArrowUpRight,
  FileText, Package, Receipt, ClipboardList, Inbox, ChevronUp, ChevronDown, Check,
  Clock, UserRound, Loader2, ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toUserMessage } from '@/lib/errors'
import { STATUS_TONE_CLASS, type StatusTone } from '@/lib/statuses'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { DatePicker } from '@/components/shared/DatePicker'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { QuoteAcceptDialog, QuoteRejectDialog } from '@/components/operations/QuoteResultDialogs'
import { useCustomer } from '@/hooks/useCustomers'
import { useContactPoints, type ContactPoint, type ContactType } from '@/hooks/useContactPoints'
import { useInteractions, useChannelOptions, useOutcomeOptions } from '@/hooks/useInteractions'
import { useOperationList, useRequestStatusOptions, useUpdateOperation } from '@/hooks/useOperations'
import { useAddOperationInteraction } from '@/hooks/useOperationActivity'
import { useSetQuoteResult, useAdvanceStage } from '@/hooks/useQuotes'
import { useEntityFiles, useSignedUrl, type FileRow } from '@/hooks/useFiles'
import {
  useSetNextAction, useCustomerQuotes, useCustomerSamples, useCustomerOrders,
} from '@/hooks/useCalisma'
import type { OperationRow } from '@/hooks/useOperations'

const toneClass = (c: string | null): string =>
  c && (['success', 'warning', 'danger', 'info', 'neutral'] as string[]).includes(c)
    ? STATUS_TONE_CLASS[c as StatusTone] : 'bg-neutral-badge text-neutral-badge-foreground'

const CONTACT_ICON: Record<ContactType, typeof Phone> = {
  phone: Phone, email: Mail, whatsapp: MessageCircle, instagram: Camera, telegram: Send, website: Globe,
}
const QUOTE_CLOSED = ['numune_asamasina_gecildi', 'olumsuz', 'reddedildi', 'kabul_edildi', 'iptal_edildi']

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}
function fmtDateTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
}
function fmtMoney(total: number, currency: string) {
  try { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(total) }
  catch { return `${total.toLocaleString('tr-TR')} ${currency}` }
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
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs',
      cp.is_primary ? 'bg-accent-pale text-accent-primary font-medium' : 'bg-subtle text-text-secondary')}>
      <Icon className="size-3.5" /> {cp.value}
    </span>
  )
}

function FileLink({ file }: { file: FileRow }) {
  const url = useSignedUrl({ bucket: file.bucket, storage_path: file.storage_path })
  return (
    <a href={url.data ?? undefined} target="_blank" rel="noreferrer"
      className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-sm', url.data ? 'hover:bg-subtle' : 'pointer-events-none opacity-60')}>
      <FileText className="text-text-muted size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{file.original_name}</span>
      <span className="text-text-muted shrink-0 text-[10px]">{fmtDate(file.created_at)}</span>
    </a>
  )
}

/** Talep durumu (request_status) satır içi değiştirici — panelde de kullanılır. */
function StatusDropdown({ statusKey, statusLabel, onPick }: {
  statusKey: string | null; statusLabel: string | null; onPick: (id: number) => void
}) {
  const statuses = useRequestStatusOptions()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="hover:bg-subtle ring-border inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset">
          {statusLabel ?? 'Belirle'} <ChevronDown className="size-3 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(statuses.data ?? []).map((s) => (
          <DropdownMenuItem key={s.id} onClick={() => onPick(s.id)}>
            {s.key === statusKey ? <Check className="size-3.5" /> : <span className="w-[14px]" />}
            <span className={cn(s.key === statusKey && 'font-medium')}>{s.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
 * Hızlı Çalışma yan paneli (P3+) — TAKİP & DURUM işlem merkezi. Müşterinin tüm süreci
 * görünür (talep/teklif/numune/sipariş/belge). Panelde YAPILIR: aksiyon ekleme, talep
 * durumu, teklif sonucu. Panelde YAPILMAZ: yeni numune/sipariş/teklif üretme, müşteri
 * düzenleme — bunlar "…aç" bağlantısıyla ilgili sayfaya gider. Aşama (stage) salt bilgi.
 */
export function CalismaDetailPanel({ row, onOpenChange, onNavigate, hasPrev, hasNext, position }: PanelProps) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const customerId = row?.customer_id ?? null
  const operationId = row?.id ?? null

  const customer = useCustomer(customerId)
  const contacts = useContactPoints('customer', customerId)
  const interactions = useInteractions('customer', customerId)
  const custOps = useOperationList({ customerId, page: 1, pageSize: 100, sort: { key: 'created_at', dir: 'desc' } })
  const opIds = useMemo(() => (custOps.data?.rows ?? []).map((o) => o.id), [custOps.data])
  const quotes = useCustomerQuotes(opIds)
  const samples = useCustomerSamples(opIds)
  const orders = useCustomerOrders(opIds)
  const files = useEntityFiles('customer', customerId != null ? String(customerId) : null)

  const updateOp = useUpdateOperation()
  const addAction = useAddOperationInteraction()
  const setNextAction = useSetNextAction()
  const setQuoteResult = useSetQuoteResult()
  const advance = useAdvanceStage()
  const channels = useChannelOptions()
  const outcomes = useOutcomeOptions()

  const c = customer.data
  const name = c?.company_name ?? c?.full_name ?? row?.customer_name ?? '—'

  // — Hızlı aksiyon formu —
  const [channelId, setChannelId] = useState<string | null>(null)
  const [outcomeId, setOutcomeId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [followUp, setFollowUp] = useState<string | null>(null)
  const telefonId = useMemo(() => channels.data?.find((ch) => ch.key === 'telefon')?.id ?? null, [channels.data])
  // Kanal varsayılanı telefon (yüklenince). Satır değişince formu sıfırla.
  useEffect(() => { setChannelId(telefonId != null ? String(telefonId) : null); setOutcomeId(null); setNote(''); setFollowUp(null) }, [operationId, telefonId])

  // Teklif sonuç diyalogları
  const [acceptFor, setAcceptFor] = useState<{ id: number; operation_id: number } | null>(null)
  const [rejectFor, setRejectFor] = useState<{ id: number; operation_id: number } | null>(null)

  const invalidateAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['operations'] }),
      qc.invalidateQueries({ queryKey: ['calisma-last-notes'] }),
      qc.invalidateQueries({ queryKey: ['calisma-cust-quotes'] }),
      qc.invalidateQueries({ queryKey: ['calisma-cust-samples'] }),
      qc.invalidateQueries({ queryKey: ['calisma-cust-orders'] }),
      customerId != null ? qc.invalidateQueries({ queryKey: ['interactions', 'customer', customerId] }) : Promise.resolve(),
      customerId != null ? qc.invalidateQueries({ queryKey: ['customer', customerId] }) : Promise.resolve(),
    ])
  }

  async function saveAction() {
    if (!row || customerId == null) return
    const text = note.trim()
    if (!text && !outcomeId) { toast.error('Not ya da sonuç girin.'); return }
    if (channelId == null) { toast.error('Kanal seçin.'); return }
    try {
      await addAction.mutateAsync({
        operation_id: row.id, customer_id: customerId, channel_id: Number(channelId),
        outcome_id: outcomeId ? Number(outcomeId) : null, direction: 'outbound',
        occurred_at: new Date().toISOString(), summary: text || null,
      })
      if (followUp) await setNextAction.mutateAsync({ customerId, nextActionAt: `${followUp}T09:00:00` })
      await invalidateAll()
      setNote(''); setOutcomeId(null); setFollowUp(null)
      toast.success(followUp ? 'Aksiyon eklendi, takip tarihi ayarlandı.' : 'Aksiyon eklendi.')
    } catch (err) { toast.error(await toUserMessage(err)) }
  }

  async function changeOpStatus(opId: number, statusId: number) {
    try { await updateOp.mutateAsync({ id: opId, request_status_id: statusId }); await qc.invalidateQueries({ queryKey: ['operations'] }) }
    catch (err) { toast.error(await toUserMessage(err)) }
  }

  const busy = addAction.isPending || setNextAction.isPending
  const opRows = custOps.data?.rows ?? []
  const goto = (path: string) => { onOpenChange(false); navigate(path) }

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
              {row?.stage_label && <span className={cn('rounded px-1.5 py-0.5 font-medium', toneClass(row.stage_color))} title="Aşama — süreçle ilerler, elle değişmez">{row.stage_label}</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {position && <span className="text-text-muted mr-1 text-[10px]">{position}</span>}
            <Button variant="outline" size="icon" className="size-7" onClick={() => onNavigate('prev')} disabled={!hasPrev} aria-label="Önceki (↑)"><ChevronUp className="size-4" /></Button>
            <Button variant="outline" size="icon" className="size-7" onClick={() => onNavigate('next')} disabled={!hasNext} aria-label="Sonraki (↓)"><ChevronDown className="size-4" /></Button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {/* Künye */}
          <Section title="Künye" icon={UserRound}>
            <div className="text-text-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span>İlk temas: <span className="text-text-secondary">{fmtDate(c?.first_contact_date ?? null)}</span></span>
              <span className="inline-flex items-center gap-1"><Clock className="size-3" /> Son temas: <span className="text-text-secondary">{fmtDateTime(c?.last_interaction_at ?? null)}</span></span>
              {c?.next_action_at && <span>Sonraki takip: <span className="text-accent-primary font-medium">{fmtDate(c.next_action_at)}</span></span>}
            </div>
            {contacts.data && contacts.data.length > 0 && (
              <div className="flex flex-wrap gap-1.5">{contacts.data.map((cp) => <ContactBadge key={cp.id} cp={cp} />)}</div>
            )}
          </Section>

          {/* 1) AKSİYON — hızlı ekleme formu + geçmiş */}
          <Section title="Aksiyon geçmişi" icon={MessageCircle} count={interactions.data?.length}>
            <div className="bg-subtle space-y-2 rounded-lg p-2.5">
              <div className="grid grid-cols-2 gap-2">
                <SearchableSelect options={(channels.data ?? []).map((ch) => ({ value: String(ch.id), label: ch.label }))}
                  value={channelId} onChange={setChannelId} placeholder="Kanal" />
                <SearchableSelect clearable options={(outcomes.data ?? []).map((o) => ({ value: String(o.id), label: o.label }))}
                  value={outcomeId} onChange={setOutcomeId} placeholder="Sonuç" />
              </div>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Not — görüşmede ne konuşuldu?" className="text-sm" />
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <DatePicker value={followUp} onChange={setFollowUp} placeholder="Sonraki takip tarihi (ops.)" />
                </div>
                <Button size="sm" onClick={() => void saveAction()} disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Kaydet
                </Button>
              </div>
            </div>
            {interactions.isLoading ? (
              <div className="text-text-muted flex items-center gap-2 text-xs"><Loader2 className="size-3.5 animate-spin" /> Yükleniyor…</div>
            ) : (interactions.data ?? []).length === 0 ? (
              <p className="text-text-muted text-xs">Kayıtlı aksiyon yok.</p>
            ) : (
              <ul className="space-y-2">
                {interactions.data!.map((it) => (
                  <li key={it.id} className="border-subtle border-l-2 pl-2.5">
                    <div className="text-text-muted flex flex-wrap items-center gap-x-1.5 text-[11px]">
                      <span>{fmtDateTime(it.occurred_at)}</span>
                      {it.channel_label && <span>· {it.channel_label}</span>}
                      {it.outcome_label && <span className={cn(it.outcome_positive ? 'text-success-foreground' : 'text-text-muted')}>· {it.outcome_label}</span>}
                    </div>
                    {it.summary && <p className="text-text-secondary mt-0.5 whitespace-pre-wrap text-sm">{it.summary}</p>}
                    {it.created_by_name && <div className="text-text-muted mt-0.5 text-[10px]">{it.created_by_name}</div>}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* 2) TALEPLER — müşterinin tüm talepleri; durum değiştirilebilir */}
          <Section title="Talepler" icon={Inbox} count={opRows.length}>
            {opRows.length === 0 ? <p className="text-text-muted text-xs">Talep yok.</p> : (
              <ul className="space-y-1.5">
                {opRows.map((o) => (
                  <li key={o.id} className="bg-subtle flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs">{o.code}</span>
                        {o.stage_label && <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', toneClass(o.stage_color))}>{o.stage_label}</span>}
                      </div>
                      <div className="text-text-muted text-[10px]">{fmtDate(o.requested_at ?? o.created_at)}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <StatusDropdown statusKey={o.status_key} statusLabel={o.status_label} onPick={(id) => void changeOpStatus(o.id, id)} />
                      <Button variant="ghost" size="icon" className="size-7" title="Talebi aç" onClick={() => goto(`/talepler/${o.id}`)}><ArrowUpRight className="size-3.5" /></Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* 3) TEKLİFLER — kabul/red işaretlenebilir; hazırlama detay sayfasında */}
          <Section title="Teklifler" icon={Receipt} count={quotes.data?.length}>
            {(quotes.data ?? []).length === 0 ? <p className="text-text-muted text-xs">Teklif yok.</p> : (
              <ul className="space-y-1.5">
                {quotes.data!.map((q) => {
                  const closed = QUOTE_CLOSED.includes(q.status_key ?? '')
                  return (
                    <li key={q.id} className="bg-subtle rounded-md px-2 py-1.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-medium">v{q.version}</span>
                          <span className="text-text-muted ml-2 text-xs">{q.sent_at ? `İletildi ${fmtDate(q.sent_at)}` : fmtDate(q.created_at)}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="tabular-nums text-xs">{fmtMoney(q.total, q.currency)}</span>
                          {q.status_label && <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', toneClass(q.status_color))}>{q.status_label}</span>}
                        </div>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={closed || setQuoteResult.isPending} onClick={() => setAcceptFor({ id: q.id, operation_id: q.operation_id })}>
                          <Check className="size-3" /> Kabul</Button>
                        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={closed || setQuoteResult.isPending} onClick={() => setRejectFor({ id: q.id, operation_id: q.operation_id })}>
                          Red</Button>
                        <Button size="sm" variant="ghost" className="ml-auto h-6 px-2 text-xs" onClick={() => goto(`/talepler/${q.operation_id}`)}>
                          Teklifi aç <ExternalLink className="size-3" /></Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          {/* 4) NUMUNELER — salt görünüm + Numunelerde aç */}
          <Section title="Numuneler" icon={Package} count={samples.data?.length}>
            {(samples.data ?? []).length === 0 ? <p className="text-text-muted text-xs">Numune yok.</p> : (
              <ul className="space-y-1.5">
                {samples.data!.map((s) => (
                  <li key={s.id} className="bg-subtle flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium">v{s.version}</span>
                      {s.description && <span className="text-text-secondary ml-2 truncate text-xs">{s.description}</span>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {s.status_label && <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', toneClass(s.status_color))}>{s.status_label}</span>}
                      <Button variant="ghost" size="icon" className="size-7" title="Numunelerde aç" onClick={() => goto('/numuneler')}><ArrowUpRight className="size-3.5" /></Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* 5) SİPARİŞLER — salt görünüm + Siparişlerde aç */}
          <Section title="Siparişler" icon={ClipboardList} count={orders.data?.length}>
            {(orders.data ?? []).length === 0 ? <p className="text-text-muted text-xs">Sipariş yok.</p> : (
              <ul className="space-y-1.5">
                {orders.data!.map((o) => (
                  <li key={o.id} className="bg-subtle flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm">
                    <div className="min-w-0">
                      <span className="tabular-nums text-xs">{fmtMoney(o.total, o.currency)}</span>
                      <span className="text-text-muted ml-2 text-[10px]">{fmtDate(o.order_date ?? o.created_at)}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {o.status_label && <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', toneClass(o.status_color))}>{o.status_label}</span>}
                      <Button variant="ghost" size="icon" className="size-7" title="Siparişlerde aç" onClick={() => goto('/siparisler')}><ArrowUpRight className="size-3.5" /></Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* 6) BELGELER — müşterinin belgeleri */}
          <Section title="Belgeler" icon={FileText} count={files.data?.length}>
            {(files.data ?? []).length === 0 ? <p className="text-text-muted text-xs">Belge yok.</p> : (
              <ul className="-mx-2">{files.data!.map((f) => <li key={f.id}><FileLink file={f} /></li>)}</ul>
            )}
          </Section>
        </div>
      </SheetContent>

      {acceptFor && <QuoteAcceptDialog onClose={() => setAcceptFor(null)} onAccept={async (choice) => {
        const q = acceptFor; setAcceptFor(null)
        try {
          await setQuoteResult.mutateAsync({ id: q.id, operationId: q.operation_id, statusKey: 'kabul_edildi' })
          if (choice !== 'mark') await advance.mutateAsync({ operationId: q.operation_id, stageKey: choice })
          await invalidateAll()
          toast.success(choice === 'mark' ? 'Teklif kabul işaretlendi.' : `Teklif kabul — aşama: ${choice === 'numune' ? 'Numune' : 'Sipariş'}.`)
        } catch (err) { toast.error(await toUserMessage(err)) }
      }} />}
      {rejectFor && <QuoteRejectDialog onClose={() => setRejectFor(null)} onReject={async (reasonId, rnote) => {
        const q = rejectFor; setRejectFor(null)
        try {
          await setQuoteResult.mutateAsync({ id: q.id, operationId: q.operation_id, statusKey: 'reddedildi', rejectionReasonId: reasonId, rejectionNote: rnote || null })
          await invalidateAll()
          toast.success('Teklif reddedildi işaretlendi.')
        } catch (err) { toast.error(await toUserMessage(err)) }
      }} />}
    </Sheet>
  )
}
