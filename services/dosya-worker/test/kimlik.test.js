import { describe, it, expect } from 'vitest'
import { cerezOku, cerezYaz, CEREZ_ADI } from '../src/kimlik.js'

describe('cerezOku', () => {
  it('çerezi çoklu değer içinden ayıklar', () => {
    const r = new Request('https://d.test/', {
      headers: { cookie: `baska=1; ${CEREZ_ADI}=JETON123; ucuncu=2` },
    })
    expect(cerezOku(r)).toBe('JETON123')
  })

  it('çerez yoksa null döner', () => {
    expect(cerezOku(new Request('https://d.test/'))).toBeNull()
  })

  it('başka çerez varken yanlış eşleşme yapmaz', () => {
    const r = new Request('https://d.test/', {
      headers: { cookie: `on_${CEREZ_ADI}=YANLIS` },
    })
    expect(cerezOku(r)).toBeNull()
  })
})

describe('cerezYaz', () => {
  it('güvenlik bayraklarını koyar', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const d = cerezYaz('JETON', exp)
    expect(d).toContain(`${CEREZ_ADI}=JETON`)
    expect(d).toContain('HttpOnly')
    expect(d).toContain('Secure')
    expect(d).toContain('SameSite=Lax')
    expect(d).toContain('Path=/')
    expect(d).toMatch(/Max-Age=\d+/)
  })

  it('süresi geçmiş jeton için Max-Age=0 verir', () => {
    const d = cerezYaz('JETON', Math.floor(Date.now() / 1000) - 5)
    expect(d).toContain('Max-Age=0')
  })
})
