/**
 * Belge indirme dosya adı — anlamlı ad üretimi (tek kaynak).
 *
 * Üretilen belgeler eskiden "koli_ustu-1788872505660.pdf" gibi anlamsız iniyordu.
 * Bunun yerine: müşteri adı + belge türü → "PolatCetiner-FiyatTeklifi.pdf".
 * Müşteri yoksa (bağımsız belge) talep kodu kullanılır → "TAS-XCVWME-FiyatTeklifi.pdf".
 *
 * Kurallar (proje sahibi):
 *  - Türkçe karakterler ASCII'ye: ç→c, ğ→g, ı→i, İ→I, ö→o, ş→s, ü→u (ve büyük eşleri).
 *  - Boşluk ve noktalama kaldırılır, kelime başları büyük kalır (PascalCase birleşim).
 *  - Aynı ad ikinci kez inerse tarayıcı zaten "(1)" ekler — burada bir şey yapılmaz.
 *
 * Bu modül belge motorunun (üretim) ve tüm indirme yollarının ORTAK kuralıdır;
 * indirme adı hem `<a download>` hem de imzalı URL'in `download` parametresine verilir.
 */

/** Türkçe harf → ASCII (büyük/küçük korunur). */
const TR_ASCII: Record<string, string> = {
  ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I',
  ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U',
}
const TR_ASCII_RE = new RegExp(`[${Object.keys(TR_ASCII).join('')}]`, 'g')

/** Türkçe (+ genel Avrupa aksanlarını) ASCII'ye katla; büyük/küçük harf korunur. */
export function asciiFold(input: string): string {
  return input
    .replace(TR_ASCII_RE, (ch) => TR_ASCII[ch] ?? ch)
    // kalan aksanlı harfler (ihracat müşterileri): diakritikleri ayır ve at
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Serbest metni PascalCase birleşik jetona çevirir:
 * "Polat Çetiner Tekstil" → "PolatCetinerTekstil". Boşluk/noktalama ayraç sayılır,
 * her kelimenin ilk harfi büyür, kalanı küçülür (kelime sınırları görünür kalsın).
 */
export function toPascal(input: string): string {
  return asciiFold(input)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
}

/** Belge türü → dosya adı jetonu (proje sahibinin verdiği adlar). */
export const DOC_TYPE_SLUG: Record<string, string> = {
  fiyat_teklifi: 'FiyatTeklifi',
  siparis_onay: 'SiparisOnay',
  siparis_formu: 'SiparisFormu',
  numune_etiketi: 'NumuneEtiketi',
  koli_ustu: 'KoliUstu',
}

/** Belge türü anahtarını okunur jetona çevir; bilinmeyen tür PascalCase'e düşer. */
export function docTypeSlug(typeKey: string): string {
  return DOC_TYPE_SLUG[typeKey] ?? toPascal(typeKey) ?? 'Belge'
}

/** Talep kodunu dosya adı için düzenler: 6 karakterlik çıplak gövde "TAS-" ile öne alınır. */
export function normalizeTasCode(code: string): string {
  const c = code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
  if (!c) return ''
  return /^[A-Z0-9]{6}$/.test(c) ? `TAS-${c}` : c
}

export interface DocumentNameParts {
  typeKey: string
  /** Müşteri adı (şirket veya kişi); varsa öncelikli. */
  customerName?: string | null
  /** Talep/belge kodu (ör. "TAS-XCVWME"); müşteri yoksa kullanılır. */
  operationCode?: string | null
  /** Uzantı (varsayılan pdf). */
  ext?: string
}

/**
 * İndirme dosya adı üretir:
 *  - Müşteri varsa: "PolatCetiner-FiyatTeklifi.pdf"
 *  - Müşteri yoksa (bağımsız belge): "TAS-XCVWME-FiyatTeklifi.pdf"
 *  - İkisi de yoksa: "Belge-FiyatTeklifi.pdf"
 */
export function buildDocumentFileName({ typeKey, customerName, operationCode, ext = 'pdf' }: DocumentNameParts): string {
  const type = docTypeSlug(typeKey)
  const who = customerName ? toPascal(customerName) : ''
  const prefix = who || (operationCode ? normalizeTasCode(operationCode) : '') || 'Belge'
  return `${prefix}-${type}.${ext}`
}
