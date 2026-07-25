import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useCurrentUser } from '@/hooks/useCurrentUser'

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

/** Zaten giriş yapılmışsa (public sayfalarda) panele yönlendirir. */
export function RedirectIfAuthed() {
  const { session, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (session) return <Navigate to="/" replace />
  return <Outlet />
}
