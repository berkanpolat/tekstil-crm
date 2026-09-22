import { describe, it, expect } from 'vitest'
import { oranMetni, dusukVeri, deltaMetni, toplamSatiri, siralaHuni, huniCsvSatirlari, oneCikanKanallar } from './reportFunnel'
import type { HuniSatiri } from '@/hooks/useMetrics'

const satir = (p: Partial<HuniSatiri> & { key: string; label: string; talep: number }): HuniSatiri => ({
  onceki_talep: 0, degisim_pct: null, teklif: 0, teklif_orani: null, numune: 0, numune_orani: null, siparis: 0, siparis_orani: null,
  numune_siparis_orani: null, reddedilen: 0, red_orani: null, bekleyen: 0, gecersiz: 0, ilk_yanit_saat: null, sla_orani: null,
  sla_met: 0, sla_missed: 0, teklif_yanit_saat: null, ...p,
})

describe('oranMetni / dusukVeri', () => {
  it('payda eşiğin altındaysa —', () => { expect(oranMetni(1, 3, 5)).toBe('—'); expect(oranMetni(1, 0, 5)).toBe('—') })
  it('yüzdeyi tr biçiminde basar', () => { expect(oranMetni(1, 8, 5)).toBe('%12,5'); expect(oranMetni(5, 5, 5)).toBe('%100,0') })
  it('düşük veri satırı', () => { expect(dusukVeri({ talep: 4 }, 5)).toBe(true); expect(dusukVeri({ talep: 5 }, 5)).toBe(false) })
})

describe('deltaMetni', () => {
  it('yükseliş/düşüş/eşit', () => {
    expect(deltaMetni(60, 40, 5)).toMatch(/^▲ %50,0/)
    expect(deltaMetni(20, 40, 5)).toMatch(/^▼ %50,0/)
    expect(deltaMetni(40, 40, 5)).toMatch(/^= /)
  })
  it('önceki payda küçükse yüzde vermez', () => { expect(deltaMetni(10, 2, 5)).toBe('önceki: 2'); expect(deltaMetni(0, 0, 5)).toBe('—') })
})

describe('toplamSatiri', () => {
  const rows = [
    satir({ key: 'a', label: 'A', talep: 10, teklif: 5, numune: 2, siparis: 1, reddedilen: 3, onceki_talep: 8, ilk_yanit_saat: 2, sla_met: 4, sla_missed: 1 }),
    satir({ key: 'b', label: 'B', talep: 30, teklif: 15, numune: 3, siparis: 3, reddedilen: 6, onceki_talep: 12, ilk_yanit_saat: 6, sla_met: 10, sla_missed: 5 }),
  ]
  const t = toplamSatiri(rows)
  it('sayaçları toplar, oranları yeniden hesaplar', () => {
    expect(t.talep).toBe(40); expect(t.teklif_orani).toBe(50); expect(t.siparis_orani).toBe(10); expect(t.numune_orani).toBe(25)
    expect(t.red_orani).toBe(22.5); expect(t.sla_orani).toBe(70); expect(t.degisim_pct).toBe(100)
  })
  it('saat ortalaması talep ağırlıklı', () => { expect(t.ilk_yanit_saat).toBe(5) })
  it('boş listede sıfır ve null', () => { const e = toplamSatiri([]); expect(e.talep).toBe(0); expect(e.teklif_orani).toBeNull(); expect(e.ilk_yanit_saat).toBeNull() })
})

describe('siralaHuni', () => {
  const rows = [satir({ key: 'a', label: 'A', talep: 3, siparis_orani: null }), satir({ key: 'b', label: 'B', talep: 9, siparis_orani: 10 }), satir({ key: 'c', label: 'C', talep: 9, siparis_orani: 2 })]
  it('desc; null sona; eşitlikte ada göre', () => {
    expect(siralaHuni(rows, 'talep').map((r) => r.key)).toEqual(['b', 'c', 'a'])
    expect(siralaHuni(rows, 'siparis_orani').map((r) => r.key)).toEqual(['b', 'c', 'a'])
    expect(siralaHuni(rows, 'siparis_orani', 'asc').map((r) => r.key)).toEqual(['c', 'b', 'a'])
  })
})

describe('huniCsvSatirlari', () => {
  it('13 sütun, oran null → boş', () => {
    const r = huniCsvSatirlari('Kanal', [satir({ key: 'a', label: 'Meta', talep: 7, teklif: 3, teklif_orani: 42.9 })])
    expect(r[0]).toHaveLength(13); expect(r[0]![0]).toBe('Kanal'); expect(r[0]![5]).toBe(42.9); expect(r[0]![12]).toBe('')
  })
})

describe('oneCikanKanallar', () => {
  it('bilinmiyor ve düşük veri hariç; en iyi ≠ en kötü', () => {
    const rows = [
      satir({ key: 'bilinmiyor', label: 'Bilinmiyor', talep: 100, siparis: 50, siparis_orani: 50, reddedilen: 90, red_orani: 90 }),
      satir({ key: 'search', label: 'Arama', talep: 20, siparis: 2, siparis_orani: 10, reddedilen: 6, red_orani: 30 }),
      satir({ key: 'meta', label: 'Meta', talep: 20, siparis: 1, siparis_orani: 2, reddedilen: 12, red_orani: 60 }),
      satir({ key: 'tiktok', label: 'TikTok', talep: 2, siparis: 2, siparis_orani: 100, red_orani: 0 }),
    ]
    const o = oneCikanKanallar(rows, 5)
    expect(o.enIyi?.key).toBe('search'); expect(o.enKotu?.key).toBe('meta')
  })
  it('tek kanal → en kötü yok', () => { const o = oneCikanKanallar([satir({ key: 'search', label: 'A', talep: 9, siparis: 1, siparis_orani: 11, reddedilen: 4, red_orani: 44 })], 5); expect(o.enKotu).toBeNull() })
  it('sipariş yoksa teklife dönüşüm; o da sıfırsa en iyi yok', () => {
    const rows = [satir({ key: 'search', label: 'A', talep: 20, teklif: 8, teklif_orani: 40 }), satir({ key: 'meta', label: 'B', talep: 20, teklif: 2, teklif_orani: 10 })]
    expect(oneCikanKanallar(rows, 5).enIyi?.key).toBe('search')
    expect(oneCikanKanallar([satir({ key: 'search', label: 'A', talep: 20 })], 5).enIyi).toBeNull()
  })
})
