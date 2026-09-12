// Yeni sezon içe aktarmasının SAF eşleştirme mantığı.
//
// Bu dosya ağa ve dosya sistemine DOKUNMAZ — bütün karar mantığı burada
// olduğu için birim testle kuşatılabiliyor. Yan etkiler CLI'de.

/** Sitedeki koleksiyon kodu → CRM catalog_collections.id. Birebir hazır. */
export const KOLEKSIYON = { tesettur: 7, casual: 8, premium: 9 }

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
 * @returns {{ok: true, kayit: object} | {ok: false, eksik: object[]}}
 */
export function esitle(urun, sozluk) {
  const eksik = []

  const collection_id = KOLEKSIYON[urun.cat]
  if (!collection_id) eksik.push({ alan: 'koleksiyon', deger: urun.cat ?? null })

  let category_id = null
  const turAdaylari = sozluk.turler.get(urun.type)
  if (!turAdaylari) eksik.push({ alan: 'tur', deger: urun.type ?? null })
  else if (turAdaylari.length > 1) eksik.push({ alan: 'tur', deger: urun.type, adaylar: turAdaylari })
  else category_id = turAdaylari[0]

  let fabric_type_id = null
  const kumasAdaylari = sozluk.kumaslar.get(urun.fabric)
  if (!kumasAdaylari) eksik.push({ alan: 'kumas', deger: urun.fabric ?? null })
  else if (kumasAdaylari.length > 1) eksik.push({ alan: 'kumas', deger: urun.fabric, adaylar: kumasAdaylari })
  else fabric_type_id = kumasAdaylari[0]

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
