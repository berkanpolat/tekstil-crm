import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Faz 0 / P0.1 gecici acilis ekrani. Gercek yonlendirme, AppShell ve sayfalar
 * P0.9'da bu bileseni degistirecek. Simdilik yigin dogru kuruldu mu diye
 * gorsel bir kontrol noktasi.
 */
export default function App() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="bg-primary/10 text-primary flex size-16 items-center justify-center rounded-2xl">
        <Building2 className="size-8" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Tekstil A.Ş. CRM</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Faz 0 — Temel altyapı kuruluyor. Bu ekran yalnızca geliştirme yığınının doğru
          çalıştığını gösterir. Uygulama arayüzü sonraki paketlerde gelecek.
        </p>
      </div>
      <Button>Kurulum çalışıyor</Button>
    </div>
  )
}
