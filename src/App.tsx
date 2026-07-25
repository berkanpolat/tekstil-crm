import { Routes, Route } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { NAV_ITEMS } from '@/lib/navigation'

/**
 * Faz 0 yönlendirme. Tüm menü rotaları şimdilik yer tutucu sayfaya bağlı.
 * Kimlik ekranları (giriş, şifre) ve gerçek modül sayfaları sonraki fazlarda
 * bu yapının içine eklenecek. Auth guard henüz yok (giriş ekranı P0.4 UI'ında).
 */
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {NAV_ITEMS.map((item) => (
          <Route key={item.path} path={item.path} element={<PlaceholderPage />} />
        ))}
        <Route path="*" element={<PlaceholderPage />} />
      </Route>
    </Routes>
  )
}
