import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Sparkles } from 'lucide-react'
import { toUserMessage } from '@/lib/errors'
import { PageHeader } from '@/components/shared/PageHeader'
import { FormField } from '@/components/shared/FormField'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useSettings, useSaveSettings, type SettingRow } from '@/hooks/useSettings'
import { useAiSpend } from '@/hooks/useAi'
import type { Json } from '@/lib/database.types'

const NUM: { key: string; label: string; hint: string }[] = [
  { key: 'ai.daily_call_limit', label: 'Günlük çağrı sınırı (adet)', hint: 'Genel; aşılırsa çağrı reddedilir.' },
  { key: 'ai.daily_cost_limit_usd', label: 'Günlük harcama sınırı ($)', hint: 'Aşılınca "günlük bütçe doldu".' },
  { key: 'ai.monthly_cost_limit_usd', label: 'Aylık harcama sınırı ($)', hint: '%80 aşımında yöneticiye uyarı.' },
  { key: 'ai.price_per_1m_input', label: 'Girdi fiyatı ($/1M token)', hint: 'Model fiyatı; değişebilir.' },
  { key: 'ai.price_per_1m_output', label: 'Çıktı fiyatı ($/1M token)', hint: 'Model fiyatı; değişebilir.' },
]
const asStr = (s: Record<string, SettingRow>, k: string) => { const v = s[k]?.value; return v == null ? '' : String(v) }
const usd = (n: number) => '$' + Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** P6.13 — Ayarlar → Yapay Zekâ: harcama (bugün/ay/özellik/kullanıcı) + sınır/fiyat düzenleme. owner/admin. */
export function AiSettings() {
  const { data: settings, isLoading } = useSettings()
  if (isLoading || !settings) return <div className="space-y-4"><PageHeader title="Yapay Zekâ" /><Skeleton className="h-64 w-full" /></div>
  return <Body settings={settings} />
}

function Body({ settings }: { settings: Record<string, SettingRow> }) {
  const spend = useAiSpend()
  const save = useSaveSettings()
  const model = asStr(settings, 'ai.model').replace(/"/g, '')
  const initial = useMemo(() => Object.fromEntries(NUM.map((f) => [f.key, asStr(settings, f.key)])), [settings])
  const [form, setForm] = useState<Record<string, string>>(initial)

  async function submit() {
    const updates = NUM.filter((f) => form[f.key] !== initial[f.key]).map((f) => ({ key: f.key, value: Number(form[f.key]) as Json }))
    if (!updates.length) { toast.info('Değişiklik yok.'); return }
    try { await save.mutateAsync(updates); toast.success('Kaydedildi.') } catch (e) { toast.error(await toUserMessage(e)) }
  }

  const s = spend.data
  const dayPct = s && s.daily_limit > 0 ? Math.min(100, Math.round((s.today_usd / s.daily_limit) * 100)) : 0
  const monPct = s && s.monthly_limit > 0 ? Math.min(100, Math.round((s.month_usd / s.monthly_limit) * 100)) : 0

  return (
    <div className="space-y-5">
      <PageHeader title="Yapay Zekâ" description="Harcama ve maliyet sınırları. Model claude-sonnet-4-6." />

      {/* Harcama özeti */}
      <div className="grid gap-3 sm:grid-cols-2">
        {[{ l: 'Bugünkü harcama', v: s?.today_usd ?? 0, lim: s?.daily_limit ?? 0, pct: dayPct },
          { l: 'Bu ayki harcama', v: s?.month_usd ?? 0, lim: s?.monthly_limit ?? 0, pct: monPct }].map((c) => (
          <div key={c.l} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-text-muted"><Sparkles className="size-4" /> {c.l}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">{usd(c.v)} <span className="text-sm font-normal text-text-muted">/ {usd(c.lim)}</span></div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', c.pct >= 80 ? 'bg-danger' : c.pct >= 60 ? 'bg-warning' : 'bg-success')} style={{ width: `${c.pct}%` }} /></div>
          </div>
        ))}
      </div>

      {/* Özellik + kullanıcı dağılımı */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">Özellik bazında (bu ay)</h3>
          {!s?.by_feature?.length ? <p className="text-sm text-text-muted">Kayıt yok.</p> : (
            <table className="w-full text-sm"><tbody>
              {s.by_feature.map((f) => (
                <tr key={f.feature} className="border-t border-border first:border-t-0">
                  <td className="py-1.5">{f.feature}</td><td className="py-1.5 text-right text-text-secondary">{f.calls} çağrı</td><td className="py-1.5 text-right font-medium tabular-nums">{usd(f.usd)}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">En çok kullananlar (bu ay)</h3>
          {!s?.top_users?.length ? <p className="text-sm text-text-muted">Kayıt yok.</p> : (
            <table className="w-full text-sm"><tbody>
              {s.top_users.map((u, i) => (
                <tr key={i} className="border-t border-border first:border-t-0">
                  <td className="py-1.5">{u.name}</td><td className="py-1.5 text-right text-text-secondary">{u.calls} çağrı</td><td className="py-1.5 text-right font-medium tabular-nums">{usd(u.usd)}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>

      {/* Sınır + fiyat düzenleme */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-1 text-sm font-semibold">Sınırlar ve fiyatlar</h3>
        <p className="mb-3 text-xs text-text-muted">Model: <b>{model || 'claude-sonnet-4-6'}</b>. Özellik-başı günlük sınır <code>ai.limits</code> ayarından (JSON) yönetilir.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {NUM.map((f) => (
            <FormField key={f.key} label={f.label} hint={f.hint}>
              {(p) => <Input {...p} inputMode="decimal" value={form[f.key] ?? ''} onChange={(e) => setForm((st) => ({ ...st, [f.key]: e.target.value.replace(/[^0-9.]/g, '') }))} />}
            </FormField>
          ))}
        </div>
        <Button className="mt-4" onClick={() => void submit()} disabled={save.isPending}>{save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Kaydet</Button>
      </div>
    </div>
  )
}
