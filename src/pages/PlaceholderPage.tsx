import { useLocation } from 'react-router-dom'
import { Hammer } from 'lucide-react'
import { activeNavItem } from '@/lib/navigation'

/**
 * Henüz arayüzü olmayan modül / bilinmeyen yol için bilgi kartı. Boş beyaz ekran
 * yerine modülün ne işe yaradığını gösterir.
 */
export function PlaceholderPage() {
  const { pathname } = useLocation()
  const item = activeNavItem(pathname)
  const Icon = item?.icon ?? Hammer

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="bg-card flex size-16 items-center justify-center rounded-2xl border shadow-card">
        <Icon className="text-accent-primary size-8" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold text-foreground">{item?.label ?? 'Sayfa bulunamadı'}</h2>
        <p className="text-sm text-text-secondary">{item?.description ?? 'Aradığınız sayfa taşınmış veya kaldırılmış olabilir.'}</p>
      </div>
      <span className="bg-info text-info-foreground rounded-md px-2.5 py-1 text-xs font-medium">Hazırlanıyor</span>
    </div>
  )
}
