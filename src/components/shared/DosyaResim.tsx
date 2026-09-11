import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import { dosyaUrl } from '@/lib/dosyaAdres'
import { oturumTazele } from '@/lib/dosyaOturum'
import { cn } from '@/lib/utils'

/**
 * Dosya servisinden gelen tek resim bileşeni.
 *
 * YENİDEN DENEME: oturum çerezi jetonla birlikte ~1 saatte dolar. Sekme açık
 * kalmışsa resimler 401 alıp kırılırdı. İlk hatada çerez bir kez tazelenip
 * resim yeniden istenir; ikinci hatada yer tutucuya düşülür (sonsuz döngü yok).
 *
 * Worker küçük resim bulamazsa KENDİSİ orijinale düşer — bu yüzden burada
 * "küçük resim yok" için ayrı bir geri düşüş yolu YOK; tek hata nedeni oturum
 * süresinin dolmasıdır.
 */
export function DosyaResim({
  path, alt, className, genislik, contain,
}: {
  path: string | null
  alt: string
  className?: string
  genislik?: number
  contain?: boolean
}) {
  const [damga, setDamga] = useState<number | null>(null)
  const [pes, setPes] = useState(false)

  const temel = path ? dosyaUrl(path, { genislik }) : ''
  // dosyaUrl yapılandırma eksikse ya da yol geçersizse boş dize döner; bunu
  // da "görsel yok" say — <img src=""> sayfanın kendisine istek atar.
  if (!temel || pes) {
    return (
      <div className={cn('flex items-center justify-center bg-muted text-text-muted', className)}>
        <ImageOff className="size-6" />
      </div>
    )
  }

  const src = damga ? `${temel}${temel.includes('?') ? '&' : '?'}tz=${damga}` : temel

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn(contain ? 'object-contain' : 'object-cover', className)}
      onError={() => {
        if (damga) { setPes(true); return }
        oturumTazele()
          .then(() => setDamga(Date.now()))
          .catch(() => setPes(true))
      }}
    />
  )
}
