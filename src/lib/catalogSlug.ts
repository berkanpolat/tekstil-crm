/**
 * Ürün slug'ı — sitedeki adresin (`tekstilas.com/katalog/<slug>/`) parçası.
 *
 * Aynı kural veritabanında `public.catalog_slugify(text)` olarak da duruyor (M1.1).
 * İkisinin ayrışmaması önemli: arayüz kabul edip DB reddederse kullanıcı anlaşılmaz
 * bir hata görür. Bu yüzden kural tek yerde tanımlı ve testli.
 *
 * DİKKAT — slug ADDAN TÜRETİLEMEZ: sitenin 672 slug'ından 8'i ada uymuyor
 * (7'si çakışma için eklenen "-2" soneki). `slugify` yalnız YENİ ürün için bir
 * başlangıç önerisidir; mevcut ürünlerin slug'ı kaynaktan gelir ve korunur.
 */

const TR: Record<string, string> = {
  ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g',
  ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c', ß: 'ss',
}

/** Ad → slug önerisi (Türkçe→ASCII, harf/rakam dışı → tire). */
export function slugify(input: string): string {
  return (input ?? '')
    .replace(/[ıİşŞğĞüÜöÖçÇß]/g, (c) => TR[c] ?? c)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // kalan Avrupa aksanları
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Kaydedilebilir slug biçimi mi? (küçük harf, rakam, tek tire; baş/son tire yok) */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
}
