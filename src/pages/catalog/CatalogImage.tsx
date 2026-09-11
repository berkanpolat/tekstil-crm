import { DosyaResim } from '@/components/shared/DosyaResim'

/**
 * Katalog görseli. width verilirse hazır küçük resim (160/480) istenir.
 * contain=true → kart oranından bağımsız KIRPILMADAN sığar.
 *
 * Eski `noTransform` yedek yolu kaldırıldı: küçük resimler artık yükleme
 * anında üretiliyor, Worker bulamazsa kendisi orijinale düşüyor.
 */
export function CatalogImage({ path, alt, className, width, contain }:
  { path: string | null; alt: string; className?: string; width?: number; contain?: boolean }) {
  return <DosyaResim path={path} alt={alt} className={className} genislik={width} contain={contain} />
}
