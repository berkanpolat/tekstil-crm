type Data = Record<string, unknown>

/**
 * Bir belge bölümünü (ör. `soS`/`tkS`/`sip`/`order`) FONKSİYONEL setState ile
 * birleştiren güncelleyici döndürür.
 *
 * NEDEN: Snapshot tabanlı `set({ ...data, soS: { ...s, ...patch } })` deseninde
 * `data`/`s` render'dan sabittir. Aynı olayda art arda İKİ güncelleme yapılırsa
 * (ör. `CategorySelect`: grup seç + tür sıfırla) ikinci `set` ilkini EZER —
 * seçim forma yazılmaz. Fonksiyonel güncelleyici tabanı her zaman en güncel
 * state'ten (`prev`) aldığı için ardışık çağrılar BİRİKİR.
 *
 * Kullanım: `set(patchSection('soS', { grup: v }))`
 */
export function patchSection(section: string, patch: Data): (prev: Data) => Data {
  return (prev) => ({ ...prev, [section]: { ...((prev[section] as Data) ?? {}), ...patch } })
}
