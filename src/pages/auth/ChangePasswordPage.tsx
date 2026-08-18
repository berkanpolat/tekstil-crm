import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'
import { useAuth } from '@/lib/auth'
import { ensureRows } from '@/lib/errors'
import type { CurrentUser } from '@/hooks/useCurrentUser'
import { AuthShell } from '@/components/auth/AuthShell'
import { FormField } from '@/components/shared/FormField'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { passwordError } from '@/lib/password'

/**
 * İlk girişte zorunlu şifre değiştirme (must_change_password) ve sıfırlama
 * bağlantısından gelen değiştirme. Yeni şifre kaydedilince must_change_password
 * kapatılır.
 */
export function ChangePasswordPage() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)

  const mismatch = pw2.length > 0 && pw1 !== pw2
  const pwErr = pw1.length > 0 ? passwordError(pw1) : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (passwordError(pw1) || pw1 !== pw2) return
    setBusy(true)
    const { error: pwError } = await supabase.auth.updateUser({ password: pw1 })
    if (pwError) {
      setBusy(false)
      toast.error('Şifre güncellenemedi. Lütfen tekrar deneyin.')
      return
    }
    // Zorunluluğu kaldır.
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      try {
        ensureRows(
          await supabase
            .from('users')
            .update({ must_change_password: false })
            .eq('id', user.id)
            .select('id'),
        )
      } catch {
        setBusy(false)
        toast.error('Şifre kaydedildi ancak durum güncellenemedi. Yöneticinize başvurun.')
        return
      }
    }
    // Cache'i DOĞRUDAN yamala: /sifre-degistir'de current-user sorgusu inaktif
    // olduğundan invalidate refetch etmez; guard bayat must_change=true okuyup
    // döngüye sokardı. setQueryData ile guard anında yeni değeri görür.
    queryClient.setQueryData<CurrentUser | null>(['current-user'], (old) =>
      old ? { ...old, must_change_password: false } : old,
    )
    void queryClient.invalidateQueries({ queryKey: ['current-user'] })
    setBusy(false)
    toast.success('Şifreniz güncellendi.')
    navigate('/', { replace: true })
  }

  return (
    <AuthShell title="Şifrenizi belirleyin" description="Devam etmek için yeni bir şifre oluşturun.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Yeni şifre" required error={pwErr ?? undefined}>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="new-password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              required
            />
          )}
        </FormField>
        <FormField label="Yeni şifre (tekrar)" required error={mismatch ? 'Şifreler eşleşmiyor.' : undefined}>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="new-password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              required
            />
          )}
        </FormField>
        <Button type="submit" className="w-full" disabled={busy || mismatch || !!pwErr || !pw1}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Şifreyi kaydet
        </Button>
        <div className="text-center">
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-text-secondary text-sm hover:underline"
          >
            Çıkış yap
          </button>
        </div>
      </form>
    </AuthShell>
  )
}
