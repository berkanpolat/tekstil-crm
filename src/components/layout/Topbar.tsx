import { useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { activeNavItem } from '@/lib/navigation'

interface TopbarProps {
  onOpenMobileMenu: () => void
}

/**
 * Üst çubuk: sayfa başlığı solda, birincil aksiyon alanı sağda (gerçek sayfalar
 * PageHeader ile dolduracak — P0.10). Mobilde solda menü (hamburger) butonu.
 */
export function Topbar({ onOpenMobileMenu }: TopbarProps) {
  const { pathname } = useLocation()
  const active = activeNavItem(pathname)

  return (
    <header className="bg-card flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
      <button
        type="button"
        onClick={onOpenMobileMenu}
        className="hover:bg-muted rounded-md p-2 text-foreground md:hidden"
        aria-label="Menüyü aç"
      >
        <Menu className="size-5" />
      </button>

      <h1 className="flex-1 truncate text-[18px] font-semibold text-foreground">
        {active?.label ?? 'Tekstil A.Ş. CRM'}
      </h1>

      {/* Birincil aksiyon alanı — gerçek sayfalarda doldurulacak (P0.10 PageHeader). */}
      <div id="topbar-actions" className="flex items-center gap-2" />
    </header>
  )
}
