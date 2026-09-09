// Hızlı Çalışma Ekranı (/calisma) — saf yardımcılar (DB'siz, test edilebilir).

export type CalismaTab = 'bugun' | 'teklif' | 'tumu'

export const CALISMA_TABS: { key: CalismaTab; label: string }[] = [
  { key: 'bugun', label: 'Bugün aranacaklar' },
  { key: 'teklif', label: 'Teklif bekleyenler' },
  { key: 'tumu', label: 'Tümü' },
]

/**
 * Rol → varsayılan sekme. Satış (call-center + teklifçi aynı 'sales' rolünde) günlük
 * arama akışıyla ("Bugün aranacaklar") açılır; yöneticiler/operasyon tüm listeyi görür.
 * Rol sistemi call-center'ı teklifçiden ayırmadığı için kullanıcının son seçimi ayrıca
 * localStorage'da hatırlanır (bkz. tabStorageKey) — bu yalnızca ilk açılış varsayılanıdır.
 */
export function defaultTabForRole(roleKey: string | null | undefined): CalismaTab {
  switch (roleKey) {
    case 'sales':
      return 'bugun'
    default:
      // owner / admin / manager / operations / finance / viewer / bilinmeyen
      return 'tumu'
  }
}

/** Kullanıcı bazlı "son seçilen sekme" localStorage anahtarı. */
export function tabStorageKey(userId: string | null | undefined): string {
  return `calisma:tab:${userId ?? 'anon'}`
}

/** Kayıtlı sekme değerini doğrula (bozuk/eski değerlere düşme). */
export function parseTab(value: string | null): CalismaTab | null {
  return value === 'bugun' || value === 'teklif' || value === 'tumu' ? value : null
}

/**
 * "Bekleme süresi" etiketi: verilen an (son temas / talep tarihi) ile şimdi arasındaki
 * süre — call-center için "ne zamandır dokunulmadı" göstergesi. Geçmiş tarih beklenir;
 * gelecek/negatif fark 0'a kırpılır. Kaynak yoksa "—".
 */
export function formatWaiting(fromIso: string | null, nowMs: number): string {
  if (!fromIso) return '—'
  const then = new Date(fromIso).getTime()
  if (Number.isNaN(then)) return '—'
  const mins = Math.floor(Math.max(0, nowMs - then) / 60000)
  if (mins < 1) return 'az önce'
  if (mins < 60) return `${mins} dk`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} sa`
  const days = Math.floor(hours / 24)
  return `${days} gün`
}

/**
 * Yan panel ok gezinmesi: geçerli indeksten bir sonraki/önceki satır indeksi.
 * Sınır dışında kalırsa (ilk satırda ↑, son satırda ↓) mevcut indeks korunur.
 * index < 0 (seçim yok) ise -1 döner.
 */
export function stepIndex(index: number, len: number, dir: 'prev' | 'next'): number {
  if (index < 0 || len <= 0) return -1
  const next = dir === 'prev' ? index - 1 : index + 1
  return next >= 0 && next < len ? next : index
}

/** Bekleme süresi eşiği geçtiyse (varsayılan 3 gün) vurgula — "uzun süredir temas yok". */
export function isStale(fromIso: string | null, nowMs: number, days = 3): boolean {
  if (!fromIso) return false
  const then = new Date(fromIso).getTime()
  if (Number.isNaN(then)) return false
  return nowMs - then >= days * 86_400_000
}
