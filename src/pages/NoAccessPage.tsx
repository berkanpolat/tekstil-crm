import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Yetkisiz erişim ekranı — adresi elle yazan ama yetkisi olmayan kullanıcı için. */
export function NoAccessPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="bg-danger flex size-16 items-center justify-center rounded-2xl">
        <ShieldAlert className="text-danger-foreground size-8" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-foreground">Bu sayfaya erişiminiz yok</h2>
        <p className="text-sm text-text-secondary">
          Bu bölüm yalnızca yöneticiler içindir. Erişim gerekiyorsa yöneticinize başvurun.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link to="/">Panele dön</Link>
      </Button>
    </div>
  )
}
