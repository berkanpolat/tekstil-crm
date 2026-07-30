/**
 * Türkçe + Avrupa-duyarlı normalizasyon — arama ve mükerrer tespitinin temeli.
 * OTORİTER kaynak veritabanındaki IMMUTABLE `normalize_tr(text)` fonksiyonudur
 * (company_name_normalized generated column onu kullanır). Bu TS aynası istemci
 * tarafı önizleme içindir ve birebir aynı sonucu vermelidir
 * (tests/fixtures/normalize-tr-cases.json ile SQL↔TS tutarlılığı doğrulanır).
 *
 * Postgres lower()'a GÜVENİLMEZ (lower('İSTANBUL') birleşik nokta üretir). Türkçe
 * VE Avrupa aksanlarını önce ASCII'ye katlarız; ß → 'ss' (tek→iki karakter,
 * translate ile olmaz — önce replace).
 */
const FOLD: Record<string, string> = {
  // Türkçe
  İ: 'i', I: 'i', ı: 'i', i: 'i',
  Ş: 's', ş: 's',
  Ğ: 'g', ğ: 'g',
  Ü: 'u', ü: 'u',
  Ö: 'o', ö: 'o',
  Ç: 'c', ç: 'c',
  // Avrupa (ihracat)
  ä: 'a', Ä: 'a', å: 'a', Å: 'a', à: 'a', À: 'a', á: 'a', Á: 'a', â: 'a', Â: 'a',
  ë: 'e', Ë: 'e', é: 'e', É: 'e', è: 'e', È: 'e', ê: 'e', Ê: 'e',
  ï: 'i', Ï: 'i', í: 'i', Í: 'i',
  ó: 'o', Ó: 'o', ø: 'o', Ø: 'o',
  ú: 'u', Ú: 'u',
  ñ: 'n', Ñ: 'n',
  ý: 'y', Ý: 'y',
}
const FOLD_RE = new RegExp(`[${Object.keys(FOLD).join('')}]`, 'g')

export function normalizeTr(input: string | null | undefined): string | null {
  if (input == null) return null
  // 1) ß → ss (translate'ten önce)
  let s = input.replace(/ß/g, 'ss')
  // 2) Türkçe + Avrupa harflerini ASCII'ye katla (lower'dan ÖNCE)
  s = s.replace(FOLD_RE, (ch) => FOLD[ch] ?? ch)
  // 3) küçük harf (kalan A-Z için)
  s = s.toLowerCase()
  // 4) noktalama ve fazla boşlukları tek boşluğa indir, kırp
  s = s.replace(/[^a-z0-9]+/g, ' ').trim()
  return s || null
}
