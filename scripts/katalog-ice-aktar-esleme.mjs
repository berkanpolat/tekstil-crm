// Yeni sezon içe aktarmasının SAF eşleştirme mantığı.
//
// Bu dosya ağa ve dosya sistemine DOKUNMAZ — bütün karar mantığı burada
// olduğu için birim testle kuşatılabiliyor. Yan etkiler CLI'de.

/** Sitedeki koleksiyon kodu → CRM catalog_collections.id. Birebir hazır. */
export const KOLEKSIYON = { tesettur: 7, casual: 8, premium: 9 }

/**
 * Site etiketi → CRM etiketi. YALNIZ yazım farkları; anlam eşleştirmesi DEĞİL.
 * Her girdi tek tek doğrulanmıştır. Buraya "benzer" bir şey eklenmez.
 */
export const TUR_ES_ADLAR = { 'Tişört': 'T-Shirt' }

const HARFLER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/**
 * İç kod üretir. Katalog 4'ün kalıbı: `YS-` + 6 karakter.
 * Katalog 2'nin `ST-26SS…` kalıbı o sezona özgüdür, kopyalanmaz.
 * @param mevcutKodlar çakışma denetimi için; üretilen kod BU KÜMEYE EKLENİR.
 */
export function icKodUret(mevcutKodlar) {
  for (let deneme = 0; deneme < 1000; deneme++) {
    let k = 'YS-'
    for (let i = 0; i < 6; i++) k += HARFLER[Math.floor(Math.random() * HARFLER.length)]
    if (!mevcutKodlar.has(k)) { mevcutKodlar.add(k); return k }
  }
  throw new Error('İç kod üretilemedi: 1000 denemede boş kod bulunamadı.')
}

/**
 * Bir site ürününü CRM kaydına dönüştürür.
 *
 * UYDURMA EŞLEŞTİRME YOKTUR: CRM'de karşılığı olmayan kumaş "benzerine"
 * bağlanmaz, eksik olarak bildirilir. Yanlış kumaş yanlış maliyet demektir.
 * Çift kayıtlı tür etiketi de belirsizdir — hangi satırın seçileceğine
 * insan karar verir.
 *
 * @param secenek.kumassizKabul true ise SADECE kumaş eksik/belirsizse ürün
 *   yine `ok:true` döner ve `fabric_type_id` null bırakılır (rastgele satır
 *   seçmek yanlış maliyet demektir; boş alan dürüsttür). Koleksiyon veya
 *   tür eksikse bu seçenek devrede olsa da `ok:false` döner — varsayılan
 *   davranış (seçeneksiz çağrı) DEĞİŞMEZ.
 * @returns {{ok: true, kayit: object} | {ok: false, eksik: object[]}}
 */
export function esitle(urun, sozluk, secenek = {}) {
  const eksik = []

  const collection_id = KOLEKSIYON[urun.cat]
  if (!collection_id) eksik.push({ alan: 'koleksiyon', deger: urun.cat ?? null })

  let category_id = null
  const turEtiket = TUR_ES_ADLAR[urun.type] ?? urun.type
  const turAdaylari = sozluk.turler.get(turEtiket)
  if (!turAdaylari) eksik.push({ alan: 'tur', deger: urun.type ?? null })
  else if (turAdaylari.length > 1) eksik.push({ alan: 'tur', deger: urun.type, adaylar: turAdaylari })
  else category_id = turAdaylari[0]

  let fabric_type_id = null
  const kumasEksik = []
  const kumasAdaylari = sozluk.kumaslar.get(urun.fabric)
  if (!kumasAdaylari) kumasEksik.push({ alan: 'kumas', deger: urun.fabric ?? null })
  else if (kumasAdaylari.length > 1) kumasEksik.push({ alan: 'kumas', deger: urun.fabric, adaylar: kumasAdaylari })
  else fabric_type_id = kumasAdaylari[0]

  const kumassizGecerli = secenek.kumassizKabul && kumasEksik.length > 0 && eksik.length === 0
  if (!kumassizGecerli) eksik.push(...kumasEksik)

  if (eksik.length) return { ok: false, eksik }

  return {
    ok: true,
    kayit: {
      name: urun.name,
      slug: urun.slug,
      site_code: urun.code,
      collection_id,
      category_id,
      fabric_type_id,
    },
  }
}

/** Rapor başlığında gösterilecek sayılar. */
export function raporOzeti(sonuclar) {
  const ozet = { toplam: sonuclar.length, hazir: 0, eksikKumas: 0, belirsizTur: 0 }
  for (const s of sonuclar) {
    if (s.ok) { ozet.hazir++; continue }
    for (const e of s.eksik) {
      if (e.alan === 'kumas') ozet.eksikKumas++
      if (e.alan === 'tur') ozet.belirsizTur++
    }
  }
  return ozet
}
