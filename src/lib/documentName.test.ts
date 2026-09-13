import { describe, it, expect } from 'vitest'
import { asciiFold, toPascal, docTypeSlug, normalizeTasCode, buildDocumentFileName } from './documentName'

describe('asciiFold', () => {
  it('Türkçe harfleri ASCII karşılığına çevirir (büyük/küçük korunur)', () => {
    expect(asciiFold('çğıİöşü')).toBe('cgiIosu')
    expect(asciiFold('ÇĞÖŞÜ')).toBe('CGOSU')
    expect(asciiFold('İstanbul')).toBe('Istanbul')
    expect(asciiFold('Işık')).toBe('Isik')
  })
  it('Avrupa aksanlarını da katlar', () => {
    expect(asciiFold('José Müller')).toBe('Jose Muller')
  })
})

describe('toPascal', () => {
  it('boşluk ve noktalamayı kaldırır, kelime başlarını büyütür', () => {
    expect(toPascal('Polat Çetiner')).toBe('PolatCetiner')
    expect(toPascal('ABC Tekstil A.Ş.')).toBe('AbcTekstilAS')
    expect(toPascal('  fazla   boşluk ')).toBe('FazlaBosluk')
  })
  it('boş/anlamsız girdide boş döner', () => {
    expect(toPascal('   ')).toBe('')
    expect(toPascal('...')).toBe('')
  })
})

describe('docTypeSlug', () => {
  it('bilinen türleri okunur jetona çevirir', () => {
    expect(docTypeSlug('fiyat_teklifi')).toBe('FiyatTeklifi')
    expect(docTypeSlug('siparis_onay')).toBe('SiparisOnay')
    expect(docTypeSlug('siparis_formu')).toBe('SiparisFormu')
    expect(docTypeSlug('numune_etiketi')).toBe('NumuneEtiketi')
    expect(docTypeSlug('koli_ustu')).toBe('KoliUstu')
  })
  it('bilinmeyen türü PascalCase yapar', () => {
    expect(docTypeSlug('yeni_belge')).toBe('YeniBelge')
  })
})

describe('normalizeTasCode', () => {
  it('6 karakterlik çıplak gövdeyi TAS- ile öne alır', () => {
    expect(normalizeTasCode('XCVWME')).toBe('TAS-XCVWME')
  })
  it('tam kodu olduğu gibi bırakır', () => {
    expect(normalizeTasCode('TAS-XCVWME')).toBe('TAS-XCVWME')
  })
})

describe('buildDocumentFileName', () => {
  it('müşteri adı + belge türü', () => {
    expect(buildDocumentFileName({ typeKey: 'fiyat_teklifi', customerName: 'Polat Çetiner' }))
      .toBe('PolatCetiner-FiyatTeklifi.pdf')
  })
  it('müşteri yoksa talep kodu kullanılır', () => {
    expect(buildDocumentFileName({ typeKey: 'fiyat_teklifi', customerName: null, operationCode: 'TAS-XCVWME' }))
      .toBe('TAS-XCVWME-FiyatTeklifi.pdf')
    expect(buildDocumentFileName({ typeKey: 'koli_ustu', operationCode: 'ABCDEF' }))
      .toBe('TAS-ABCDEF-KoliUstu.pdf')
  })
  it('müşteri kodu boşsa müşteriyi tercih eder', () => {
    expect(buildDocumentFileName({ typeKey: 'siparis_onay', customerName: 'Işık Tekstil', operationCode: 'TAS-000001' }))
      .toBe('IsikTekstil-SiparisOnay.pdf')
  })
  it('ikisi de yoksa Belge', () => {
    expect(buildDocumentFileName({ typeKey: 'numune_etiketi' })).toBe('Belge-NumuneEtiketi.pdf')
  })
})
