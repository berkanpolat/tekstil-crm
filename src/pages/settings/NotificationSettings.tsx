import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, AlertTriangle } from 'lucide-react'
import { toUserMessage } from '@/lib/errors'
import { PageHeader } from '@/components/shared/PageHeader'
import { FormField } from '@/components/shared/FormField'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { Skeleton } from '@/components/ui/skeleton'
import { useSettings, useSaveSettings, type SettingRow } from '@/hooks/useSettings'
import type { Json } from '@/lib/database.types'

const NUM_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: 'alerts.quote_due_hours', label: 'Teklif süresi (saat)', hint: 'Talep → teklif verme süresi.' },
  { key: 'alerts.result_due_hours', label: 'Sonuç süresi (saat)', hint: 'Teklif iletildi → sonuç girme süresi.' },
  { key: 'alerts.warn_at_percent', label: 'Yumuşak uyarı (%)', hint: 'İlk uyarı, sürenin bu %’sinde.' },
  { key: 'alerts.urgent_at_percent', label: 'Belirgin uyarı (%)', hint: 'İkinci uyarı, sürenin bu %’sinde.' },
  { key: 'alerts.escalate_after_hours', label: 'Yükseltme (saat)', hint: 'Süre dolduktan sonra yöneticiye.' },
  { key: 'alerts.check_interval_minutes', label: 'Kontrol sıklığı (dk)', hint: 'Arayüz uyarıları bu sıklıkta yoklar.' },
  { key: 'alerts.max_snooze_count', label: 'Azami erteleme', hint: 'Aşılınca yöneticiye yükseltilir.' },
  { key: 'alerts.delivery_warning_days', label: 'Termin uyarısı (gün)', hint: 'Teslim tarihine bu kadar gün kala.' },
]
const ROLES = [
  { value: 'operations', label: 'Operasyon' }, { value: 'sales', label: 'Satış' },
  { value: 'manager', label: 'Müdür' }, { value: 'admin', label: 'Yönetici' }, { value: 'owner', label: 'Sahip' },
]
const asStr = (s: Record<string, SettingRow>, k: string) => { const v = s[k]?.value; return v == null ? '' : String(v) }

/** B.6 — Bildirim ayarları: eşikler + sahipsiz (havuz) alıcı. Yalnızca owner/admin. */
export function NotificationSettings() {
  const { data, isLoading } = useSettings()
  if (isLoading || !data) return <div className="space-y-4"><PageHeader title="Bildirimler" description="Uyarı eşikleri ve alıcılar." /><Skeleton className="h-64 w-full" /></div>
  return <NotifForm settings={data} />
}

function NotifForm({ settings }: { settings: Record<string, SettingRow> }) {
  const save = useSaveSettings()
  const initial = useMemo(() => Object.fromEntries(NUM_FIELDS.map((f) => [f.key, asStr(settings, f.key)])), [settings])
  const [form, setForm] = useState<Record<string, string>>(initial)
  // pool_recipients → ilk 'rol' referansı (basit tek-rol seçici)
  const poolInit = useMemo(() => {
    try { const arr = JSON.parse(asStr(settings, 'alerts.pool_recipients') || '[]'); return arr.find((e: { type: string }) => e.type === 'rol')?.ref ?? null } catch { return null }
  }, [settings])
  const [poolRole, setPoolRole] = useState<string | null>(poolInit)

  async function submit() {
    const updates: { key: string; value: Json }[] = []
    for (const f of NUM_FIELDS) if (form[f.key] !== initial[f.key]) updates.push({ key: f.key, value: Number(form[f.key]) as Json })
    if (poolRole !== poolInit) updates.push({ key: 'alerts.pool_recipients', value: (poolRole ? [{ type: 'rol', ref: poolRole }] : []) as Json })
    if (!updates.length) { toast.info('Değişiklik yok.'); return }
    try { await save.mutateAsync(updates); toast.success('Bildirim ayarları kaydedildi.') } catch (err) { toast.error(await toUserMessage(err)) }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Bildirimler" description="Açık dosya uyarı eşikleri, kontrol sıklığı ve sahipsiz alıcı." />
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold">Eşikler</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {NUM_FIELDS.map((f) => (
            <FormField key={f.key} label={f.label} hint={f.hint}>
              {(p) => <Input {...p} inputMode="numeric" value={form[f.key] ?? ''} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value.replace(/[^0-9]/g, '') }))} />}
            </FormField>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-1 text-sm font-semibold">Sahipsiz (havuz) alıcı</h3>
        <p className="mb-3 text-xs text-text-muted">Sahipsiz açık dosyaların uyarıları bu role gider.</p>
        <div className="max-w-xs">
          <SearchableSelect options={ROLES} value={poolRole} onChange={setPoolRole} placeholder="Rol seçin" clearable />
        </div>
        {!poolRole && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-warning-foreground"><AlertTriangle className="size-3.5" /> Boş bırakılırsa sahipsiz dosyalar kimseye görünmez.</p>
        )}
      </div>

      <Button onClick={() => void submit()} disabled={save.isPending}>
        {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Kaydet
      </Button>
    </div>
  )
}
