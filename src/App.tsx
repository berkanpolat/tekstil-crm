import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import {
  RequireAuth,
  RequirePasswordChanged,
  RedirectIfAuthed,
  RequireManager,
} from '@/components/auth/guards'
import { LoginPage } from '@/pages/auth/LoginPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ChangePasswordPage } from '@/pages/auth/ChangePasswordPage'
import { SettingsLayout } from '@/pages/settings/SettingsLayout'
import { StaffListPage } from '@/pages/staff/StaffListPage'
import { DepartmentsPage } from '@/pages/settings/DepartmentsPage'
import { PositionsPage } from '@/pages/settings/PositionsPage'
import {
  CompanySettings,
  SecuritySettings,
  WorkingHoursSettings,
  SystemSettings,
} from '@/pages/settings/SettingsTabs'
import { ProfilePage } from '@/pages/ProfilePage'
import { ReferenceListPage } from '@/pages/settings/ReferenceListPage'
import { REFERENCE_CONFIGS } from '@/pages/settings/referenceConfigs'
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

            <Route path="/profil" element={<ProfilePage />} />

            {/* Ayarlar = kullanıcı yönetimi → yalnızca owner/admin (BUG 4) */}
            <Route element={<RequireManager />}>
              <Route path="/ayarlar" element={<SettingsLayout />}>
              <Route index element={<Navigate to="/ayarlar/calisanlar" replace />} />
              <Route path="calisanlar" element={<StaffListPage />} />
              <Route path="departmanlar" element={<DepartmentsPage />} />
              <Route path="pozisyonlar" element={<PositionsPage />} />
              {Object.entries(REFERENCE_CONFIGS).map(([slug, config]) => (
                <Route key={slug} path={slug} element={<ReferenceListPage config={config} />} />
              ))}
              <Route path="sirket" element={<CompanySettings />} />
              <Route path="guvenlik" element={<SecuritySettings />} />
              <Route path="calisma-duzeni" element={<WorkingHoursSettings />} />
              <Route path="sistem" element={<SystemSettings />} />
              </Route>
            </Route>

            <Route path="*" element={<PlaceholderPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}
