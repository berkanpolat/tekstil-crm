import { useLocation } from 'react-router-dom'
import { Hammer } from 'lucide-react'
import { activeNavItem } from '@/lib/navigation'

/**
 * Faz 0 yer tutucu sayfası. Boş beyaz ekran yerine, bu modülün ne işe yarayacağını
 * ve hangi fazda geleceğini söyleyen bir bilgi kartı gösterir.
 */
export function PlaceholderPage() {
  const { pathname } = useLocation()
  const item = activeNavItem(pathname)
  const Icon = item?.icon ?? Hammer

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="bg-card flex size-16 items-center justify-center rounded-2xl border shadow-card">
        <Icon className="text-orange size-8" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold text-foreground">{item?.label ?? 'Sayfa'}</h2>
        <p className="text-sm text-text-secondary">{item?.description}</p>
      </div>
      <span className="bg-info text-info-foreground rounded-md px-2.5 py-1 text-xs font-medium">
        {item?.arrives ?? 'İleride'} tamamlanacak
      </span>
      <p className="text-xs text-text-muted">
        Faz 0 temel altyapıyı kurar; bu modülün arayüzü sonraki fazlarda gelir.
      </p>
    </div>
  )
}
