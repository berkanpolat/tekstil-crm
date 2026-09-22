// Genel Rapor v2 — huni satırı yardımcıları (SAF; React/DOM yok; birim testli).
// Düşük veri kuralı: payda < minBase ise oran gösterilmez ("—"), satır soluk basılır.
import type { HuniSatiri } from '@/hooks/useMetrics'

const fmt1 = (v: number) => v.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Oran metni: pay/payda → "%12,5"; payda < minBase ya da 0 → "—". */
export function oranMetni(pay: number, payda: number, minBase: number): string {
  if (!payda || payda < minBase) return '—'
  return `%${fmt1((100 * pay) / payda)}`
}

/** Satırın talep sayısı eşiğin altındaysa oranları anlamsızdır. */
export function dusukVeri(row: Pick<HuniSatiri, 'talep'>, minBase: number): boolean {
  return row.talep < minBase
}

/** Önceki döneme göre değişim metni. Önceki payda küçükse "—". */
export function deltaMetni(cur: number, prev: number, minBase: number): string {
  if (prev < minBase) return prev === 0 && cur === 0 ? '—' : `önceki: ${prev}`
  const pct = ((cur - prev) / prev) * 100
  const ok = Math.abs(pct) < 0.05 ? '=' : pct > 0 ? '▲' : '▼'
  return `${ok} %${fmt1(Math.abs(pct))} (önceki eşit dönem: ${prev})`
}

/** Sayaçları toplar, oranları yeniden hesaplar; saat ortalamaları talep ağırlıklı. */
export function toplamSatiri(rows: HuniSatiri[]): HuniSatiri {
  const sum = (k: keyof HuniSatiri) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0)
  const talep = sum('talep'), onceki = sum('onceki_talep'), teklif = sum('teklif'), numune = sum('numune'),
    siparis = sum('siparis'), reddedilen = sum('reddedilen'), bekleyen = sum('bekleyen'), gecersiz = sum('gecersiz'),
    slaMet = sum('sla_met'), slaMissed = sum('sla_missed')
  const agirlikli = (k: 'ilk_yanit_saat' | 'teklif_yanit_saat') => {
    const w = rows.filter((r) => r[k] != null && r.talep > 0)
    const top = w.reduce((a, r) => a + r.talep, 0)
    return top ? w.reduce((a, r) => a + (r[k] as number) * r.talep, 0) / top : null
  }
  const oran = (a: number, b: number) => (b > 0 ? Math.round((1000 * a) / b) / 10 : null)
  return {
    key: '__toplam', label: 'Toplam', talep, onceki_talep: onceki,
    degisim_pct: onceki > 0 ? Math.round((1000 * (talep - onceki)) / onceki) / 10 : null,
    teklif, teklif_orani: oran(teklif, talep), numune, numune_orani: oran(numune, teklif),
    siparis, siparis_orani: oran(siparis, talep), numune_siparis_orani: oran(siparis, numune),
    reddedilen, red_orani: oran(reddedilen, talep), bekleyen, gecersiz,
    ilk_yanit_saat: agirlikli('ilk_yanit_saat'), sla_orani: oran(slaMet, slaMet + slaMissed), sla_met: slaMet, sla_missed: slaMissed,
    teklif_yanit_saat: agirlikli('teklif_yanit_saat'),
  }
}

export type HuniSiraAnahtari = 'talep' | 'teklif' | 'numune' | 'siparis' | 'reddedilen' | 'siparis_orani' | 'red_orani' | 'ilk_yanit_saat' | 'sla_orani'
/** Sıralama: null'lar sona; dir 'desc' varsayılan. */
export function siralaHuni(rows: HuniSatiri[], key: HuniSiraAnahtari, dir: 'asc' | 'desc' = 'desc'): HuniSatiri[] {
  const m = dir === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const x = a[key], y = b[key]
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    return (Number(x) - Number(y)) * m || a.label.localeCompare(b.label, 'tr')
  })
}

export const HUNI_CSV_BASLIK = ['Bölüm', 'Kırılım', 'Talep', 'Önceki', 'Teklif', 'Teklif %', 'Numune', 'Sipariş', 'Sipariş %', 'Red', 'Red %', 'İlk yanıt (sa)', '24s %']
/** Geniş CSV satırları — oranlar ham sayı (Excel'de hesaplanabilsin), yoksa boş. */
export function huniCsvSatirlari(bolum: string, rows: HuniSatiri[]): (string | number)[][] {
  const n = (v: number | null) => (v == null ? '' : v)
  return rows.map((r) => [bolum, r.label, r.talep, r.onceki_talep, r.teklif, n(r.teklif_orani), r.numune, r.siparis, n(r.siparis_orani), r.reddedilen, n(r.red_orani), n(r.ilk_yanit_saat), n(r.sla_orani)])
}

/** Özet cümle için: en verimli (sipariş oranı) ve en sorunlu (red oranı) kanal; düşük veri satırları hariç. */
export function oneCikanKanallar(rows: HuniSatiri[], minBase: number): { enIyi: HuniSatiri | null; enKotu: HuniSatiri | null } {
  const g = rows.filter((r) => !dusukVeri(r, minBase) && r.key !== 'bilinmiyor' && r.key !== '__toplam')
  // Önce gerçekten sipariş üretmiş kanal; yoksa teklife dönüşümü en yüksek kanal (0 ise "en iyi" yok)
  const siparisli = siralaHuni(g.filter((r) => r.siparis > 0), 'siparis_orani')[0] ?? null
  const teklifli = siralaHuni(g.filter((r) => r.teklif > 0), 'teklif')[0] ?? null
  const enIyi = siparisli ?? (teklifli && (teklifli.teklif_orani ?? 0) > 0 ? teklifli : null)
  const enKotu = siralaHuni(g.filter((r) => r.reddedilen > 0), 'red_orani')[0] ?? null
  return { enIyi, enKotu: enKotu && enKotu.key !== enIyi?.key ? enKotu : null }
}
