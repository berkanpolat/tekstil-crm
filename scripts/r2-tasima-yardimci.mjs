// Saf yardımcılar — R2 taşıma betiği ve testleri ortak kullanır.
//
// BİLEREK ayrı dosyada: `scripts/r2-tasima.mjs` `sharp` (yerel ikili modül)
// yükler; test ortamı jsdom'dur. Ana betiği testten içe aktarmak sharp'ı
// yüklemeye çalışır ve ortam dışı hatayla kırılabilir. Bu dosya hiçbir
// yerel modül veya Node çalışma zamanına özel API içermez — yalnız saf
// fonksiyonlar.

/**
 * Küçük resim R2 anahtarı. Worker'daki `r2Anahtar` (services/dosya-worker/
 * src/index.js) ile BİREBİR aynı biçim olmak ZORUNDA — ayrışırsa taşınan
 * küçük resimler Worker tarafından hiç bulunamaz.
 *   Worker: r2Anahtar(yol, genislik) → `k/${genislik}/${yol}.webp`
 */
export const kucukYolu = (yol, boyut) => `k/${boyut}/${yol}.webp`

/** sharp'ın güvenle işleyebildiği tipler. HEIC/HEIF hariç (lisans + kodek). */
export const gorselMi = (mime) =>
  typeof mime === 'string' &&
  ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)
