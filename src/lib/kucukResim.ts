import type { Boyut } from './dosyaAdres'

/**
 * Tarayıcıda küçük resim üretir.
 *
 * NEDEN BURADA: Cloudflare Image Resizing ayda 5.000 dönüşümden sonra
 * ücretlidir. Küçüğü yükleme anında bir kez üretip R2'ye koymak hem bedava
 * hem de sunumda hiç işlem gerektirmediği için daha hızlıdır.
 *
 * @returns WebP blob, ya da üretilemezse null (çağıran yalnız orijinali yükler).
 */
export async function kucukResimUret(dosya: File, genislik: Boyut): Promise<Blob | null> {
  if (!dosya.type.startsWith('image/')) return null
  try {
    // HEIC/HEIF gibi biçimlerde tarayıcı çizemez → burada hata verir, null döner.
    const bitmap = await createImageBitmap(dosya)
    try {
      const oran = Math.min(1, genislik / bitmap.width) // büyütme yok
      const g = Math.max(1, Math.round(bitmap.width * oran))
      const y = Math.max(1, Math.round(bitmap.height * oran))

      const tuval = document.createElement('canvas')
      tuval.width = g
      tuval.height = y
      const ctx = tuval.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, g, y)

      return await new Promise<Blob | null>((coz) => {
        try {
          tuval.toBlob((b) => coz(b), 'image/webp', 0.82)
        } catch {
          coz(null)
        }
      })
    } finally {
      bitmap.close?.()
    }
  } catch {
    return null
  }
}
