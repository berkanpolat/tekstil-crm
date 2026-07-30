import { describe, it, expect } from 'vitest'
import { stripInternal } from '@/hooks/useDocuments'

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
