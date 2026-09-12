import { describe, it, expect } from 'vitest'
import { anahtarla, kullanimaGoreTekille } from '../../scripts/katalog-ice-aktar.mjs'

// Bu iki fonksiyon 619 gerçek ürünün içe aktarımında KARAR VERİYOR —
// regresyona karşı birim testiyle korunuyor (inceleme bulgusu).

describe('anahtarla — Türkçe etiketten veritabanı anahtarı', () => {
  it('tek kelimeyi küçültüp Türkçe karakteri sadeleştirir', () => {
    expect(anahtarla('Hırka')).toBe('hirka')
  })

  it('birden çok kelimeyi alt çizgiyle birleştirir', () => {
    expect(anahtarla('Trençkot Gabardin')).toBe('trenckot_gabardin')
  })

  it('parantez ve sondaki ayracı atar (baştaki/sondaki _ kalmaz)', () => {
    expect(anahtarla('Şişme (Naylon)')).toBe('sisme_naylon')
  })

  it('İ/ı gibi büyük-küçük Türkçe harfleri doğru sadeleştirir', () => {
    expect(anahtarla('İpek Saten')).toBe('ipek_saten')
  })

  it('boş dizede çökmez, boş dize döner', () => {
    expect(anahtarla('')).toBe('')
  })
})

describe('kullanimaGoreTekille — çift kayıtlı etiketleri kullanıma göre tekiller', () => {
  it('tek satırlı etiket olduğu gibi kalır', () => {
    const sozluk = new Map([['Pamuk', [1]]])
    const sonuc = kullanimaGoreTekille(sozluk, new Set())
    expect(sonuc.get('Pamuk')).toEqual([1])
  })

  it('çok satırlının TAM BİRİ kullanımdaysa liste tek elemana iner', () => {
    const sozluk = new Map([['Polyester', [10, 11, 12]]])
    const kullanilan = new Set([11])
    const sonuc = kullanimaGoreTekille(sozluk, kullanilan)
    expect(sonuc.get('Polyester')).toEqual([11])
  })

  it('çok satırlının HİÇBİRİ kullanımda değilse liste OLDUĞU GİBİ kalır (belirsiz)', () => {
    const sozluk = new Map([['Saten', [20, 21]]])
    const kullanilan = new Set([99])
    const sonuc = kullanimaGoreTekille(sozluk, kullanilan)
    expect(sonuc.get('Saten')).toEqual([20, 21])
  })

  it('çok satırlının İKİSİ birden kullanımdaysa liste OLDUĞU GİBİ kalır (belirsiz, ">=1" DEĞİL "TAM 1")', () => {
    const sozluk = new Map([['Viskon', [30, 31]]])
    const kullanilan = new Set([30, 31])
    const sonuc = kullanimaGoreTekille(sozluk, kullanilan)
    // Kural ">=1" olsaydı bu 30 ya da 31'e tekilleşirdi — TAM OLARAK 1 kuralı
    // gereği belirsiz kalıp iki id'yi de korumalı.
    expect(sonuc.get('Viskon')).toEqual([30, 31])
  })

  it('boş sözlük çökmez, boş sonuç döner', () => {
    const sonuc = kullanimaGoreTekille(new Map(), new Set())
    expect(sonuc.size).toBe(0)
  })
})
