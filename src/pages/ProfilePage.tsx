import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Camera } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'
import { PageHeader } from '@/components/shared/PageHeader'
import { FormField } from '@/components/shared/FormField'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { getSoundPref, setSoundPref, playNotificationSound } from '@/lib/notificationSound'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useUploadFile, getSignedUrl, type FileBucket } from '@/hooks/useFiles'
import { ensureRows, toUserMessage } from '@/lib/errors'

function useAvatarUrl(avatarFileId: number | null) {
  return useQuery({
    queryKey: ['avatar-url', avatarFileId],
    enabled: !!avatarFileId,
    queryFn: async () => {
      const { data } = await supabase
        .from('files')
        .select('bucket, storage_path')
        .eq('id', avatarFileId as number)
        .maybeSingle()
      if (!data) return null
      return getSignedUrl(data.bucket as FileBucket, data.storage_path, 3600)
    },
  })
}

export function ProfilePage() {
  const { data: me, isLoading } = useCurrentUser()
  const avatar = useAvatarUrl(me?.avatar_file_id ?? null)
  const upload = useUploadFile()
  const fileRef = useRef<HTMLInputElement>(null)

  const initials = (me?.full_name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  async function onAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !me) return
    try {
      const row = await upload.mutateAsync({ file, bucket: 'avatars', category: 'avatar' })
      ensureRows(await supabase.from('users').update({ avatar_file_id: row.id }).eq('id', me.id).select('id'))
      await queryClient.invalidateQueries({ queryKey: ['current-user'] })
      await queryClient.invalidateQueries({ queryKey: ['avatar-url'] })
      toast.success('Avatar güncellendi.')
    } catch (err) {
      toast.error(`Avatar yüklenemedi: ${await toUserMessage(err)}`)
    }
  }

  if (isLoading || !me) {
    return (
      <div className="space-y-5">
        <PageHeader title="Profilim" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Profilim" description="Kişisel bilgilerinizi ve şifrenizi yönetin." />

      {/* Avatar */}
      <div className="bg-card flex items-center gap-4 rounded-lg border p-5 shadow-card">
        <div className="relative">
          {avatar.data ? (
            <img src={avatar.data} alt="" className="size-16 rounded-full object-cover" />
          ) : (
            <span className="bg-accent-primary flex size-16 items-center justify-center rounded-full text-lg font-semibold text-white">
              {initials || '?'}
            </span>
          )}
        </div>
        <div className="flex-1">
          <p className="font-medium text-foreground">{me.full_name}</p>
          <p className="text-text-secondary text-sm">{me.email}</p>
        </div>
        <Button type="button" variant="outline" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
          {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          Avatar değiştir
        </Button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatarPick} />
      </div>

      <ProfileInfoForm key={me.id} me={me} />
      <SoundPrefCard />
      <PasswordForm />
    </div>
  )
}

/** B.5 — Bildirim sesi tercihi (aç/kapa + hangi şiddetten itibaren). Kullanıcıya özel. */
function SoundPrefCard() {
  const [pref, setPref] = useState(getSoundPref())
  const update = (p: Partial<typeof pref>) => { const next = { ...pref, ...p }; setPref(next); setSoundPref(next) }
  return (
    <div className="bg-card space-y-3 rounded-lg border p-5 shadow-card">
      <h3 className="font-semibold text-foreground">Bildirim sesi</h3>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={pref.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
        Yeni bildirimde ses çal
      </label>
      {pref.enabled && (
        <div className="max-w-xs">
          <label className="text-xs text-text-muted">Hangi önemden itibaren?</label>
          <SearchableSelect className="mt-1"
            options={[{ value: 'info', label: 'Tümü (bilgi dahil)' }, { value: 'warning', label: 'Uyarı ve üstü' }, { value: 'critical', label: 'Yalnızca kritik' }]}
            value={pref.minSeverity} onChange={(v) => update({ minSeverity: (v as 'info' | 'warning' | 'critical') ?? 'info' })} />
        </div>
      )}
      <button type="button" onClick={() => playNotificationSound(pref.minSeverity === 'critical' ? 'critical' : 'info')}
        className="text-xs text-primary hover:underline">Sesi dene</button>
    </div>
  )
}

function ProfileInfoForm({ me }: { me: { id: string; full_name: string; phone: string | null } }) {
  const [fullName, setFullName] = useState(me.full_name)
  const [phone, setPhone] = useState(me.phone ?? '')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      ensureRows(
        await supabase
          .from('users')
          .update({ full_name: fullName.trim(), phone: phone.trim() || null })
          .eq('id', me.id)
          .select('id'),
      )
      await queryClient.invalidateQueries({ queryKey: ['current-user'] })
      toast.success('Bilgiler güncellendi.')
    } catch (err) {
      toast.error(await toUserMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-card space-y-4 rounded-lg border p-5 shadow-card">
      <h3 className="font-semibold text-foreground">Bilgilerim</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Ad soyad" required>
          {(p) => <Input {...p} value={fullName} onChange={(e) => setFullName(e.target.value)} required />}
        </FormField>
        <FormField label="Telefon">
          {(p) => <Input {...p} value={phone} onChange={(e) => setPhone(e.target.value)} />}
        </FormField>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Kaydet
        </Button>
      </div>
    </form>
  )
}

function PasswordForm() {
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const mismatch = pw2.length > 0 && pw1 !== pw2
  const tooShort = pw1.length > 0 && pw1.length < 8

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pw1.length < 8 || pw1 !== pw2) return
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    setBusy(false)
    if (error) return void toast.error(await toUserMessage(error))
    setPw1('')
    setPw2('')
    toast.success('Şifreniz güncellendi.')
  }

  return (
    <form onSubmit={submit} className="bg-card space-y-4 rounded-lg border p-5 shadow-card">
      <h3 className="font-semibold text-foreground">Şifre değiştir</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Yeni şifre" error={tooShort ? 'En az 8 karakter.' : undefined}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={pw1} onChange={(e) => setPw1(e.target.value)} />}
        </FormField>
        <FormField label="Yeni şifre (tekrar)" error={mismatch ? 'Şifreler eşleşmiyor.' : undefined}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />}
        </FormField>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || !pw1 || mismatch || tooShort}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Şifreyi güncelle
        </Button>
      </div>
    </form>
  )
}
