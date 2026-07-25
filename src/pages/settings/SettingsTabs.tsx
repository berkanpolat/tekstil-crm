import { useState, type ReactNode } from 'react'
import { History, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { FormField } from '@/components/shared/FormField'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SettingHistoryDialog } from '@/components/settings/SettingHistoryDialog'
import { useSettings, useSaveSettings, type SettingRow } from '@/hooks/useSettings'
import type { Json } from '@/lib/database.types'

type SettingsMap = Record<string, SettingRow>

const asStr = (s: SettingsMap, k: string) => (typeof s[k]?.value === 'string' ? (s[k].value as string) : '')
const asNum = (s: SettingsMap, k: string) => (typeof s[k]?.value === 'number' ? (s[k].value as number) : 0)
const asBool = (s: SettingsMap, k: string) => s[k]?.value === true
const asArr = (s: SettingsMap, k: string) => (Array.isArray(s[k]?.value) ? (s[k].value as Json[]) : [])

/** Geçmiş butonu — bir ayarın değişiklik geçmişini açar. */
function HistoryBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-text-muted hover:text-foreground inline-flex items-center gap-1 text-xs"
    >
      <History className="size-3.5" /> Geçmiş
    </button>
  )
}

function SettingsShell({
  title,
  description,
  loading,
  children,
}: {
  title: string
  description: string
  loading: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-5">
      <PageHeader title={title} description={description} />
      <div className="bg-card max-w-2xl rounded-lg border p-5 shadow-card">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

// ============================ Şirket Bilgileri ============================
const COMPANY_FIELDS: { key: string; label: string }[] = [
  { key: 'company.name', label: 'Şirket adı' },
  { key: 'company.legal_name', label: 'Yasal unvan' },
  { key: 'company.tax_office', label: 'Vergi dairesi' },
  { key: 'company.tax_number', label: 'Vergi numarası' },
  { key: 'company.address', label: 'Adres' },
  { key: 'company.phone', label: 'Telefon' },
  { key: 'company.whatsapp', label: 'WhatsApp' },
  { key: 'company.email', label: 'E-posta' },
  { key: 'company.website', label: 'Web sitesi' },
]

export function CompanySettings() {
  const { data, isLoading } = useSettings()
  return (
    <SettingsShell title="Şirket Bilgileri" description="Belgelerde ve iletişimde kullanılacak şirket bilgileri." loading={isLoading || !data}>
      {data && <CompanyForm key="c" settings={data} />}
    </SettingsShell>
  )
}

function CompanyForm({ settings }: { settings: SettingsMap }) {
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(COMPANY_FIELDS.map((f) => [f.key, asStr(settings, f.key)])),
  )
  const [histKey, setHistKey] = useState<string | null>(null)
  const save = useSaveSettings()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const updates = COMPANY_FIELDS.filter((f) => form[f.key] !== asStr(settings, f.key)).map((f) => ({
      key: f.key,
      value: form[f.key] as Json,
    }))
    if (updates.length === 0) return toast.info('Değişiklik yok.')
    try {
      await save.mutateAsync(updates)
      toast.success('Şirket bilgileri kaydedildi.')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {COMPANY_FIELDS.map((f) => (
          <FormField
            key={f.key}
            label={f.label}
            labelAction={<HistoryBtn onClick={() => setHistKey(f.key)} />}
          >
            {(p) => (
              <Input
                {...p}
                value={form[f.key] ?? ''}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
              />
            )}
          </FormField>
        ))}
      </div>
      <SaveRow saving={save.isPending} />
      <SettingHistoryDialog settingKey={histKey} onClose={() => setHistKey(null)} />
    </form>
  )
}

// ============================ Güvenlik ============================
export function SecuritySettings() {
  const { data, isLoading } = useSettings()
  return (
    <SettingsShell title="Güvenlik" description="Kimlik ve oturum güvenliği ayarları." loading={isLoading || !data}>
      {data && <SecurityForm key="s" settings={data} />}
    </SettingsShell>
  )
}

function SecurityForm({ settings }: { settings: SettingsMap }) {
  const [domains, setDomains] = useState(() => (asArr(settings, 'auth.allowed_email_domains') as string[]).join(', '))
  const [timeout, setTimeout] = useState(() => String(asNum(settings, 'auth.session_timeout_minutes')))
  const [histKey, setHistKey] = useState<string | null>(null)
  const save = useSaveSettings()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const domainArr = domains
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean)
    try {
      await save.mutateAsync([
        { key: 'auth.allowed_email_domains', value: domainArr },
        { key: 'auth.session_timeout_minutes', value: Number(timeout) || 0 },
      ])
      toast.success('Güvenlik ayarları kaydedildi.')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField
        label="İzinli e-posta alan adları"
        hint="Virgülle ayırın. Boş bırakılırsa kısıt yok (herhangi bir alan adı kabul edilir)."
        labelAction={<HistoryBtn onClick={() => setHistKey('auth.allowed_email_domains')} />}
      >
        {(p) => <Input {...p} value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="tekstilas.com, ornek.com" />}
      </FormField>
      <FormField
        label="Oturum zaman aşımı (dakika)"
        labelAction={<HistoryBtn onClick={() => setHistKey('auth.session_timeout_minutes')} />}
      >
        {(p) => <Input {...p} type="number" value={timeout} onChange={(e) => setTimeout(e.target.value)} />}
      </FormField>
      <SaveRow saving={save.isPending} />
      <SettingHistoryDialog settingKey={histKey} onClose={() => setHistKey(null)} />
    </form>
  )
}

// ============================ Çalışma Düzeni ============================
const DAYS = [
  { n: 1, label: 'Pzt' },
  { n: 2, label: 'Sal' },
  { n: 3, label: 'Çar' },
  { n: 4, label: 'Per' },
  { n: 5, label: 'Cum' },
  { n: 6, label: 'Cmt' },
  { n: 7, label: 'Paz' },
]

export function WorkingHoursSettings() {
  const { data, isLoading } = useSettings()
  return (
    <SettingsShell title="Çalışma Düzeni" description="Çalışma günleri ve mesai saatleri (iş günü hesaplarında kullanılır)." loading={isLoading || !data}>
      {data && <WorkingHoursForm key="w" settings={data} />}
    </SettingsShell>
  )
}

function WorkingHoursForm({ settings }: { settings: SettingsMap }) {
  const [days, setDays] = useState<number[]>(() => (asArr(settings, 'working_hours.days') as number[]) ?? [])
  const [start, setStart] = useState(() => asStr(settings, 'working_hours.start'))
  const [end, setEnd] = useState(() => asStr(settings, 'working_hours.end'))
  const [histKey, setHistKey] = useState<string | null>(null)
  const save = useSaveSettings()

  const toggleDay = (n: number) => setDays((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort()))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await save.mutateAsync([
        { key: 'working_hours.days', value: days },
        { key: 'working_hours.start', value: start },
        { key: 'working_hours.end', value: end },
      ])
      toast.success('Çalışma düzeni kaydedildi.')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField label="Çalışma günleri" labelAction={<HistoryBtn onClick={() => setHistKey('working_hours.days')} />}>
        {() => (
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d) => (
              <button
                key={d.n}
                type="button"
                onClick={() => toggleDay(d.n)}
                className={
                  days.includes(d.n)
                    ? 'bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm'
                    : 'bg-muted text-text-secondary rounded-md px-3 py-1.5 text-sm'
                }
              >
                {d.label}
              </button>
            ))}
          </div>
        )}
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Mesai başlangıcı" labelAction={<HistoryBtn onClick={() => setHistKey('working_hours.start')} />}>
          {(p) => <Input {...p} type="time" value={start} onChange={(e) => setStart(e.target.value)} />}
        </FormField>
        <FormField label="Mesai bitişi" labelAction={<HistoryBtn onClick={() => setHistKey('working_hours.end')} />}>
          {(p) => <Input {...p} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}
        </FormField>
      </div>
      <SaveRow saving={save.isPending} />
      <SettingHistoryDialog settingKey={histKey} onClose={() => setHistKey(null)} />
    </form>
  )
}

// ============================ Sistem ============================
export function SystemSettings() {
  const { data, isLoading } = useSettings()
  return (
    <SettingsShell title="Sistem" description="Kod üreteci, saat dilimi ve test modu." loading={isLoading || !data}>
      {data && <SystemForm key="sys" settings={data} />}
    </SettingsShell>
  )
}

function SystemForm({ settings }: { settings: SettingsMap }) {
  const [prefix, setPrefix] = useState(() => asStr(settings, 'codes.operation_prefix'))
  const [length, setLength] = useState(() => String(asNum(settings, 'codes.length')))
  const [timezone, setTimezone] = useState(() => asStr(settings, 'system.timezone'))
  const [testMode, setTestMode] = useState(() => asBool(settings, 'system.test_mode'))
  const [histKey, setHistKey] = useState<string | null>(null)
  const save = useSaveSettings()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await save.mutateAsync([
        { key: 'codes.operation_prefix', value: prefix.trim().toUpperCase() },
        { key: 'codes.length', value: Number(length) || 6 },
        { key: 'system.timezone', value: timezone },
        { key: 'system.test_mode', value: testMode },
      ])
      toast.success('Sistem ayarları kaydedildi.')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Operasyon kodu öneki" labelAction={<HistoryBtn onClick={() => setHistKey('codes.operation_prefix')} />}>
          {(p) => <Input {...p} value={prefix} onChange={(e) => setPrefix(e.target.value)} />}
        </FormField>
        <FormField
          label="Kod uzunluğu"
          hint="Alan dolunca artırın (ör. 6 → 7)."
          labelAction={<HistoryBtn onClick={() => setHistKey('codes.length')} />}
        >
          {(p) => <Input {...p} type="number" value={length} onChange={(e) => setLength(e.target.value)} />}
        </FormField>
      </div>
      <FormField label="Saat dilimi" labelAction={<HistoryBtn onClick={() => setHistKey('system.timezone')} />}>
        {(p) => <Input {...p} value={timezone} onChange={(e) => setTimezone(e.target.value)} />}
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={testMode} onCheckedChange={(c) => setTestMode(!!c)} />
        Test modu (Faz 2'de gerçek müşterilere mesaj gönderimini engeller)
        <HistoryBtn onClick={() => setHistKey('system.test_mode')} />
      </label>
      <SaveRow saving={save.isPending} />
      <SettingHistoryDialog settingKey={histKey} onClose={() => setHistKey(null)} />
    </form>
  )
}

function SaveRow({ saving }: { saving: boolean }) {
  return (
    <div className="flex justify-end border-t pt-4">
      <Button type="submit" disabled={saving}>
        {saving && <Loader2 className="size-4 animate-spin" />}
        Kaydet
      </Button>
    </div>
  )
}
