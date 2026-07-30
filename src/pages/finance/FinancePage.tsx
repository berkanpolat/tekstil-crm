import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, Plus, Download, Lock, TrendingUp, AlertTriangle, CalendarClock } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { DatePicker } from '@/components/shared/DatePicker'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatMoney, formatDate, balanceTone } from '@/lib/money'
import { RateBadge } from '@/pages/catalog/RateBadge'
import {
  useFinancePerms, useFinanceSummary, useOpenBalances, useDuePayments, usePaymentsList, useAllTransactions,
  usePaymentMethods, useBankAccounts, useCustomerOptions, type PaymentFilters,
} from '@/hooks/useFinance'
import { PaymentDialog } from './PaymentDialog'

const TABS = [
  { key: 'odemeler', label: 'Ödemeler' },
  { key: 'bakiyeler', label: 'Açık Bakiyeler' },
  { key: 'vadeler', label: 'Vadesi Gelenler' },
  { key: 'hareketler', label: 'Hareketler' },
] as const
type TabKey = (typeof TABS)[number]['key']
const SOURCE_LABEL: Record<string, string> = { siparis: 'Sipariş', odeme: 'Ödeme', iade: 'İade', duzeltme: 'Düzeltme', diger: 'Diğer' }

/** P5.5 — Finans ekranı: özet kartları + Ödemeler / Açık Bakiyeler / Vadesi Gelenler / Hareketler. */
export function FinancePage() {
  const perms = useFinancePerms()
  const [tab, setTab] = useState<TabKey>('odemeler')
  const [payOpen, setPayOpen] = useState(false)

  if (perms.isLoading) return <div className="space-y-4"><PageHeader title="Finans" /><Skeleton className="h-40 w-full" /></div>
  if (!perms.data?.view) return <EmptyState icon={Lock} title="Erişim yok" description="Finans ekranını görmek için finans yetkisi gerekiyor." />

  return (
    <div className="space-y-5">
      <PageHeader title="Finans" description="Cari hesap, tahsilat ve vadeler."
        action={<div className="flex items-center gap-2"><RateBadge />{perms.data.edit && <Button onClick={() => setPayOpen(true)}><Plus className="size-4" /> Ödeme ekle</Button>}</div>} />

      <SummaryCards />

      <div className="border-b border-border">
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={cn('border-b-2 px-3 py-2 text-sm font-medium', tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-text-muted hover:text-foreground')}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'odemeler' && <PaymentsTab canExport={!!perms.data.export} />}
      {tab === 'bakiyeler' && <BalancesTab />}
      {tab === 'vadeler' && <DueTab />}
      {tab === 'hareketler' && <TransactionsTab />}

      {payOpen && <PaymentDialog onClose={() => setPayOpen(false)} onSaved={() => setPayOpen(false)} />}
    </div>
  )
}

function SummaryCards() {
  const { data, isLoading } = useFinanceSummary()
  if (isLoading || !data) return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
  const cards = [
    { icon: Wallet, label: 'Açık alacak', value: formatMoney(data.open_receivable_usd, 'USD'), sub: formatMoney(data.open_receivable_try, 'TRY'), tone: 'text-foreground' },
    { icon: AlertTriangle, label: 'Vadesi geçen', value: formatMoney(data.overdue_usd, 'USD'), sub: 'kalan tahsilat', tone: data.overdue_usd > 0 ? 'text-destructive' : 'text-foreground' },
    { icon: TrendingUp, label: 'Bu ay tahsil', value: formatMoney(data.collected_month_try, 'TRY'), sub: formatMoney(data.collected_month_usd, 'USD'), tone: 'text-success-foreground' },
    { icon: CalendarClock, label: 'Ön ödemesi eksik', value: `${data.advance_missing_count} sipariş`, sub: 'aktif', tone: data.advance_missing_count > 0 ? 'text-warning-foreground' : 'text-foreground' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-text-muted"><c.icon className="size-4" /> {c.label}</div>
          <div className={cn('mt-1 text-lg font-semibold tabular-nums', c.tone)}>{c.value}</div>
          <div className="text-xs text-text-muted">{c.sub}</div>
        </div>
      ))}
    </div>
  )
}

const custName = (c: { company_name: string | null; full_name: string | null } | null) => c?.company_name || c?.full_name || '—'

function PaymentsTab({ canExport }: { canExport: boolean }) {
  const [f, setF] = useState<PaymentFilters>({})
  const list = usePaymentsList(f)
  const methods = usePaymentMethods(false)
  const banks = useBankAccounts(false)
  const customers = useCustomerOptions()
  const rows = list.data ?? []

  function exportCsv() {
    const head = ['Tarih', 'Müşteri', 'Tutar', 'Para', 'TL', 'USD', 'Yöntem', 'Banka', 'Referans', 'Ön ödeme']
    const lines = rows.map((r) => [r.paid_at, custName(r.customers), r.amount, r.currency, r.amount_try ?? '', r.amount_usd ?? '',
      r.payment_methods?.label ?? '', r.bank_accounts?.bank_name ?? '', r.reference_no ?? '', r.is_advance ? 'Evet' : ''].join(';'))
    const blob = new Blob(['﻿' + [head.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'odemeler.csv'; a.click()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchableSelect className="w-48" clearable options={customers.data ?? []} value={f.customerId ? String(f.customerId) : null} onChange={(v) => setF((s) => ({ ...s, customerId: v ? Number(v) : null }))} placeholder="Müşteri" searchPlaceholder="Firma / kod…" />
        <DatePicker className="w-40" clearable value={f.from ?? null} onChange={(v) => setF((s) => ({ ...s, from: v }))} placeholder="Başlangıç" />
        <DatePicker className="w-40" clearable value={f.to ?? null} onChange={(v) => setF((s) => ({ ...s, to: v }))} placeholder="Bitiş" />
        <SearchableSelect className="w-40" clearable options={(methods.data ?? []).map((m) => ({ value: String(m.id), label: m.label }))} value={f.methodId ? String(f.methodId) : null} onChange={(v) => setF((s) => ({ ...s, methodId: v ? Number(v) : null }))} placeholder="Yöntem" />
        <SearchableSelect className="w-40" clearable options={(banks.data ?? []).map((b) => ({ value: String(b.id), label: b.bank_name }))} value={f.bankId ? String(f.bankId) : null} onChange={(v) => setF((s) => ({ ...s, bankId: v ? Number(v) : null }))} placeholder="Banka" />
        <SearchableSelect className="w-28" clearable options={[{ value: 'TRY', label: 'TRY' }, { value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' }]} value={f.currency ?? null} onChange={(v) => setF((s) => ({ ...s, currency: v }))} placeholder="Para" />
        {canExport && <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}><Download className="size-4" /> Dışa aktar</Button>}
      </div>

      {rows.length === 0 ? <EmptyState icon={Wallet} title="Ödeme yok" description="Filtrelere uygun ödeme kaydı yok." /> : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-text-muted"><tr>
              {['Tarih', 'Müşteri', 'Tutar', 'TL karşılığı', 'Yöntem', 'Banka', 'Referans', ''].map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{formatDate(r.paid_at)}</td>
                  <td className="px-3 py-2">{r.customer_id ? <Link className="hover:underline" to={`/musteriler/${r.customer_id}`}>{custName(r.customers)}</Link> : custName(r.customers)}</td>
                  <td className="px-3 py-2 tabular-nums font-medium">{formatMoney(r.amount, r.currency)}{r.is_advance && <span className="ml-1 rounded bg-muted px-1 text-[10px] text-text-muted">ön</span>}</td>
                  <td className="px-3 py-2 tabular-nums text-text-secondary">{formatMoney(r.amount_try ?? 0, 'TRY')}</td>
                  <td className="px-3 py-2 text-text-secondary">{r.payment_methods?.label ?? '—'}</td>
                  <td className="px-3 py-2 text-text-secondary">{r.bank_accounts?.bank_name ?? '—'}</td>
                  <td className="px-3 py-2 text-text-secondary">{r.reference_no ?? '—'}</td>
                  <td className="px-3 py-2 text-right">{r.operation_id && <Link className="text-xs text-primary hover:underline" to={`/talepler/${r.operation_id}`}>Sipariş</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function BalancesTab() {
  const { data, isLoading } = useOpenBalances()
  if (isLoading) return <Skeleton className="h-40 w-full" />
  const rows = data ?? []
  if (!rows.length) return <EmptyState icon={Wallet} title="Açık bakiye yok" description="Tüm müşteri bakiyeleri sıfır." />
  const tone = (n: number) => balanceTone(n) === 'debt' ? 'text-destructive' : balanceTone(n) === 'credit' ? 'text-success-foreground' : 'text-foreground'
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-text-muted"><tr>
          {['Müşteri', 'Bakiye (USD)', 'Bakiye (TRY)', 'Son hareket'].map((h) => <th key={h} className={cn('px-3 py-2 font-medium', h.includes('Bakiye') ? 'text-right' : 'text-left')}>{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.customer_id} className="border-t border-border">
              <td className="px-3 py-2"><Link className="font-medium hover:underline" to={`/musteriler/${r.customer_id}`}>{r.customer_name}</Link></td>
              <td className={cn('px-3 py-2 text-right tabular-nums font-medium', tone(r.balance_usd))}>{formatMoney(r.balance_usd, 'USD')}</td>
              <td className={cn('px-3 py-2 text-right tabular-nums', tone(r.balance_try))}>{formatMoney(r.balance_try, 'TRY')}</td>
              <td className="px-3 py-2 text-text-muted">{r.last_at ? r.last_at.slice(0, 10) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DueTab() {
  const { data, isLoading } = useDuePayments()
  if (isLoading) return <Skeleton className="h-40 w-full" />
  const rows = data ?? []
  if (!rows.length) return <EmptyState icon={CalendarClock} title="Yaklaşan vade yok" description="Vadesi tanımlı ve ödemesi eksik sipariş yok." />
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-text-muted"><tr>
          {['Sipariş', 'Müşteri', 'Vade tipi', 'Vade', 'Kalan gün', 'Tutar (USD)'].map((h) => <th key={h} className={cn('px-3 py-2 font-medium', h.includes('Tutar') ? 'text-right' : 'text-left')}>{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const overdue = r.days_left < 0
            return (
              <tr key={`${r.order_id}-${r.due_kind}-${i}`} className="border-t border-border">
                <td className="px-3 py-2"><Link className="font-mono text-xs hover:underline" to={`/talepler/${r.operation_id}`}>{r.operation_code}</Link></td>
                <td className="px-3 py-2"><Link className="hover:underline" to={`/musteriler/${r.customer_id}`}>{r.customer_name}</Link></td>
                <td className="px-3 py-2 text-text-secondary">{r.due_kind === 'on_odeme' ? 'Ön ödeme' : 'Bakiye'}</td>
                <td className="px-3 py-2 text-text-secondary">{formatDate(r.due_date)}</td>
                <td className={cn('px-3 py-2', overdue ? 'font-medium text-destructive' : 'text-text-secondary')}>{overdue ? `${-r.days_left} gün geçti` : `${r.days_left} gün`}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMoney(r.amount_usd, 'USD')}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TransactionsTab() {
  const { data, isLoading } = useAllTransactions()
  if (isLoading) return <Skeleton className="h-40 w-full" />
  const rows = data ?? []
  if (!rows.length) return <EmptyState icon={Wallet} title="Hareket yok" description="Henüz cari hareket yok." />
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-text-muted"><tr>
          {['Tarih', 'Müşteri', 'Tip', 'Açıklama', 'Borç', 'Alacak'].map((h) => <th key={h} className={cn('px-3 py-2 font-medium', h === 'Borç' || h === 'Alacak' ? 'text-right' : 'text-left')}>{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const isDebt = r.direction === 'borc'
            const money = `${formatMoney(r.amount, r.currency)}${r.currency !== 'USD' ? ` (${formatMoney(r.amount_usd, 'USD')})` : ''}`
            return (
              <tr key={r.id} className="border-t border-border">
                <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{formatDate(r.occurred_at)}</td>
                <td className="px-3 py-2"><Link className="hover:underline" to={`/musteriler/${r.customer_id}`}>{custName(r.customers)}</Link></td>
                <td className="px-3 py-2 text-[11px] font-medium text-text-muted">{SOURCE_LABEL[r.source_type] ?? r.source_type}{r.reverses_id ? ' · ters' : ''}</td>
                <td className="px-3 py-2 text-text-secondary">{r.description ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums text-destructive">{isDebt ? money : ''}</td>
                <td className="px-3 py-2 text-right tabular-nums text-success-foreground">{!isDebt ? money : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
