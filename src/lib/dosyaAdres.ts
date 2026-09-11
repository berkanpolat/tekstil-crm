import { env } from './env'

/** Hazır küçük resim boyutları. Başka boyut ÜRETİLMEZ (ücretsiz kalmak için). */
export type Boyut = 160 | 480

/**
 * İstenen genişliği hazır boyutlardan birine yuvarlar. 480'den genişse
 * orijinal istenir — büyütmenin anlamı yok.
 */
export function enYakinBoyut(genislik?: number): Boyut | undefined {
  if (!genislik || genislik <= 0) return undefined
  if (genislik <= 160) return 160
  if (genislik <= 480) return 480
  return undefined
}

export interface AdresSecenek {
  genislik?: number
  /** Verilirse tarayıcı indirir (Content-Disposition: attachment). */
  indirAdi?: string
}

/**
 * Yolun biçimi. Worker'daki `yolGecerli` ile AYNI kural — iki taraf ayrışırsa
 * ön yüz Worker'ın reddedeceği adresler üretir.
 *
 * `k/` öneki dışlanır: küçük resim anahtarını yalnız Worker kurar.
 * `..` dışlanır: `new URL()` nokta segmentlerini normalleştirip `/d/` önekinin
 * dışına taşır (encodeURIComponent noktayı kodlamaz).
 */
export function yolGecerli(yol: string): boolean {
  if (typeof yol !== 'string' || !yol || yol.length > 200) return false
  if (yol.includes('..') || yol.includes('\\')) return false
  if (yol.startsWith('/') || yol.startsWith('k/')) return false
  return /^[a-zA-Z0-9_\-./]+$/.test(yol)
}

/**
 * Dosyanın KALICI adresi. İmza yoktur; kimlik oturum çerezinde taşınır.
 * Adres sabit olduğu için tarayıcı önbelleği çalışır.
 *
 * ASLA FIRLATMAZ. Yapılandırma eksikse ya da yol geçersizse boş dize döner;
 * çağıran bunu "görsel yok" olarak ele alır. Sebep: bir adres üreticisinin
 * çizim sırasında patlaması tüm sayfayı beyaz ekrana çevirir.
 *
 * SONRAKİ GÖREVLER İÇİN SÖZLEŞME: `dosyaUrl` boş dize dönebilir.
 * - `useSignedUrl` boş dize alırsa `data: undefined` dönmeli (Görev 6/7).
 * - `DosyaResim` boş dizeyi `null` gibi ele alıp yer tutucu göstermeli.
 * - `getSignedUrl` (indirme yolu) boş dizede Türkçe bir hata fırlatmalı —
 *   sessizce hiçbir şey yapmayan bir indirme daha kötüdür.
 */
export function dosyaUrl(yol: string, secenek?: AdresSecenek): string {
  if (!env.dosyaUrl || !yolGecerli(yol)) return ''
  const kodlu = yol.split('/').map(encodeURIComponent).join('/')
  const u = new URL(`${env.dosyaUrl}/d/${kodlu}`)
  const boyut = enYakinBoyut(secenek?.genislik)
  if (boyut) u.searchParams.set('w', String(boyut))
  if (secenek?.indirAdi) u.searchParams.set('indir', secenek.indirAdi)
  return u.toString()
}
