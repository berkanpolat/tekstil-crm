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
 * Dosyanın KALICI adresi. İmza yoktur; kimlik oturum çerezinde taşınır.
 * Adres sabit olduğu için tarayıcı önbelleği çalışır.
 */
export function dosyaUrl(yol: string, secenek?: AdresSecenek): string {
  const kodlu = yol.split('/').map(encodeURIComponent).join('/')
  const u = new URL(`${env.dosyaUrl}/d/${kodlu}`)
  const boyut = enYakinBoyut(secenek?.genislik)
  if (boyut) u.searchParams.set('w', String(boyut))
  if (secenek?.indirAdi) u.searchParams.set('indir', secenek.indirAdi)
  return u.toString()
}
