import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Wallet } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { supabase } from '@/lib/supabase'
import { formatMoney, parseDecimal } from '@/lib/money'
import { toUserMessage } from '@/lib/errors'
import { fetchRateOnDate } from '@/hooks/useDocuments'
import { useBankAccounts, useCreatePayment, useCustomerOptions, usePaymentMethods } from '@/hooks/useFinance'

const CCY = [
  { value: 'TRY', label: 'TRY (₺)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'EUR', label: 'EUR (€)' },
]
const fmtTr = (iso: string) => iso.split('-').reverse().join('.')
interface RateInfo { found: boolean; date: string; bulletinDate?: string; USD?: number; EUR?: number; GBP?: number }

/** P5.2 — Ödeme ekleme formu. Kur = ÖDEME GÜNÜ TCMB kuru (geçmiş tarih için de);
 *  bulunamazsa alan boş kalır, kullanıcı elle girer (bugünün kuru sessizce KONMAZ). */
export function PaymentDialog({
  onClose, onSaved, customerId, orderId, operationId, defaultAdvance,
}: {
  onClose: () => void
  onSaved?: () => void
  customerId?: number | null
  orderId?: number | null
  operationId?: number | null
  defaultAdvance?: boolean
}) {
  const methods = usePaymentMethods()
  const banks = useBankAccounts(true)
  const customers = useCustomerOptions()
  const create = useCreatePayment()

  const [cust, setCust] = useState<string | null>(customerId ? String(customerId) : null)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('TRY')
  const [rate, setRate] = useState('')          // exchange_rate (currency→TRY); TRY'de gizli
  const [usdRate, setUsdRate] = useState('')     // usd_rate (USD→TRY); USD karşılığı için
  const [rateTouched, setRateTouched] = useState(false)
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [rateInfo, setRateInfo] = useState<(RateInfo & { for: string; serviceOk: boolean }) | null>(null)
  const loadingRate = !rateInfo || rateInfo.for !== paidAt
  const [methodId, setMethodId] = useState<string | null>(null)
  const [bankId, setBankId] = useState<string | null>(null)
  const [ref, setRef] = useState('')
  const [isAdvance, setIsAdvance] = useState(!!defaultAdvance)
  const [note, setNote] = useState('')

  // Ödeme tarihi değişince o günün kuru çekilir (geçmiş için de). Elle dokunulmadıysa doldurur.
  useEffect(() => {
    let cancel = false
    void fetchRateOnDate(paidAt).then((info) => {
      if (cancel) return
      setRateInfo({ for: paidAt, serviceOk: info != null, found: !!info?.found, date: paidAt, bulletinDate: info?.bulletinDate, USD: info?.USD, EUR: info?.EUR, GBP: info?.GBP })
      if (info?.found) {
        // en yakın önceki bülten kuru → önbelleğe (rate_on_date fallback + tekrar çağrıyı azaltır)
        for (const c of ['USD', 'EUR', 'GBP'] as const) {
          const v = info[c]
          if (v && info.bulletinDate) void supabase.rpc('cache_historical_rate', { p_currency: c, p_rate: v, p_date: info.bulletinDate })
        }
        if (!rateTouched) {
          setUsdRate(info.USD ? String(info.USD) : '')
          setRate(currency === 'TRY' ? '' : currency === 'USD' ? String(info.USD ?? '') : String(info.EUR ?? ''))
        }
      } else if (!rateTouched) {
        setUsdRate(''); setRate('')   // bulunamadı → boş, elle girilecek (bugünün kuru KONMAZ)
      }
    })
    return () => { cancel = true }
  }, [paidAt]) // eslint-disable-line react-hooks/exhaustive-deps

  function onCurrency(v: string | null) {
    const c = v || 'TRY'; setCurrency(c); setRateTouched(false)
    if (rateInfo?.found) {
      setUsdRate(rateInfo.USD ? String(rateInfo.USD) : '')
      setRate(c === 'TRY' ? '' : c === 'USD' ? String(rateInfo.USD ?? '') : String(rateInfo.EUR ?? ''))
    } else { setRate(''); setUsdRate('') }
  }

  const effRate = currency === 'TRY' ? 1 : (parseDecimal(rate) ?? 0)          // currency → TRY
  const effUsd = currency === 'USD' ? effRate : (parseDecimal(usdRate) ?? 0)  // USD → TRY (karşılık)
  const amt = parseDecimal(amount) ?? 0
  const preview = useMemo(() => {
    if (!amt || !effRate) return null
    const tl = Math.round(amt * effRate * 100) / 100
    return { tl, usd: effUsd > 0 ? Math.round((tl / effUsd) * 100) / 100 : null }
  }, [amt, effRate, effUsd])

  const rateNote = loadingRate ? 'Kur alınıyor…'
    : rateInfo?.found && rateInfo.bulletinDate === paidAt ? `TCMB ${fmtTr(paidAt)} kuru`
    : rateInfo?.found ? `${fmtTr(paidAt)} kuru kullanıldı (TCMB ${fmtTr(rateInfo.bulletinDate!)} yayını)`
    : rateInfo && !rateInfo.serviceOk ? 'Kur servisine ulaşılamadı — elle girin.'
    : 'Bu tarih için TCMB kuru bulunamadı — elle girin.'
  const badRate = !loadingRate && !rateInfo?.found
  const needUsdField = currency !== 'USD' && !(rateInfo?.found && rateInfo.USD)

  async function submit() {
    if (!cust) { toast.error('Müşteri seçin.'); return }
    if (!amt || amt <= 0) { toast.error('Geçerli bir tutar girin.'); return }
    if (currency !== 'TRY' && (!effRate || effRate <= 0)) { toast.error('Kur girin.'); return }
    if (!effUsd || effUsd <= 0) { toast.error('USD kuru gerekli (ödeme tarihini kontrol edin ya da elle girin).'); return }
    try {
      await create.mutateAsync({
        customer_id: Number(cust),
        operation_id: operationId ?? null,
        order_id: orderId ?? null,
        amount: amt,
        currency,
        exchange_rate: currency === 'TRY' ? 1 : effRate,
        usd_rate: effUsd,
        paid_at: paidAt,
        payment_method_id: methodId ? Number(methodId) : null,
        bank_account_id: bankId ? Number(bankId) : null,
        reference_no: ref || null,
        is_advance: isAdvance,
        note: note || null,
      })
      toast.success('Ödeme kaydedildi.')
      onSaved?.(); onClose()
    } catch (e) {
      toast.error(await toUserMessage(e))
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="size-4" /> Ödeme ekle</DialogTitle>
          <DialogDescription>Gelen tahsilat kaydı. Kur ödeme günü TCMB değeriyle donar, sonradan değişmez.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <Label className="text-sm">Müşteri</Label>
            <SearchableSelect className="mt-1" options={customers.data ?? []} value={cust} onChange={setCust}
              disabled={!!customerId} placeholder="Müşteri seç" searchPlaceholder="Firma / kod ara…" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <Label className="text-sm">Tutar</Label>
              <Input className="mt-1" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </div>
            <div className="col-span-1">
              <Label className="text-sm">Para birimi</Label>
              <SearchableSelect className="mt-1" options={CCY} value={currency} onChange={onCurrency} />
            </div>
            <div className="col-span-1">
              <Label className="text-sm">Tarih</Label>
              <Input className="mt-1" type="date" value={paidAt} max={new Date().toISOString().slice(0, 10)} onChange={(e) => { setPaidAt(e.target.value); setRateTouched(false) }} />
            </div>
          </div>

          {/* Kur — ödeme günü TCMB; not bülten tarihini gösterir */}
          {(currency !== 'TRY' || needUsdField) && (
            <div className="grid grid-cols-2 gap-3">
              {currency !== 'TRY' && (
                <div>
                  <Label className="text-sm">Kur (1 {currency} = ? ₺)</Label>
                  <Input className="mt-1" type="text" inputMode="decimal"
                    value={rate} onChange={(e) => { setRate(e.target.value); setRateTouched(true) }} placeholder="Kur" />
                </div>
              )}
              {needUsdField && (
                <div>
                  <Label className="text-sm">USD kuru (1$ = ? ₺)</Label>
                  <Input className="mt-1" type="text" inputMode="decimal"
                    value={usdRate} onChange={(e) => { setUsdRate(e.target.value); setRateTouched(true) }} placeholder="USD→TRY" />
                </div>
              )}
            </div>
          )}
          <p className={`text-xs ${badRate ? 'text-warning-foreground' : 'text-text-muted'}`}>{rateNote}</p>

          {preview && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              Karşılık: <strong>{formatMoney(preview.tl, 'TRY')}</strong>
              {preview.usd != null && <> · <strong>{formatMoney(preview.usd, 'USD')}</strong></>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Ödeme yöntemi</Label>
              <SearchableSelect className="mt-1" clearable options={(methods.data ?? []).map((m) => ({ value: String(m.id), label: m.label }))} value={methodId} onChange={setMethodId} placeholder="Seç" />
            </div>
            <div>
              <Label className="text-sm">Banka hesabı</Label>
              <SearchableSelect className="mt-1" clearable
                options={(banks.data ?? []).map((b) => ({ value: String(b.id), label: `${b.bank_name}${b.currency ? ` · ${b.currency}` : ''}`, keywords: b.iban ?? '' }))}
                value={bankId} onChange={setBankId} placeholder={banks.data?.length ? 'Seç' : 'Hesap yok (Ayarlar)'} />
            </div>
          </div>

          <div className="grid grid-cols-2 items-end gap-3">
            <div>
              <Label className="text-sm">Referans no</Label>
              <Input className="mt-1" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Dekont / havale no" />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <Checkbox checked={isAdvance} onCheckedChange={(v) => setIsAdvance(!!v)} /> Ön ödeme
            </label>
          </div>

          <div>
            <Label className="text-sm">Not</Label>
            <Textarea className="mt-1" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Açıklama (opsiyonel)" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button onClick={() => void submit()} disabled={create.isPending || loadingRate}>
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />} Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
