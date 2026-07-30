import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, FileDown } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { supabase } from '@/lib/supabase'
import { env, hasPdfService, PDF_UNAVAILABLE } from '@/lib/env'
import { toUserMessage } from '@/lib/errors'
import { formatMoney } from '@/lib/money'

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)

/** P5.7 — Cari ekstre üret (dönem + para birimi + dil), PDF indir. */
export function EkstreDialog({ customerId, onClose }: { customerId: number; onClose: () => void }) {
  const [from, setFrom] = useState(daysAgo(90))
  const [to, setTo] = useState(today())
  const [currency, setCurrency] = useState<'TRY' | 'USD'>('TRY')
  const [language, setLanguage] = useState<'tr' | 'en'>('tr')
  const [busy, setBusy] = useState(false)

  async function generate() {
    setBusy(true)
    try {
      const [{ data: company }, cusRes, txRes] = await Promise.all([
        supabase.rpc('document_uretici'),
        supabase.from('customers').select('company_name, full_name, tax_number, tax_office, address').eq('id', customerId).single(),
        supabase.from('account_transactions').select('direction, amount_try, amount_usd, occurred_at, description, source_type')
          .eq('customer_id', customerId).is('deleted_at', null).lte('occurred_at', to + 'T23:59:59')
          .order('occurred_at').order('id'),
      ])
      if (txRes.error) throw txRes.error
      const cu = cusRes.data
      const field = (r: { amount_try: number; amount_usd: number }) => currency === 'USD' ? Number(r.amount_usd) : Number(r.amount_try)
      // borç(+)/alacak(−) → müşterinin borcu (pozitif = borçlu). Ekstre konvansiyonu.
      const owed = (r: { direction: string; amount_try: number; amount_usd: number }) => (r.direction === 'borc' ? 1 : -1) * field(r)
      const all = txRes.data ?? []
      let running = 0
      const rows: { date: string; desc: string; debit: string; credit: string; balance: string }[] = []
      for (const r of all) {
        const before = r.occurred_at.slice(0, 10) < from
        running += owed(r)
        if (before) continue
        const isDebt = r.direction === 'borc'
        rows.push({
          date: r.occurred_at.slice(0, 10),
          desc: r.description || ({ siparis: 'Sipariş', odeme: 'Ödeme', iade: 'İade', duzeltme: 'Düzeltme', diger: 'Diğer' }[r.source_type] ?? r.source_type),
          debit: isDebt ? formatMoney(field(r), currency) : '',
          credit: !isDebt ? formatMoney(field(r), currency) : '',
          balance: formatMoney(running, currency),
        })
      }
      // açılış = ilk dönem-içi satırdan önceki bakiye
      let opening = 0
      for (const r of all) { if (r.occurred_at.slice(0, 10) < from) opening += owed(r) }

      const c = (company ?? {}) as Record<string, string>
      const ekstre = {
        company: { name: c.name, address: c.address, phone: c.phone, email: c.email, taxNumber: c.tax_number, taxOffice: c.tax_office },
        customer: { name: cu?.company_name || cu?.full_name || '—', taxNumber: cu?.tax_number, taxOffice: cu?.tax_office, address: cu?.address },
        periodLabel: `${from} — ${to}`,
        currency,
        opening: formatMoney(opening, currency),
        closing: formatMoney(running, currency),
        rows,
        generatedAt: new Date().toLocaleString('tr-TR'),
      }
      if (!hasPdfService) throw new Error(PDF_UNAVAILABLE)
      const res = await fetch(env.pdfServiceUrl.replace(/\/$/, '') + '/render', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ template: 'cari_ekstre', data: { ekstre }, language }),
      })
      if (!res.ok) throw new Error('Ekstre üretilemedi (PDF servisi).')
      const blob = await res.blob()
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = `ekstre-${cu?.company_name || cu?.full_name || customerId}-${to}.pdf`; a.click()
      toast.success('Ekstre indirildi.')
      onClose()
    } catch (e) { toast.error(await toUserMessage(e)) } finally { setBusy(false) }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileDown className="size-4" /> Ekstre indir</DialogTitle>
          <DialogDescription>Seçtiğiniz dönem ve para birimi için cari hesap ekstresi (PDF).</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-sm">Başlangıç</Label><Input className="mt-1" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-sm">Bitiş</Label><Input className="mt-1" type="date" value={to} max={today()} onChange={(e) => setTo(e.target.value)} /></div>
          <div><Label className="text-sm">Para birimi</Label><SearchableSelect className="mt-1" options={[{ value: 'TRY', label: 'TRY (₺)' }, { value: 'USD', label: 'USD ($)' }]} value={currency} onChange={(v) => setCurrency((v as 'TRY' | 'USD') || 'TRY')} /></div>
          <div><Label className="text-sm">Dil</Label><SearchableSelect className="mt-1" options={[{ value: 'tr', label: 'Türkçe' }, { value: 'en', label: 'English' }]} value={language} onChange={(v) => setLanguage((v as 'tr' | 'en') || 'tr')} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button onClick={() => void generate()} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />} İndir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
