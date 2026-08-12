import { useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useSignedUrl } from '@/hooks/useFiles'

export interface LightboxImage {
  bucket: string
  storage_path: string
  name?: string
}

/**
 * Madde 13 — Tam boyut görsel önizleme. Esc kapatır, ←/→ galeride gezinir.
 * index null iken kapalı. Kancalar koşulsuz çağrılır (index null'da imzalı URL devre dışı).
 */
export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: LightboxImage[]
  index: number | null
  onIndexChange: (i: number) => void
  onClose: () => void
}) {
  const open = index != null && index >= 0 && index < images.length
  const current = open ? images[index] : null
  const url = useSignedUrl(current ? { bucket: current.bucket, storage_path: current.storage_path } : null)
  const many = images.length > 1

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && many) onIndexChange((index! - 1 + images.length) % images.length)
      else if (e.key === 'ArrowRight' && many) onIndexChange((index! + 1) % images.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, index, images.length, many, onClose, onIndexChange])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Kapat"
        className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="size-5" />
      </button>

      {many && (
        <button
          type="button"
          aria-label="Önceki"
          onClick={(e) => { e.stopPropagation(); onIndexChange((index! - 1 + images.length) % images.length) }}
          className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}

      <div className="flex max-h-full max-w-full flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {url.data ? (
          <img
            src={url.data}
            alt={current?.name ?? 'Görsel'}
            className="max-h-[85vh] max-w-[90vw] rounded object-contain"
          />
        ) : (
          <Loader2 className="size-6 animate-spin text-white" />
        )}
        {many && <span className="text-xs text-white/80">{index! + 1} / {images.length}</span>}
      </div>

      {many && (
        <button
          type="button"
          aria-label="Sonraki"
          onClick={(e) => { e.stopPropagation(); onIndexChange((index! + 1) % images.length) }}
          className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <ChevronRight className="size-6" />
        </button>
      )}
    </div>
  )
}
