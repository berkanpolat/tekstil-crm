import { describe, it, expect } from 'vitest'
import { stripInternal } from '@/hooks/useDocuments'
import { parseSizes, sizesText, normalizeForRender } from '@/pages/documents/editorForms'

// QA#10 — iç not + editör-içi (_ önekli) alanlar render/preview verisinden AYIKLANIR.
describe('stripInternal (QA#10 iç not sızıntı koruması)', () => {
  it('internalNote alanını çıkarır', () => {
    const out = stripInternal({ tkS: { musteri: 'ACME' }, internalNote: 'GİZLİ EKİP NOTU' })
    expect(out).not.toHaveProperty('internalNote')
    expect(out).toHaveProperty('tkS')
  })
  it('_ önekli editör-içi alanları çıkarır', () => {
    const out = stripInternal({ tkS: {}, _taxOptions: [10, 20], _search: 'x' })
    expect(out).not.toHaveProperty('_taxOptions')
    expect(out).not.toHaveProperty('_search')
  })
  it('render alanlarını korur', () => {
    const out = stripInternal({ tkS: { not: 'müşteri notu' }, uretici: { name: 'X' } })
    expect(out.tkS).toEqual({ not: 'müşteri notu' })
    expect(out.uretici).toEqual({ name: 'X' })
  })
})

// Sipariş Formu bedenler alanı — ham metin; ayraç ";" gidiş-dönüşte silinmemeli.
describe('Sipariş Formu bedenler (ayraç regresyonu)', () => {
  it('REGRESYON: yazılan ayraç kaybolmaz — sondaki ";" korunur', () => {
    // Eski hata: value={bedenler.join('; ')} + onChange filter(Boolean) →
    // "40;" yazınca boş son eleman atılır, ";" bir sonraki render'da silinirdi.
    // Yeni model: ham metin doğrudan tutulur, ayraç yazılabilir.
    expect(sizesText({ bedenlerText: '40;' })).toBe('40;')
    expect(sizesText({ bedenlerText: '40; ' })).toBe('40; ')
    expect(sizesText({ bedenlerText: '40; 41; ' })).toBe('40; 41; ')
  })

  it('parseSizes: noktalı virgülle böler, ondalık bedeni (40,5) korur', () => {
    expect(parseSizes('40; 40,5; 41')).toEqual(['40', '40,5', '41'])
    expect(parseSizes('XS; S; M')).toEqual(['XS', 'S', 'M'])
    expect(parseSizes('')).toEqual([])
    expect(parseSizes('  40 ;;  41  ')).toEqual(['40', '41']) // boş segment atılır
  })

  it('sizesText: eski dizi biçimli belgelerde metne düşer (geriye uyumluluk)', () => {
    expect(sizesText({ bedenler: ['XS', 'S', 'M'] })).toBe('XS; S; M')
    expect(sizesText({})).toBe('')
    // bedenlerText öncelikli
    expect(sizesText({ bedenlerText: '40; 41', bedenler: ['XS'] })).toBe('40; 41')
  })

  it('normalizeForRender: diziye YALNIZ çıkışta çevirir (PDF servisi sip.bedenler alır)', () => {
    const out = normalizeForRender('siparis_formu', { sip: { bedenlerText: '40; 40,5; 41' } })
    expect(out.sip.bedenler).toEqual(['40', '40,5', '41'])
    // eski belge (yalnız dizi) da çalışır
    const legacy = normalizeForRender('siparis_formu', { sip: { bedenler: ['XS', 'S'] } })
    expect(legacy.sip.bedenler).toEqual(['XS', 'S'])
  })
})
