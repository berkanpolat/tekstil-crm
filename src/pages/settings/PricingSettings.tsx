import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Plus, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toUserMessage } from '@/lib/errors'
import { PageHeader } from '@/components/shared/PageHeader'
import { FormField } from '@/components/shared/FormField'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSettings, useSaveSettings, type SettingRow } from '@/hooks/useSettings'
import { useMarginTiers } from '@/hooks/useCatalog'
import type { Json } from '@/lib/database.types'
import { parseDecimal } from '@/lib/money'

const NUM: { key: string; label: string; hint: string }[] = [
  { key: 'pricing.default_margin_percent', label: 'Varsayılan marj (%)', hint: 'Kademe bulunamazsa.' },
  { key: 'pricing.safety_margin_percent', label: 'Kur güvenlik payı (%)', hint: 'Efektif kur = TCMB × (1+pay/100). Vars. 0.' },
  { key: 'pricing.rate_refresh_hours', label: 'Kur tazeleme (saat)', hint: 'Bu yaştan sonra arka planda tazelenir.' },
  { key: 'pricing.rate_block_hours', label: 'Kur engel eşiği (saat)', hint: 'Bu yaştan sonra teklif engellenir.' },
  { key: 'pricing.margin_erosion_percent', label: 'Marj erimesi eşiği (%)', hint: 'Maliyet (USD) bu %’yi aşınca işaretlenir.' },
]
const asStr = (s: Record<string, SettingRow>, k: string) => { const v = s[k]?.value; return v == null ? '' : String(v) }

/** P4B.6 — Ayarlar → Fiyatlandırma: adet kademeleri + varsayılanlar + kur eşikleri. Owner/admin. */
export function PricingSettings() {
  const { data, isLoading } = useSettings()
  if (isLoading || !data) return <div className="space-y-4"><PageHeader title="Fiyatlandırma" description="Kademeler ve kur." /><Skeleton className="h-64 w-full" /></div>
  return <PricingForm settings={data} />
}

function PricingForm({ settings }: { settings: Record<string, SettingRow> }) {
  const qc = useQueryClient()
  const save = useSaveSettings()
  const tiers = useMarginTiers()
  const initial = useMemo(() => Object.fromEntries(NUM.map((f) => [f.key, asStr(settings, f.key)])), [settings])
  const [form, setForm] = useState<Record<string, string>>(initial)
  const [rows, setRows] = useState<{ min: string; margin: string }[]>([])
  const loaded = useRef(false)
  useEffect(() => {
    if (loaded.current || !tiers.data) return
    loaded.current = true
    setRows(tiers.data.map((t) => ({ min: String(t.min_quantity), margin: String(t.margin_percent) })))
  }, [tiers.data])

  async function saveSettings() {
    const updates: { key: string; value: Json }[] = []
    for (const f of NUM) if (form[f.key] !== initial[f.key]) updates.push({ key: f.key, value: (parseDecimal(form[f.key]) ?? 0) as Json })
    if (updates.length) await save.mutateAsync(updates)
  }
  async function saveTiers() {
    // basit: tümünü sil + yeniden ekle (kademe sayısı azdır)
    const valid = rows.map((r) => ({ min_quantity: parseInt(r.min, 10), margin_percent: parseDecimal(r.margin) ?? NaN })).filter((r) => r.min_quantity > 0 && Number.isFinite(r.margin_percent))
    await supabase.from('margin_tiers').delete().not('id', 'is', null)
    if (valid.length) await supabase.from('margin_tiers').insert(valid.map((v, i) => ({ ...v, sort_order: i + 1 })) as never)
    qc.invalidateQueries({ queryKey: ['margin-tiers'] })
  }
  async function submit() {
    try { await saveSettings(); await saveTiers(); toast.success('Fiyatlandırma kaydedildi.') }
    catch (err) { toast.error(await toUserMessage(err)) }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Fiyatlandırma" description="Adet kademeleri, varsayılan marj ve kur eşikleri." />

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Adet kademeleri (aralık mantığı)</h3>
          <Button size="sm" variant="outline" onClick={() => setRows((r) => [...r, { min: '', margin: '' }])}><Plus className="size-3.5" /> Kademe</Button>
        </div>
        <p className="mb-3 text-xs text-text-muted">min_quantity ≤ adet olan en büyük kademe geçerli. Ör. 50→%25, 200→%20, 500→%10.</p>
        <div className="space-y-2">
          {rows.sort((a, b) => (Number(a.min) || 0) - (Number(b.min) || 0)).map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1"><label className="text-xs text-text-muted">Min. adet</label><Input inputMode="numeric" value={r.min} onChange={(e) => setRows((s) => s.map((x, j) => j === i ? { ...x, min: e.target.value.replace(/\D/g, '') } : x))} className="mt-1" /></div>
              <div className="flex-1"><label className="text-xs text-text-muted">Marj (%)</label><Input inputMode="decimal" value={r.margin} onChange={(e) => setRows((s) => s.map((x, j) => j === i ? { ...x, margin: e.target.value.replace(/[^0-9.,]/g, '') } : x))} className="mt-1" /></div>
              <Button size="icon" variant="ghost" className="mt-5 size-8 text-destructive" onClick={() => setRows((s) => s.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold">Varsayılanlar ve kur</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {NUM.map((f) => (
            <FormField key={f.key} label={f.label} hint={f.hint}>
              {(p) => <Input {...p} inputMode="decimal" value={form[f.key] ?? ''} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value.replace(/[^0-9.,]/g, '') }))} />}
            </FormField>
          ))}
        </div>
      </div>

      <Button onClick={() => void submit()} disabled={save.isPending}>{save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Kaydet</Button>
    </div>
  )
}
