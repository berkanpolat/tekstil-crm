// P8B — Katalog kodu eşleştirme yardımcıları (istemci aynası).
// SQL tarafı otoriterdir (normalize_tr + catalog_code_key + suggest_catalog_products);
// bu modül aynı mantığı istemcide aynalar (öneri etiketi + birim test kapsamı).
//
// İKİ SEVİYE (kasıtlı ayrım):
//  • autoMatchKey (madde 3): yalnız büyük/küçük harf + baş/son boşluk + Türkçe-güvenli.
//    İç ayraç farkını KORUR → "ST-26" ≠ "ST26". intake OTOMATİK bağlamada bunu kullanır.
//  • catalogCodeKey (madde 4): ayrıca iç ayraç/boşluğu da atar → "ST-26SS130010" = "ST26SS130010".
//    Yalnız ÖNERİ için; ASLA otomatik bağlamaz (yanlış ürün bağlı teklif > eşleşmemiş talep).
import { normalizeTr } from './normalize'

/** Otomatik tolerans anahtarı (madde 3): normalize_tr — iç ayraç korunur. */
export function autoMatchKey(code: string | null | undefined): string {
  return normalizeTr(code ?? '') ?? ''
}

/** Öneri/benzerlik anahtarı (madde 4): normalize_tr + tüm boşluk/ayraçları at. */
export function catalogCodeKey(code: string | null | undefined): string {
  return (normalizeTr(code ?? '') ?? '').replace(/\s+/g, '')
}

/** İki kod OTOMATİK eşleşir mi (madde 3)? Boş anahtar asla eşleşmez. */
export function isAutoMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = autoMatchKey(a)
  return ka.length > 0 && ka === autoMatchKey(b)
}

/** Yakın eşleşme mi (madde 4 — yalnız öneri, otomatik değil)?
 *  Anahtarlar eşit ya da biri diğerini içeriyorsa yakın sayılır. */
export function isNearMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = catalogCodeKey(a), kb = catalogCodeKey(b)
  if (!ka || !kb) return false
  return ka === kb || ka.includes(kb) || kb.includes(ka)
}
