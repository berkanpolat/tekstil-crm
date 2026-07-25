import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn', () => {
  it('sinif adlarini birlestirir', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('kosullu (falsy) degerleri atlar', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b')
  })

  it('cakisan tailwind siniflarinda sonuncuyu kazandirir', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })
})
