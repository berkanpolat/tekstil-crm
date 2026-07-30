import { useState } from 'react'
import { useSignedUrl } from '@/hooks/useFiles'
import { cn } from '@/lib/utils'
import { ImageOff } from 'lucide-react'

/**
 * Katalog görseli (QA#6). width verilirse thumbnail (Supabase transform) — ızgarada tam-boy
 * yerine küçük görsel yüklenir. Plan transform desteklemezse onError ile orijinale düşer.
 * contain=true → 2:3 kart içinde KIRPILMADAN sığar.
 */
export function CatalogImage({ path, alt, className, width, contain }:
  { path: string | null; alt: string; className?: string; width?: number; contain?: boolean }) {
  const [noTransform, setNoTransform] = useState(false)
  const useTx = !!width && !noTransform
  const url = useSignedUrl(
    path ? { bucket: 'documents', storage_path: path } : null,
    useTx ? { width, resize: contain ? 'contain' : 'cover' } : undefined,
  )
  if (!path) return <div className={cn('flex items-center justify-center bg-muted text-text-muted', className)}><ImageOff className="size-6" /></div>
  return url.data
    ? <img src={url.data} alt={alt} loading="lazy" decoding="async"
        className={cn(contain ? 'object-contain' : 'object-cover', className)}
        onError={() => { if (useTx) setNoTransform(true) }} />
    : <div className={cn('animate-pulse bg-muted', className)} />
}
