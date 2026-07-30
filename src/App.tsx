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
import { NotificationSettings } from '@/pages/settings/NotificationSettings'
import { PricingSettings } from '@/pages/settings/PricingSettings'
import { FinanceSettings } from '@/pages/settings/FinanceSettings'
import { RolePermissionsPage } from '@/pages/settings/RolePermissionsPage'
import { AiSettings } from '@/pages/settings/AiSettings'
import { ProductCategoriesPage } from '@/pages/settings/ProductCategoriesPage'
import { StatusTransitionsPage } from '@/pages/settings/StatusTransitionsPage'
import { REFERENCE_CONFIGS } from '@/pages/settings/referenceConfigs'
import { LeadsListPage } from '@/pages/leads/LeadsListPage'
import { LeadCardPage } from '@/pages/leads/LeadCardPage'
import { CustomersListPage } from '@/pages/customers/CustomersListPage'
import { CustomerCardPage } from '@/pages/customers/CustomerCardPage'
import { OperationsListPage } from '@/pages/operations/OperationsListPage'
import { OperationCardPage } from '@/pages/operations/OperationCardPage'
import { BelgelerListPage } from '@/pages/documents/BelgelerListPage'
import { DocumentEditorPage } from '@/pages/documents/DocumentEditorPage'
import { NotificationsPage } from '@/pages/notifications/NotificationsPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { CatalogListPage } from '@/pages/catalog/CatalogListPage'
import { CatalogProductPage } from '@/pages/catalog/CatalogProductPage'
import { FinancePage } from '@/pages/finance/FinancePage'
import { TasksPage } from '@/pages/tasks/TasksPage'
import { GoalsPage } from '@/pages/tasks/GoalsPage'
import { TekliflerListPage } from '@/pages/quotes/TekliflerListPage'
import { NumunelerListPage } from '@/pages/samples/NumunelerListPage'
import { SiparislerListPage } from '@/pages/orders/SiparislerListPage'
import { RaporlarPage } from '@/pages/reports/RaporlarPage'
import { NAV_ITEMS } from '@/lib/navigation'

/** Gerçek sayfası olan modüller (yer tutucu değil). */
const IMPLEMENTED_PATHS = new Set(['/', '/ayarlar', '/potansiyeller', '/musteriler', '/talepler', '/teklifler', '/numuneler', '/siparisler', '/katalog', '/belgeler', '/finans', '/gorevler', '/hedefler', '/raporlar'])

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
          {/* Tam sayfa belge editörü — AppShell dışı (kendi üst çubuğu, tam yükseklik) */}
          <Route path="/belgeler/yeni/:tip" element={<DocumentEditorPage mode="new" />} />
          <Route path="/belgeler/:id/duzenle" element={<DocumentEditorPage mode="edit" />} />

          <Route element={<AppShell />}>
            {NAV_ITEMS.filter((i) => !IMPLEMENTED_PATHS.has(i.path)).map((item) => (
              <Route key={item.path} path={item.path} element={<PlaceholderPage />} />
            ))}

            <Route path="/potansiyeller" element={<LeadsListPage />} />
            <Route path="/potansiyeller/:id" element={<LeadCardPage />} />
            <Route path="/musteriler" element={<CustomersListPage />} />
            <Route path="/musteriler/:id" element={<CustomerCardPage />} />
            <Route path="/talepler" element={<OperationsListPage />} />
            <Route path="/talepler/:id" element={<OperationCardPage />} />
            <Route path="/teklifler" element={<TekliflerListPage />} />
            <Route path="/numuneler" element={<NumunelerListPage />} />
            <Route path="/siparisler" element={<SiparislerListPage />} />
            <Route path="/" element={<DashboardPage />} />
            <Route path="/belgeler" element={<BelgelerListPage />} />
            <Route path="/katalog" element={<CatalogListPage />} />
            <Route path="/katalog/:id" element={<CatalogProductPage />} />
            <Route path="/finans" element={<FinancePage />} />
            <Route path="/gorevler" element={<TasksPage />} />
            <Route path="/hedefler" element={<GoalsPage />} />
            <Route path="/raporlar" element={<RaporlarPage />} />
            <Route path="/bildirimler" element={<NotificationsPage />} />
            <Route path="/profil" element={<ProfilePage />} />

            {/* Ayarlar = kullanıcı yönetimi → yalnızca owner/admin (BUG 4) */}
            <Route element={<RequireManager />}>
              <Route path="/ayarlar" element={<SettingsLayout />}>
              <Route index element={<Navigate to="/ayarlar/calisanlar" replace />} />
              <Route path="calisanlar" element={<StaffListPage />} />
              <Route path="departmanlar" element={<DepartmentsPage />} />
              <Route path="pozisyonlar" element={<PositionsPage />} />
              <Route path="kategori-tur" element={<ProductCategoriesPage />} />
              <Route path="durum-gecisleri" element={<StatusTransitionsPage />} />
              {Object.entries(REFERENCE_CONFIGS).map(([slug, config]) => (
                <Route key={slug} path={slug} element={<ReferenceListPage config={config} />} />
              ))}
              <Route path="sirket" element={<CompanySettings />} />
              <Route path="guvenlik" element={<SecuritySettings />} />
              <Route path="yetkiler" element={<RolePermissionsPage />} />
              <Route path="calisma-duzeni" element={<WorkingHoursSettings />} />
              <Route path="bildirimler" element={<NotificationSettings />} />
              <Route path="fiyatlandirma" element={<PricingSettings />} />
              <Route path="finans" element={<FinanceSettings />} />
              <Route path="yapay-zeka" element={<AiSettings />} />
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
