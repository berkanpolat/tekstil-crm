import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { canManageUsers } from '@/lib/navigation'
import { NoAccessPage } from '@/pages/NoAccessPage'

function FullScreenLoader() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <Loader2 className="text-primary size-6 animate-spin" />
    </div>
  )
}

/** Oturum yoksa girişe yönlendirir. */
export function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to="/giris" replace state={{ from: location.pathname }} />
  return <Outlet />
}

/** must_change_password ise ilk-giriş şifre ekranına zorlar. */
export function RequirePasswordChanged() {
  const { data: user, isLoading } = useCurrentUser()
  if (isLoading) return <FullScreenLoader />
  if (user?.must_change_password) return <Navigate to="/sifre-degistir" replace />
  return <Outlet />
}

/**
 * Yalnızca owner/admin erişebilir (kullanıcı yönetimi = Faz 0'da geniş RLS'in
 * istisnası). Yetkisizse "erişim yok" ekranı (adres elle yazılsa da). GERÇEK
 * sınır RLS + Edge Function'da; bu görsel + yönlendirme katmanı.
 */
export function RequireManager() {
  const { data: user, isLoading } = useCurrentUser()
  if (isLoading) return <FullScreenLoader />
  if (!canManageUsers(user?.role_key)) return <NoAccessPage />
  return <Outlet />
}

/** Zaten giriş yapılmışsa (public sayfalarda) panele yönlendirir. */
export function RedirectIfAuthed() {
  const { session, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (session) return <Navigate to="/" replace />
  return <Outlet />
}
