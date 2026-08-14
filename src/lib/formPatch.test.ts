import { describe, it, expect } from 'vitest'
import { patchSection } from './formPatch'

type Rec = Record<string, unknown>

describe('patchSection — fonksiyonel bölüm birleştirme', () => {
  it('aynı olayda art arda iki güncellemede İLKİNİN değeri korunur (regresyon: seçim yazılmıyordu)', () => {
    // CategorySelect'in onChange'i: grup seç + türü sıfırla (iki ardışık set).
    let state: Rec = { soS: { grup: '', tur: 'eski' } }
    const set = (u: (p: Rec) => Rec) => {
      state = u(state)
    }
    set(patchSection('soS', { grup: 'Kadın Üst Giyim' })) // onGrup
    set(patchSection('soS', { tur: '' })) // onTur — ilkini EZMEMELİ
    const soS = state.soS as Rec
    expect(soS.grup).toBe('Kadın Üst Giyim') // korundu
    expect(soS.tur).toBe('')
  })

  it('KARŞIT KANIT: snapshot tabanlı eski desen aynı hatada ilkini kaybederdi', () => {
    const s0 = { grup: '', tur: 'eski' }
    let data: Rec = { soS: s0 }
    // Eski hatalı up: her çağrı SABİT s0 snapshot'ından türer.
    const badUp = (patch: Rec) => {
      data = { ...data, soS: { ...s0, ...patch } }
    }
    badUp({ grup: 'X' })
    badUp({ tur: '' })
    expect((data.soS as Rec).grup).toBe('') // KAYIP — hatanın kanıtı
  })

  it('yalnız verilen anahtarları değiştirir, diğer alanları korur', () => {
    const state: Rec = { soS: { grup: 'A', tur: 'B', renk: 'C' } }
    const next = patchSection('soS', { tur: 'B2' })(state)
    expect(next.soS).toEqual({ grup: 'A', tur: 'B2', renk: 'C' })
  })

  it('bölüm henüz yoksa oluşturur', () => {
    const next = patchSection('order', { adet: 5 })({})
    expect(next.order).toEqual({ adet: 5 })
  })
})
