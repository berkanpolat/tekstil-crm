import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { RequireAuth, RequirePasswordChanged, RedirectIfAuthed } from '@/components/auth/guards'
import { LoginPage } from '@/pages/auth/LoginPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ChangePasswordPage } from '@/pages/auth/ChangePasswordPage'
import { SettingsLayout, SettingsPlaceholder } from '@/pages/settings/SettingsLayout'
import { StaffListPage } from '@/pages/staff/StaffListPage'
import { NAV_ITEMS } from '@/lib/navigation'

/**
 * Faz 0 yönlendirme.
 *  - Public: giriş, şifremi unuttum (oturum varsa panele atar).
 *  - Korumalı: oturum + ilk-giriş şifre değiştirme guard'ları → AppShell.
 *  - Ayarlar bir hub'dır; çalışan yönetimi altında.
 */
export default function App() {
  return (
    <Routes>
      {/* Public kimlik ekranları */}
      <Route element={<RedirectIfAuthed />}>
        <Route path="/giris" element={<LoginPage />} />
        <Route path="/sifremi-unuttum" element={<ForgotPasswordPage />} />
      </Route>

      {/* Korumalı */}
      <Route element={<RequireAuth />}>
        <Route path="/sifre-degistir" element={<ChangePasswordPage />} />

        <Route element={<RequirePasswordChanged />}>
          <Route element={<AppShell />}>
            {NAV_ITEMS.filter((i) => i.path !== '/ayarlar').map((item) => (
              <Route key={item.path} path={item.path} element={<PlaceholderPage />} />
            ))}

            <Route path="/ayarlar" element={<SettingsLayout />}>
              <Route index element={<Navigate to="/ayarlar/calisanlar" replace />} />
              <Route path="calisanlar" element={<StaffListPage />} />
              <Route path="departmanlar" element={<SettingsPlaceholder title="Departmanlar" />} />
              <Route path="pozisyonlar" element={<SettingsPlaceholder title="Pozisyonlar" />} />
              <Route path="sirket" element={<SettingsPlaceholder title="Şirket Bilgileri" />} />
              <Route path="guvenlik" element={<SettingsPlaceholder title="Güvenlik" />} />
              <Route path="calisma-duzeni" element={<SettingsPlaceholder title="Çalışma Düzeni" />} />
              <Route path="sistem" element={<SettingsPlaceholder title="Sistem" />} />
            </Route>

            <Route path="*" element={<PlaceholderPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}
