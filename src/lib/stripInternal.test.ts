import { describe, it, expect } from 'vitest'
import { stripInternal } from './stripInternal'

// Derin tarama: çıktının HERHANGİ bir seviyesinde yasak anahtar kaldı mı?
// Bu test kırılırsa → sızıntı geri gelmiş demektir (iç içe maliyet/marj müşteriye gidiyor).
const FORBIDDEN = ['internalNote', 'marj', 'maliyet', 'maliyetItems', 'kar', 'kazanc', 'unit_cost', 'margin', 'margin_percent', 'cost', 'profit']
function firstForbiddenKey(v: unknown): string | null {
  if (Array.isArray(v)) { for (const x of v) { const h = firstForbiddenKey(x); if (h) return h } return null }
  if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (k === 'internalNote' || k.startsWith('_') || FORBIDDEN.includes(k)) return k
      const h = firstForbiddenKey(val); if (h) return h
    }
  }
  return null
}

describe('stripInternal — özyinelemeli sızıntı koruması (PAKET F1)', () => {
  // İç içe maliyet/marj: üst düzey, opsiyon dizisi, ürün→kademe (3 seviye).
  const payload = {
    tkS: {
      musteri: 'Ada Tekstil', para: 'USD',
      _maliyet: 123.45, _marj: 40,
      opts: [
        { detay: 'Takım', kumas: 'Keten', adet: '200', birim: '18', oner: true, _maliyet: 12.5, _marj: 44, marj: 44, maliyet: 12.5 },
        { detay: 'Alt', adet: '500', birim: '22', unit_cost: 15, margin_percent: 46, profit: 3500 },
      ],
      urunler: [
        { urun: 'Bluz', kademeler: [{ adet: 50, birim: '20', tutar: 1000, marj: 40, _maliyet: 14, cost: 14 }] },
      ],
    },
    internalNote: 'gizli ekip notu',
    _taxOptions: [0, 10, 20],
  }
  const out = stripInternal(payload)

  it('hiçbir seviyede yasak anahtar kalmaz', () => {
    expect(firstForbiddenKey(out)).toBeNull()
  })

  it('müşteriye giden alanlar korunur', () => {
    const tkS = out.tkS as Record<string, unknown>
    const opts = tkS.opts as Record<string, unknown>[]
    const urunler = tkS.urunler as { kademeler: Record<string, unknown>[] }[]
    expect(tkS.musteri).toBe('Ada Tekstil')
    expect(opts[0]!.birim).toBe('18')
    expect(opts[0]!.oner).toBe(true)
    expect(opts[0]!.kumas).toBe('Keten')
    expect(urunler[0]!.kademeler[0]!.tutar).toBe(1000)
  })

  it('internalNote ve _-önekli alanlar üst düzeyde silinir', () => {
    expect('internalNote' in out).toBe(false)
    expect('_taxOptions' in out).toBe(false)
  })

  it('maliyet değerleri ve gizli metin çıktı JSON’unda hiç geçmez', () => {
    const json = JSON.stringify(out)
    expect(json).not.toContain('12.5')        // opsiyon birim maliyeti
    expect(json).not.toContain('123.45')      // üst maliyet
    expect(json).not.toContain('3500')        // profit
    expect(json).not.toContain('gizli ekip notu')
    expect(json).not.toContain('maliyet')
    expect(json).not.toContain('marj')
  })
})
