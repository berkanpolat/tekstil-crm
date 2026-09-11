import type { Boyut } from './dosyaAdres'

type Bitmap = Pick<ImageBitmap, 'width' | 'height' | 'close'>

/** Zaten kod çözülmüş bir bitmap'ten tek bir boyutta WebP blob üretir. */
async function tuvaldenBlobUret(bitmap: Bitmap, genislik: Boyut): Promise<Blob | null> {
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
}

/**
 * Tarayıcıda küçük resim üretir.
 *
 * NEDEN BURADA: Cloudflare Image Resizing ayda 5.000 dönüşümden sonra
 * ücretlidir. Küçüğü yükleme anında bir kez üretip R2'ye koymak hem bedava
 * hem de sunumda hiç işlem gerektirmediği için daha hızlıdır.
 *
 * Birden fazla boyut gerekiyorsa `kucukResimleriUret` kullanılsın — bu
 * işlev her çağrıda görseli yeniden kod çözer (tek boyutluk kullanım için
 * sorun değil, ama iki boyut için iki kez tam çözünürlük kod çözümü demektir).
 *
 * @returns WebP blob, ya da üretilemezse null (çağıran yalnız orijinali yükler).
 */
export async function kucukResimUret(dosya: File, genislik: Boyut): Promise<Blob | null> {
  if (!dosya.type.startsWith('image/')) return null
  try {
    // HEIC/HEIF gibi biçimlerde tarayıcı çizemez → burada hata verir, null döner.
    const bitmap = await createImageBitmap(dosya)
    try {
      return await tuvaldenBlobUret(bitmap, genislik)
    } finally {
      bitmap.close?.()
    }
  } catch {
    return null
  }
}

/**
 * Aynı görselden BİRDEN ÇOK boyutta küçük resim üretir — görsel yalnız BİR
 * KEZ kod çözülür (`createImageBitmap` maliyetlidir; iki ayrı
 * `kucukResimUret` çağrısı büyük görselde tam çözünürlüğü iki kez çözer).
 *
 * Dönen harita yalnız BAŞARILI boyutları içerir: kod çözme baştan
 * başarısızsa boş harita döner; tek tek boyutlarda `canvas`/`toBlob` hatası
 * olursa o boyut haritada YOK olur, diğerleri denenmeye devam eder.
 */
export async function kucukResimleriUret(
  dosya: File,
  genislikler: readonly Boyut[],
): Promise<Map<Boyut, Blob>> {
  const sonuc = new Map<Boyut, Blob>()
  if (!dosya.type.startsWith('image/')) return sonuc
  try {
    const bitmap = await createImageBitmap(dosya)
    try {
      for (const genislik of genislikler) {
        try {
          const blob = await tuvaldenBlobUret(bitmap, genislik)
          if (blob) sonuc.set(genislik, blob)
        } catch {
          // bu boyut atlanır, döngü diğer boyutlar için devam eder
        }
      }
    } finally {
      bitmap.close?.()
    }
  } catch {
    // createImageBitmap başarısız (HEIC vb.): boş harita döner
  }
  return sonuc
}
