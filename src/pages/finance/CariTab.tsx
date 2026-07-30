import { useState } from 'react'
import { Plus, Lock, Undo2, FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { DatePicker } from '@/components/shared/DatePicker'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatMoney, formatDate, balanceTone } from '@/lib/money'
import { cn } from '@/lib/utils'
import { toUserMessage } from '@/lib/errors'
import { useCustomerBalance, useCustomerTransactions, useFinancePerms, useReverseTransaction } from '@/hooks/useFinance'
import { PaymentDialog } from './PaymentDialog'
import { EkstreDialog } from './EkstreDialog'

const SOURCE_LABEL: Record<string, string> = { siparis: 'Sipariş', odeme: 'Ödeme', iade: 'İade', duzeltme: 'Düzeltme', diger: 'Diğer' }
const SOURCE_OPTS = Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }))

/** P5.6 — Müşteri kartı Cari sekmesi: bakiye + hareketler (yürüyen) + ödeme ekle. */
export function CariTab({ customerId }: { customerId: number }) {
  const perms = useFinancePerms()
  const bal = useCustomerBalance(customerId)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [src, setSrc] = useState<string | null>(null)
  const tx = useCustomerTransactions({ customerId, from: from || null, to: to || null, sourceType: src })
  const reverse = useReverseTransaction()
  const [payOpen, setPayOpen] = useState(false)
  const [ekstreOpen, setEkstreOpen] = useState(false)

  if (perms.data && !perms.data.view) {
    return <EmptyState icon={Lock} title="Erişim yok" description="Cari hesabı görüntülemek için finans yetkisi gerekiyor." />
  }

  async function onReverse(id: number) {
    const reason = window.prompt('Ters kayıt gerekçesi (zorunlu):')?.trim()
    if (!reason) return
    try { await reverse.mutateAsync({ id, reason }); toast.success('Ters kayıt atıldı.') }
    catch (e) { toast.error(await toUserMessage(e)) }
  }

  const usd = bal.data?.balance_usd ?? 0
  const tryv = bal.data?.balance_try ?? 0
  const toneCls = (n: number) => balanceTone(n) === 'debt' ? 'text-destructive' : balanceTone(n) === 'credit' ? 'text-success-foreground' : 'text-foreground'
  const rows = tx.data ?? []

  return (
    <div className="space-y-4">
      {/* Bakiye başlığı */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex gap-8">
          <div>
            <div className="text-xs text-text-muted">Bakiye (USD)</div>
            <div className={cn('text-xl font-semibold tabular-nums', toneCls(usd))}>{formatMoney(usd, 'USD')}</div>
          </div>
          <div>
            <div className="text-xs text-text-muted">Bakiye (TRY)</div>
            <div className={cn('text-xl font-semibold tabular-nums', toneCls(tryv))}>{formatMoney(tryv, 'TRY')}</div>
          </div>
        </div>
        <div className="text-right">
          {balanceTone(usd) === 'debt' && <div className="mb-1 text-xs font-medium text-destructive">Müşteri borçlu</div>}
          <div className="flex gap-2">
            {perms.data?.export && <Button variant="outline" onClick={() => setEkstreOpen(true)}><FileDown className="size-4" /> Ekstre indir</Button>}
            {perms.data?.edit && <Button onClick={() => setPayOpen(true)}><Plus className="size-4" /> Ödeme ekle</Button>}
          </div>
        </div>
      </div>

      {/* Filtreler */}
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker className="w-40" clearable value={from || null} onChange={(v) => setFrom(v ?? '')} placeholder="Başlangıç" />
        <DatePicker className="w-40" clearable value={to || null} onChange={(v) => setTo(v ?? '')} placeholder="Bitiş" />
        <SearchableSelect className="w-44" clearable options={SOURCE_OPTS} value={src} onChange={setSrc} placeholder="Hareket tipi" />
      </div>

      {/* Hareketler */}
      {rows.length === 0 ? (
        <EmptyState icon={Plus} title="Hareket yok" description="Bu müşteri için henüz cari hareket yok." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Tarih</th>
                <th className="px-3 py-2 text-left font-medium">Açıklama</th>
                <th className="px-3 py-2 text-right font-medium">Borç</th>
                <th className="px-3 py-2 text-right font-medium">Alacak</th>
                <th className="px-3 py-2 text-right font-medium">Bakiye (USD)</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isDebt = r.direction === 'borc'
                const money = `${formatMoney(r.amount, r.currency)}${r.currency !== 'USD' ? ` (${formatMoney(r.amount_usd, 'USD')})` : ''}`
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{formatDate(r.occurred_at)}</td>
                    <td className="px-3 py-2">
                      <span className="text-[11px] font-medium text-text-muted">{SOURCE_LABEL[r.source_type] ?? r.source_type}</span>
                      {r.description ? <span className="ml-2">{r.description}</span> : null}
                      {r.reverses_id ? <span className="ml-2 rounded bg-muted px-1 text-[10px] text-text-muted">ters kayıt</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-destructive">{isDebt ? money : ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-success-foreground">{!isDebt ? money : ''}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums font-medium', toneCls(r.running_usd ?? 0))}>{formatMoney(r.running_usd ?? 0, 'USD')}</td>
                    <td className="px-3 py-2 text-right">
                      {perms.data?.edit && !r.reverses_id && (
                        <button type="button" title="Ters kayıtla düzelt" onClick={() => void onReverse(r.id)} className="text-text-muted hover:text-destructive"><Undo2 className="size-4" /></button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {payOpen && <PaymentDialog customerId={customerId} onClose={() => setPayOpen(false)} onSaved={() => { void bal.refetch(); void tx.refetch() }} />}
      {ekstreOpen && <EkstreDialog customerId={customerId} onClose={() => setEkstreOpen(false)} />}
    </div>
  )
}
