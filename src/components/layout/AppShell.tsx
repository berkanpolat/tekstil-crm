import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { unlockNotificationSound } from '@/lib/notificationSound'

/**
 * Uygulama kabuğu: sol sidebar + üst çubuk + içerik. Masaüstünde sidebar
 * daraltılabilir (240px ↔ 64px); mobilde açılır çekmeceye dönüşür.
 */
export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // B.5 — tarayıcı otomatik ses çalmayı engeller; ilk kullanıcı etkileşiminde kilidi aç.
  useEffect(() => {
    const unlock = () => unlockNotificationSound()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) }
  }, [])

  return (
    <div className="flex h-dvh overflow-hidden print:h-auto print:overflow-visible">
      {/* Masaüstü sidebar */}
      <div
        className={cn(
          'hidden shrink-0 transition-[width] duration-200 md:block print:!hidden',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((v) => !v)} />
      </div>

      {/* Mobil çekmece */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Menü</SheetTitle>
          <Sidebar
            collapsed={false}
            showCollapseButton={false}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* İçerik */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="print:hidden">
          <Topbar onOpenMobileMenu={() => setMobileOpen(true)} />
        </div>
        <main className="bg-page flex-1 overflow-auto p-4 md:p-6 print:overflow-visible print:bg-white print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
