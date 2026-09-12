import { describe, it, expect } from 'vitest'
import { KOLEKSIYON, icKodUret, esitle, raporOzeti, TUR_ES_ADLAR } from '../../scripts/katalog-ice-aktar-esleme.mjs'

const SOZLUK = {
  // etiket → id listesi (çift kayıtlı etiketler birden fazla id taşır)
  turler: new Map([['Elbise', [11]], ['Gömlek', [12, 99]], ['T-Shirt', [21]]]),
  kumaslar: new Map([['Pamuk Keten', [5]]]),
}

describe('KOLEKSIYON', () => {
  it('üç koleksiyonu sabit eşler', () => {
    expect(KOLEKSIYON).toEqual({ tesettur: 7, casual: 8, premium: 9 })
  })
})

describe('icKodUret', () => {
  it('YS- öneki ve 6 karakter üretir', () => {
    expect(icKodUret(new Set())).toMatch(/^YS-[A-Z0-9]{6}$/)
  })
  it('mevcut kodla çakışmaz', () => {
    const hepsi = new Set()
    for (let i = 0; i < 200; i++) hepsi.add(icKodUret(hepsi))
    expect(hepsi.size).toBe(200)
  })
})

describe('esitle', () => {
  const urun = { name: 'Test Elbise', slug: 'test-elbise', code: 'TES-ELB-001',
                 cat: 'tesettur', type: 'Elbise', fabric: 'Pamuk Keten' }

  it('tam eşleşen ürünü hazırlar', () => {
    const r = esitle(urun, SOZLUK)
    expect(r.ok).toBe(true)
    expect(r.kayit).toMatchObject({
      name: 'Test Elbise', slug: 'test-elbise', site_code: 'TES-ELB-001',
      collection_id: 7, category_id: 11, fabric_type_id: 5,
    })
  })

  it('CRM’de olmayan kumaşı EKSİK olarak bildirir, uydurmaz', () => {
    const r = esitle({ ...urun, fabric: 'İpek Saten' }, SOZLUK)
    expect(r.ok).toBe(false)
    expect(r.eksik).toEqual([{ alan: 'kumas', deger: 'İpek Saten' }])
  })

  it('çift kayıtlı tür etiketini BELİRSİZ sayar', () => {
    const r = esitle({ ...urun, type: 'Gömlek' }, SOZLUK)
    expect(r.ok).toBe(false)
    expect(r.eksik).toEqual([{ alan: 'tur', deger: 'Gömlek', adaylar: [12, 99] }])
  })

  it('bilinmeyen koleksiyonu eksik sayar', () => {
    const r = esitle({ ...urun, cat: 'yok' }, SOZLUK)
    expect(r.ok).toBe(false)
    expect(r.eksik[0].alan).toBe('koleksiyon')
  })

  it('birden çok eksiği birlikte bildirir', () => {
    const r = esitle({ ...urun, fabric: 'Jarse', cat: 'yok' }, SOZLUK)
    expect(r.eksik).toHaveLength(2)
  })

  it('eş adı olan türü CRM etiketiyle eşler (Tişört → T-Shirt)', () => {
    const r = esitle({ ...urun, type: 'Tişört' }, SOZLUK)
    expect(r.ok).toBe(true)
    expect(r.kayit.category_id).toBe(21)
  })
})

describe('esitle — kumassizKabul seçeneği', () => {
  const urun = { name: 'Test Elbise', slug: 'test-elbise', code: 'TES-ELB-001',
                 cat: 'tesettur', type: 'Elbise', fabric: 'Pamuk Keten' }

  it('varsayılan davranış DEĞİŞMEZ: seçenek verilmezse kumaş eksikliği ok:false yapar', () => {
    const r = esitle({ ...urun, fabric: 'İpek Saten' }, SOZLUK)
    expect(r.ok).toBe(false)
  })

  it('seçenek açıkken YALNIZ kumaş eksikse ürün ok:true, fabric_type_id null döner', () => {
    const r = esitle({ ...urun, fabric: 'İpek Saten' }, SOZLUK, { kumassizKabul: true })
    expect(r.ok).toBe(true)
    expect(r.kayit.fabric_type_id).toBeNull()
    expect(r.kayit).toMatchObject({ collection_id: 7, category_id: 11 })
  })

  it('seçenek açıkken çift kayıtlı (belirsiz) kumaş da kumassız kabul edilir', () => {
    const sozlukCift = { ...SOZLUK, kumaslar: new Map([...SOZLUK.kumaslar, ['Saten', [1, 2]]]) }
    const r = esitle({ ...urun, fabric: 'Saten' }, sozlukCift, { kumassizKabul: true })
    expect(r.ok).toBe(true)
    expect(r.kayit.fabric_type_id).toBeNull()
  })

  it('seçenek açık olsa da BAŞKA bir alan (tür) eksikse ürün yine ok:false', () => {
    const r = esitle({ ...urun, fabric: 'İpek Saten', type: 'Yok Böyle Tür' }, SOZLUK, { kumassizKabul: true })
    expect(r.ok).toBe(false)
    expect(r.eksik.map((e) => e.alan)).toContain('tur')
  })

  it('seçenek açık olsa da koleksiyon eksikse ürün yine ok:false', () => {
    const r = esitle({ ...urun, fabric: 'İpek Saten', cat: 'yok' }, SOZLUK, { kumassizKabul: true })
    expect(r.ok).toBe(false)
  })
})

describe('TUR_ES_ADLAR', () => {
  it('yalnız bilinen yazım farklarını taşır', () => {
    expect(TUR_ES_ADLAR).toEqual({ 'Tişört': 'T-Shirt' })
  })
})

describe('raporOzeti', () => {
  it('sayıları doğru toplar', () => {
    const s = [
      { ok: true }, { ok: true },
      { ok: false, eksik: [{ alan: 'kumas', deger: 'Jarse' }] },
      { ok: false, eksik: [{ alan: 'tur', deger: 'Gömlek' }] },
    ]
    expect(raporOzeti(s)).toEqual({ toplam: 4, hazir: 2, eksikKumas: 1, belirsizTur: 1 })
  })
})
