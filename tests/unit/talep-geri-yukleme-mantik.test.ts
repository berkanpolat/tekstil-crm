// @ts-nocheck — .mjs betik modülü, tip bildirimi yok (katalogIceAktarYardimci.test.ts ile aynı durum)
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
  telNorm, telE164, urunleriAyir, payloadKur, kopyalariAyikla,
  eskiKodBul, surecTakipEsle, studioEksikleri, DURUM_YOL, kullaniciEposta,
} from '../../scripts/talep-geri-yukleme/mantik.mjs'

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex')

describe('telefon', () => {
  it('üç yazımı tek biçime indirger', () => {
    expect(telNorm('0532 725 12 15')).toBe('5327251215')
    expect(telNorm('+90 532 725 12 15')).toBe('5327251215')
    expect(telNorm('5327251215')).toBe('5327251215')
    expect(telE164('0532 725 12 15')).toBe('+905327251215')
    expect(telE164('')).toBeNull()
  })
})

describe('urunleriAyir', () => {
  it('lead.php dizgisini koda/ada ayırır, renk sayısını okur', () => {
    const r = urunleriAyir('PRM-TNK-004 Katmanlı Anvelop Lyocell Tunik (2 renk), ST-26SS290001 Erkek Oversize Gömlek')
    expect(r).toEqual([
      { code: 'PRM-TNK-004', name: 'Katmanlı Anvelop Lyocell Tunik', renk: 2 },
      { code: 'ST-26SS290001', name: 'Erkek Oversize Gömlek' },
    ])
  })
  it('ürün adındaki virgülde bölmez', () => {
    const r = urunleriAyir('PRM-ELB-005 Büzgülü, Uzun Kollu Elbise (2 renk)')
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe('Büzgülü, Uzun Kollu Elbise')
  })
  it('boş girdi → boş dizi', () => {
    expect(urunleriAyir('')).toEqual([])
    expect(urunleriAyir(undefined)).toEqual([])
  })
})

describe('payloadKur', () => {
  it('client_reference lead.php kalıbında: ts-sha1(tel)[0:8]', () => {
    const b = { ts: '2026-09-08T10:13:21+00:00', phone: '0532 725 12 15', name: 'X', mode: 'catalog', products: '' }
    const p = payloadKur(b, sha1)
    expect(p.client_reference).toBe(`2026-09-08T10:13:21+00:00-${sha1('0532 725 12 15').slice(0, 8)}`)
    expect(p.selected_products).toEqual([])
  })
})

describe('kopyalariAyikla', () => {
  it('aynı telefon + 3 dk + aynı içerik → kopya', () => {
    const a = { ts: '2026-09-01T10:00:00+00:00', phone: '5321', products: 'A', image: null }
    const b = { ts: '2026-09-01T10:01:00+00:00', phone: '5321', products: 'A', image: null }
    const c = { ts: '2026-09-01T10:01:30+00:00', phone: '5321', products: 'B', image: null }
    const { tekil, kopya } = kopyalariAyikla([b, a, c])
    expect(tekil.map((x) => x.ts)).toEqual([a.ts, c.ts])
    expect(kopya).toHaveLength(1)
  })
})

describe('eskiKodBul', () => {
  it('audit satırını client_reference ile bulur', () => {
    const b = { ts: '2026-08-13T10:07:50+00:00', phone: '5300000001' }
    const ref = `2026-08-13T10:07:50+00:00-${sha1('5300000001').slice(0, 8)}`
    const ops = [{ code: 'TAS-PUCVAC', client_reference: ref }, { code: 'TAS-BASKA', client_reference: '2026-08-13T10:07:50+00:00-deadbeef' }]
    expect(eskiKodBul(b, ops, sha1)?.code).toBe('TAS-PUCVAC')
  })
})

describe('surecTakipEsle', () => {
  const L = [
    { id: 'r1', date: '2026-09-10', customers: { phone: '05434122965' } },
    { id: 'r2', date: '2026-09-20', customers: { phone: '05434122965' } },
    { id: 'r3', date: '2026-09-10', customers: { phone: '05000000000' } },
  ]
  it('telefon eşit ve tarihi en yakın kaydı seçer', () => {
    const b = { ts: '2026-09-09T18:00:00+00:00', phone: '543 412 29 65' }
    expect(surecTakipEsle(b, L)?.id).toBe('r1')
  })
  it('bir kaydı iki kez vermez', () => {
    const k = new Set<string>()
    surecTakipEsle({ ts: '2026-09-09T18:00:00+00:00', phone: '5434122965' }, L, k)
    expect(surecTakipEsle({ ts: '2026-09-09T19:00:00+00:00', phone: '5434122965' }, L, k)).toBeNull()
  })
  it('7 günden uzak → eşleşme yok', () => {
    expect(surecTakipEsle({ ts: '2026-08-01T00:00:00+00:00', phone: '5434122965' }, L)).toBeNull()
  })
})

describe('studioEksikleri', () => {
  it('B\'de olmayan telefonu B biçimine çevirir', () => {
    const s = [{
      full_name: 'Rabia', phone: '0532 725 12 15', email: null, source: 'yeni-lp',
      created_at: '2026-09-20 19:20:45.395425+00',
      notes: 'Şehir: Ankara\nTalep tipi: Katalogdan Seç\nSeçilen ürünler: Tunik (PRM-TNK-004), Elbise (PRM-ELB-005)\nNot: 20 adet',
    }]
    const out = studioEksikleri([{ phone: '5000000000' }], s)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ city: 'Ankara', mode: 'catalog', note: '20 adet', products: 'PRM-TNK-004 Tunik, PRM-ELB-005 Elbise' })
    expect(out[0].ts.startsWith('2026-09-20T19:20:45')).toBe(true)
  })
  it('B\'de olan telefonu atlar', () => {
    expect(studioEksikleri([{ phone: '0532 725 12 15' }], [{ phone: '5327251215', notes: '', created_at: '2026-09-20 00:00:00+00' }])).toEqual([])
  })
})

describe('sözlükler', () => {
  it('8 Süreç Takip durumu → CRM durum yolu', () => {
    expect(Object.keys(DURUM_YOL)).toHaveLength(8)
    expect(DURUM_YOL['Teklif reddedildi']).toEqual({ durumlar: ['st_teklif_iletildi'], asama: 'teklif_reddedildi' })
    expect(DURUM_YOL['Teklif bekliyor'].durumlar).toEqual([])
    // her yol st_teklif_iletildi ile başlar (st_teklif_bekliyor'dan tek izinli geçiş)
    for (const y of Object.values(DURUM_YOL)) if (y.durumlar.length) expect(y.durumlar[0]).toBe('st_teklif_iletildi')
  })
  it('profil adı → e-posta', () => {
    expect(kullaniciEposta('affan.ergul')).toBe('affan.ergul@tekstilas.com')
    expect(kullaniciEposta('tunacardak')).toBeNull()
  })
})

import { testMi } from '../../scripts/talep-geri-yukleme/mantik.mjs'
describe('testMi', () => {
  it('personel ve otomasyon kayıtlarını yakalar', () => {
    expect(testMi({ name: 'TEST Kasa Online', note: '' })).toBe(true)
    expect(testMi({ name: 'tuna çardak', note: 'net test 1' })).toBe(true)
    expect(testMi({ name: 'Hakan Gökçe Akgün', note: 'deneme' })).toBe(true)
    expect(testMi({ name: 'Ali Veli', note: 'merhaba deneme' })).toBe(true)
    expect(testMi({ name: 'TEST WA kanca', note: 'Deploy sonrası kanca testi, dikkate almayın' })).toBe(true)
  })
  it('gerçek müşterinin uzun notunu test saymaz', () => {
    expect(testMi({ name: 'Arda Karakaş', note: 'Deneme olarak olucak ilk drop. Ön bilgi almak istiyorum' })).toBe(false)
    expect(testMi({ name: 'Anıl taş', note: 'Ürünü test etmek istiyorum bu yüzden minimum adette' })).toBe(false)
    expect(testMi({ name: 'Rabia Özyurt', note: '' })).toBe(false)
  })
})
