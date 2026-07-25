import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, MailCheck } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { AuthShell } from '@/components/auth/AuthShell'
import { FormField } from '@/components/shared/FormField'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    // Kullanıcının KENDİ isteğiyle sıfırlama — service_role gerekmez, frontend'de.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/sifre-degistir`,
    })
    setBusy(false)
    // Bilgi sızdırmamak için e-posta var/yok fark etmeksizin aynı sonucu göster.
    if (error) toast.error('İşlem tamamlanamadı, lütfen tekrar deneyin.')
    else setSent(true)
  }

  if (sent) {
    return (
      <AuthShell title="E-postanızı kontrol edin">
        <div className="flex flex-col items-center gap-3 text-center">
          <MailCheck className="text-success-foreground size-8" />
          <p className="text-sm text-text-secondary">
            Eğer bu e-posta kayıtlıysa, şifre sıfırlama bağlantısı gönderildi.
          </p>
          <Link to="/giris" className="text-primary text-sm hover:underline">
            Girişe dön
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Şifremi unuttum" description="E-posta adresinize sıfırlama bağlantısı gönderelim.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="E-posta">
          {(p) => (
            <Input
              {...p}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ad@sirket.com"
              required
            />
          )}
        </FormField>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Bağlantı gönder
        </Button>
        <div className="text-center">
          <Link to="/giris" className="text-primary text-sm hover:underline">
            Girişe dön
          </Link>
        </div>
      </form>
    </AuthShell>
  )
}
