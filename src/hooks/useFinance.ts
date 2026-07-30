import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ensureRows } from '@/lib/errors'
import { normalizeTr } from '@/lib/normalize'

// ── Yetki kısayolları ─────────────────────────────────────────────────────────
export function useFinancePerms() {
  return useQuery({
    queryKey: ['finance-perms'],
    staleTime: 300_000,
    queryFn: async () => {
      const [view, edit, exp] = await Promise.all([
        supabase.rpc('has_permission', { permission_key: 'finance.view' }),
        supabase.rpc('has_permission', { permission_key: 'finance.edit' }),
        supabase.rpc('has_permission', { permission_key: 'finance.export' }),
      ])
      return { view: view.data ?? false, edit: edit.data ?? false, export: exp.data ?? false }
    },
  })
}

// ── Ödeme yöntemleri (referans) ──────────────────────────────────────────────
export function usePaymentMethods(activeOnly = true) {
  return useQuery({
    queryKey: ['payment-methods', activeOnly],
    queryFn: async () => {
      let q = supabase.from('payment_methods').select('*').order('sort_order')
      if (activeOnly) q = q.eq('is_active', true)
      return ensureRows(await q)
    },
  })
}

// ── Banka hesapları ──────────────────────────────────────────────────────────
export function useBankAccounts(activeOnly = false) {
  return useQuery({
    queryKey: ['bank-accounts', activeOnly],
    queryFn: async () => {
      let q = supabase.from('bank_accounts').select('*').order('sort_order').order('bank_name')
      if (activeOnly) q = q.eq('is_active', true)
      return ensureRows(await q)
    },
  })
}
export function useSaveBankAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { id?: number; bank_name: string; account_name?: string | null; iban?: string | null; currency?: string; is_active?: boolean; sort_order?: number }) => {
      if (a.id) {
        const { id, ...rest } = a
        return ensureRows(await supabase.from('bank_accounts').update(rest).eq('id', id).select())
      }
      return ensureRows(await supabase.from('bank_accounts').insert(a as never).select())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bank-accounts'] }),
  })
}
export function useSavePaymentMethod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (m: { id?: number; key?: string; label: string; sort_order?: number; is_active?: boolean }) => {
      if (m.id) {
        const { id, ...rest } = m
        return ensureRows(await supabase.from('payment_methods').update(rest).eq('id', id).select())
      }
      const key = m.key || (normalizeTr(m.label) ?? '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      return ensureRows(await supabase.from('payment_methods').insert({ ...m, key } as never).select())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-methods'] }),
  })
}

// ── Müşteri seçici (aranabilir) — tüm aktif müşteriler; cmdk yerelde filtreler ──
export function useCustomerOptions() {
  return useQuery({
    queryKey: ['customer-options'],
    staleTime: 120_000,
    queryFn: async () => {
      const rows = ensureRows(await supabase.from('customers').select('id, company_name, full_name, customer_code')
        .is('deleted_at', null).order('company_name', { nullsFirst: false }).limit(1000))
      return rows.map((r) => ({
        value: String(r.id),
        label: r.company_name || r.full_name || `#${r.id}`,
        keywords: [r.customer_code, r.full_name, normalizeTr(r.company_name || '')].filter(Boolean).join(' '),
      }))
    },
  })
}

// ── Bakiye (hareketlerden türetilir) ─────────────────────────────────────────
export interface Balance { balance_usd: number; balance_try: number; last_transaction_at: string | null }
export function useCustomerBalance(customerId: number | null) {
  return useQuery({
    enabled: customerId != null,
    queryKey: ['customer-balance', customerId],
    queryFn: async (): Promise<Balance> => {
      const { data, error } = await supabase.rpc('customer_balance', { p_customer_id: customerId! })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return { balance_usd: Number(row?.balance_usd ?? 0), balance_try: Number(row?.balance_try ?? 0), last_transaction_at: row?.last_transaction_at ?? null }
    },
  })
}

// ── Cari hareketler + yürüyen bakiye ─────────────────────────────────────────
export interface TxFilters { customerId: number; from?: string | null; to?: string | null; sourceType?: string | null }
export interface TxRow {
  id: number; direction: string; source_type: string; source_id: number | null; operation_id: number | null
  amount: number; currency: string; amount_try: number; amount_usd: number; occurred_at: string
  description: string | null; reverses_id: number | null
  running_usd?: number; running_try?: number
}
export function useCustomerTransactions(f: TxFilters | null) {
  return useQuery({
    enabled: f != null,
    queryKey: ['customer-tx', f],
    queryFn: async (): Promise<TxRow[]> => {
      let q = supabase.from('account_transactions').select('*').eq('customer_id', f!.customerId).is('deleted_at', null).order('occurred_at').order('id')
      if (f!.from) q = q.gte('occurred_at', f!.from)
      if (f!.to) q = q.lte('occurred_at', f!.to)
      if (f!.sourceType) q = q.eq('source_type', f!.sourceType)
      const rows = ensureRows(await q) as TxRow[]
      // yürüyen bakiye (alacak +, borc −), kronolojik
      let ru = 0, rt = 0
      for (const r of rows) {
        const s = r.direction === 'alacak' ? 1 : -1
        ru += s * Number(r.amount_usd); rt += s * Number(r.amount_try)
        r.running_usd = Math.round(ru * 100) / 100; r.running_try = Math.round(rt * 100) / 100
      }
      return rows
    },
  })
}

// ── Ödeme oluştur ────────────────────────────────────────────────────────────
export interface NewPayment {
  customer_id: number; operation_id?: number | null; order_id?: number | null
  direction?: 'gelen' | 'giden'; amount: number; currency: string
  exchange_rate?: number | null; usd_rate?: number | null; paid_at: string
  payment_method_id?: number | null; bank_account_id?: number | null
  reference_no?: string | null; note?: string | null; is_advance?: boolean
}
export function useCreatePayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: NewPayment) => ensureRows(await supabase.from('payments').insert({ direction: 'gelen', ...p }).select()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-balance'] })
      qc.invalidateQueries({ queryKey: ['customer-tx'] })
      qc.invalidateQueries({ queryKey: ['payments-list'] })
      qc.invalidateQueries({ queryKey: ['order-paid'] })
      qc.invalidateQueries({ queryKey: ['finance-summary'] })
    },
  })
}

/** Ödeme silme = soft-delete; trigger cari ters kaydı atar. Gerekçe not'a yazılır. */
export function useDeletePayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const { data: u } = await supabase.auth.getUser()
      return ensureRows(await supabase.from('payments').update({ deleted_at: new Date().toISOString(), deleted_by: u.user?.id ?? null, note: reason }).eq('id', id).select())
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-balance'] }); qc.invalidateQueries({ queryKey: ['customer-tx'] })
      qc.invalidateQueries({ queryKey: ['payments-list'] }); qc.invalidateQueries({ queryKey: ['order-paid'] })
    },
  })
}

/** Cari hareketi ters kayıtla düzelt (elle hatalı giriş için). */
export function useReverseTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const { data, error } = await supabase.rpc('reverse_account_transaction', { p_id: id, p_reason: reason })
      if (error) throw error
      return data
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customer-balance'] }); qc.invalidateQueries({ queryKey: ['customer-tx'] }) },
  })
}

// ── Siparişe alınan ödeme özeti (ön ödeme kontrolü + sipariş kartı) ───────────
export interface PaidSummary {
  order_total: number; order_currency: string; order_total_usd: number
  paid_usd: number; paid_try: number; advance_usd: number; remaining_usd: number; paid_percent: number
}
export function useOrderPaidSummary(orderId: number | null) {
  return useQuery({
    enabled: orderId != null,
    queryKey: ['order-paid', orderId],
    queryFn: async (): Promise<PaidSummary> => {
      const { data, error } = await supabase.rpc('order_paid_summary', { p_order_id: orderId! })
      if (error) throw error
      return data as unknown as PaidSummary
    },
  })
}

// ── Ön ödeme kontrolü (P5.3) ─────────────────────────────────────────────────
export interface AdvanceCheck {
  required_percent: number; order_total_usd: number; required_usd: number
  advance_usd: number; paid_usd: number; advance_percent: number; sufficient: boolean
}
export function useOrderAdvanceCheck(orderId: number | null) {
  return useQuery({
    enabled: orderId != null,
    queryKey: ['order-advance', orderId],
    queryFn: async (): Promise<AdvanceCheck> => {
      const { data, error } = await supabase.rpc('order_advance_check', { p_order_id: orderId! })
      if (error) throw error
      return data as unknown as AdvanceCheck
    },
  })
}
// ── Finans ekranı (P5.5) ─────────────────────────────────────────────────────
export interface FinanceSummary {
  open_receivable_usd: number; open_receivable_try: number; overdue_usd: number
  collected_month_try: number; collected_month_usd: number; advance_missing_count: number; as_of: string
}
export function useFinanceSummary() {
  return useQuery({
    queryKey: ['finance-summary'],
    queryFn: async (): Promise<FinanceSummary> => {
      const { data, error } = await supabase.rpc('finance_summary')
      if (error) throw error
      return data as unknown as FinanceSummary
    },
  })
}
export function useOpenBalances() {
  return useQuery({
    queryKey: ['open-balances'],
    queryFn: async () => ensureRows(await supabase.rpc('open_balances')),
  })
}
export function useDuePayments() {
  return useQuery({
    queryKey: ['due-payments'],
    queryFn: async () => ensureRows(await supabase.rpc('due_payments')),
  })
}

/** Tüm cari hareketler (Hareketler sekmesi — denetim). finance.view RLS. */
export function useAllTransactions(limit = 500) {
  return useQuery({
    queryKey: ['all-tx', limit],
    queryFn: async () => {
      const rows = ensureRows(await supabase.from('account_transactions')
        .select('id, customer_id, direction, source_type, amount, currency, amount_try, amount_usd, occurred_at, description, reverses_id, customers(company_name, full_name)')
        .is('deleted_at', null).order('occurred_at', { ascending: false }).order('id', { ascending: false }).limit(limit))
      return rows as unknown as (TxRow & { customer_id: number; customers: { company_name: string | null; full_name: string | null } | null })[]
    },
  })
}

export interface PaymentFilters { customerId?: number | null; from?: string | null; to?: string | null; methodId?: number | null; bankId?: number | null; currency?: string | null }
export interface PaymentListRow {
  id: number; customer_id: number | null; order_id: number | null; operation_id: number | null
  amount: number; currency: string; amount_try: number | null; amount_usd: number | null
  paid_at: string; reference_no: string | null; is_advance: boolean; note: string | null
  payment_method_id: number | null; bank_account_id: number | null
  customers: { company_name: string | null; full_name: string | null } | null
  payment_methods: { label: string } | null
  bank_accounts: { bank_name: string } | null
}
export function usePaymentsList(f: PaymentFilters) {
  return useQuery({
    queryKey: ['payments-list', f],
    queryFn: async (): Promise<PaymentListRow[]> => {
      let q = supabase.from('payments')
        .select('id, customer_id, order_id, operation_id, amount, currency, amount_try, amount_usd, paid_at, reference_no, is_advance, note, payment_method_id, bank_account_id, customers(company_name, full_name), payment_methods(label), bank_accounts(bank_name)')
        .eq('direction', 'gelen').is('deleted_at', null).order('paid_at', { ascending: false }).order('id', { ascending: false }).limit(500)
      if (f.customerId) q = q.eq('customer_id', f.customerId)
      if (f.from) q = q.gte('paid_at', f.from)
      if (f.to) q = q.lte('paid_at', f.to)
      if (f.methodId) q = q.eq('payment_method_id', f.methodId)
      if (f.bankId) q = q.eq('bank_account_id', f.bankId)
      if (f.currency) q = q.eq('currency', f.currency)
      return ensureRows(await q) as unknown as PaymentListRow[]
    },
  })
}

/** Yetersiz ön ödemeyle üretime geçişi gerekçeyle kayda alır + yöneticiye bildirir. */
export function useAdvanceOverride() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: number; reason: string }) => {
      const { data, error } = await supabase.rpc('advance_override', { p_order_id: orderId, p_reason: reason })
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['order-advance'] }),
  })
}
