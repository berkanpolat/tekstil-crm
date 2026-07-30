import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Plus, Building2, CreditCard } from 'lucide-react'
import { toUserMessage } from '@/lib/errors'
import { PageHeader } from '@/components/shared/PageHeader'
import { FormField } from '@/components/shared/FormField'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { useSettings, useSaveSettings, type SettingRow } from '@/hooks/useSettings'
import { useBankAccounts, useSaveBankAccount, usePaymentMethods, useSavePaymentMethod } from '@/hooks/useFinance'
import type { Json } from '@/lib/database.types'

const CCY = [{ value: 'TRY', label: 'TRY' }, { value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' }]

/** P5.2/P5.3 — Ayarlar → Finans: banka hesapları, ödeme yöntemleri, ön ödeme oranı. */
export function FinanceSettings() {
  const { data: settings, isLoading } = useSettings()
  if (isLoading || !settings) return <div className="space-y-4"><PageHeader title="Finans" description="Banka hesapları ve ödeme." /><Skeleton className="h-64 w-full" /></div>
  return <Body settings={settings} />
}

function Body({ settings }: { settings: Record<string, SettingRow> }) {
  const banks = useBankAccounts(false)
  const saveBank = useSaveBankAccount()
  const methods = usePaymentMethods(false)
  const saveMethod = useSavePaymentMethod()
  const saveSettings = useSaveSettings()

  const advKey = 'finance.advance_payment_percent'
  const initAdv = settings[advKey]?.value == null ? '50' : String(settings[advKey]!.value)
  const [adv, setAdv] = useState(initAdv)

  // yeni banka hesabı formu
  const [nb, setNb] = useState({ bank_name: '', account_name: '', iban: '', currency: 'TRY' })
  const [nm, setNm] = useState('')

  async function addBank() {
    if (!nb.bank_name.trim()) { toast.error('Banka adı zorunlu.'); return }
    try {
      await saveBank.mutateAsync({ bank_name: nb.bank_name.trim(), account_name: nb.account_name.trim() || null, iban: nb.iban.trim() || null, currency: nb.currency, sort_order: (banks.data?.length ?? 0) + 1 })
      setNb({ bank_name: '', account_name: '', iban: '', currency: 'TRY' }); toast.success('Hesap eklendi.')
    } catch (e) { toast.error(await toUserMessage(e)) }
  }
  async function toggleBank(id: number, is_active: boolean) {
    try { await saveBank.mutateAsync({ id, bank_name: banks.data!.find((b) => b.id === id)!.bank_name, is_active }) } catch (e) { toast.error(await toUserMessage(e)) }
  }
  async function addMethod() {
    if (!nm.trim()) { toast.error('Yöntem adı zorunlu.'); return }
    try { await saveMethod.mutateAsync({ label: nm.trim(), sort_order: (methods.data?.length ?? 0) + 1 }); setNm(''); toast.success('Yöntem eklendi.') }
    catch (e) { toast.error(await toUserMessage(e)) }
  }
  async function toggleMethod(id: number, is_active: boolean) {
    try { await saveMethod.mutateAsync({ id, label: methods.data!.find((m) => m.id === id)!.label, is_active }) } catch (e) { toast.error(await toUserMessage(e)) }
  }
  async function saveAdv() {
    try { await saveSettings.mutateAsync([{ key: advKey, value: Number(adv) as Json }]); toast.success('Kaydedildi.') }
    catch (e) { toast.error(await toUserMessage(e)) }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Finans" description="Banka hesapları, ödeme yöntemleri ve ön ödeme oranı." />

      {/* Ön ödeme oranı */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-1 text-sm font-semibold">Ön ödeme oranı</h3>
        <p className="mb-3 text-xs text-text-muted">Üretime geçerken beklenen ön ödeme yüzdesi. Yetersizse sistem uyarır ama engellemez (gerekçe istenir).</p>
        <div className="flex items-end gap-3">
          <FormField label="Ön ödeme (%)" className="w-40">
            {(p) => <Input {...p} inputMode="decimal" value={adv} onChange={(e) => setAdv(e.target.value.replace(/[^0-9.]/g, ''))} />}
          </FormField>
          <Button onClick={() => void saveAdv()} disabled={saveSettings.isPending}>{saveSettings.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Kaydet</Button>
        </div>
      </div>

      {/* Banka hesapları */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Building2 className="size-4" /> Banka hesapları</h3>
        <div className="space-y-2">
          {(banks.data ?? []).map((b) => (
            <div key={b.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
              <div className="flex-1">
                <div className="font-medium">{b.bank_name} <span className="text-text-muted">· {b.currency}</span></div>
                <div className="text-xs text-text-muted">{[b.account_name, b.iban].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-text-muted"><Checkbox checked={b.is_active} onCheckedChange={(v) => void toggleBank(b.id, !!v)} /> Aktif</label>
            </div>
          ))}
          {(banks.data?.length ?? 0) === 0 && <p className="text-sm text-text-muted">Henüz hesap yok. Aşağıdan ekleyin.</p>}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-5">
          <Input placeholder="Banka adı" value={nb.bank_name} onChange={(e) => setNb((s) => ({ ...s, bank_name: e.target.value }))} />
          <Input placeholder="Hesap adı" value={nb.account_name} onChange={(e) => setNb((s) => ({ ...s, account_name: e.target.value }))} />
          <Input placeholder="IBAN" value={nb.iban} onChange={(e) => setNb((s) => ({ ...s, iban: e.target.value }))} className="sm:col-span-2" />
          <SearchableSelect options={CCY} value={nb.currency} onChange={(v) => setNb((s) => ({ ...s, currency: v || 'TRY' }))} />
        </div>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => void addBank()} disabled={saveBank.isPending}><Plus className="size-3.5" /> Hesap ekle</Button>
      </div>

      {/* Ödeme yöntemleri */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><CreditCard className="size-4" /> Ödeme yöntemleri</h3>
        <div className="space-y-2">
          {(methods.data ?? []).map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
              <span className="flex-1 font-medium">{m.label}</span>
              <label className="flex items-center gap-1.5 text-xs text-text-muted"><Checkbox checked={m.is_active} onCheckedChange={(v) => void toggleMethod(m.id, !!v)} /> Aktif</label>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input placeholder="Yeni yöntem adı" value={nm} onChange={(e) => setNm(e.target.value)} className="max-w-xs" />
          <Button size="sm" variant="outline" onClick={() => void addMethod()} disabled={saveMethod.isPending}><Plus className="size-3.5" /> Ekle</Button>
        </div>
      </div>
    </div>
  )
}
