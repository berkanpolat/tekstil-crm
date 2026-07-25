import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'
import { AuthShell } from '@/components/auth/AuthShell'
import { FormField } from '@/components/shared/FormField'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) {
      toast.error('Giriş yapılamadı. E-posta veya şifre hatalı.')
      return
    }
    await queryClient.invalidateQueries({ queryKey: ['current-user'] })
    const from = (location.state as { from?: string } | null)?.from
    navigate(from && from !== '/giris' ? from : '/', { replace: true })
  }

  return (
    <AuthShell title="Giriş yap" description="Hesabınızla oturum açın.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="E-posta">
          {(p) => (
            <Input
              {...p}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ad@sirket.com"
              required
            />
          )}
        </FormField>
        <FormField label="Şifre">
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}
        </FormField>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Giriş yap
        </Button>
        <div className="text-center">
          <Link to="/sifremi-unuttum" className="text-primary text-sm hover:underline">
            Şifremi unuttum
          </Link>
        </div>
      </form>
    </AuthShell>
  )
}
