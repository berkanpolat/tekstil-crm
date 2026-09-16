import { describe, it, expect } from 'vitest'
import { phoneError, emailError } from './phone'

describe('phoneError', () => {
  it('boş değeri geçerli sayar (opsiyonel alan)', () => {
    expect(phoneError('')).toBeNull()
    expect(phoneError('   ')).toBeNull()
    expect(phoneError(null)).toBeNull()
    expect(phoneError(undefined)).toBeNull()
  })

  it('tam TR numarasını kabul eder', () => {
    expect(phoneError('+905321234567')).toBeNull()
    expect(phoneError('0532 123 45 67')).toBeNull()
  })

  it('eksik haneli TR numarasını reddeder', () => {
    expect(phoneError('+9053212345')).not.toBeNull()
    expect(phoneError('0532 123')).not.toBeNull()
  })

  it('çözülemeyen girdiyi reddeder', () => {
    expect(phoneError('abc')).not.toBeNull()
  })

  it('geçerli yurt dışı numarasını kabul eder', () => {
    expect(phoneError('+14155552671')).toBeNull()
  })
})

describe('emailError', () => {
  it('boş değeri geçerli sayar', () => {
    expect(emailError('')).toBeNull()
    expect(emailError(null)).toBeNull()
  })

  it('geçerli e-postayı kabul eder', () => {
    expect(emailError('a@b.com')).toBeNull()
    expect(emailError('  Ada@Firma.Com ')).toBeNull()
  })

  it('geçersiz biçimi reddeder', () => {
    expect(emailError('a@b')).not.toBeNull()
    expect(emailError('ab.com')).not.toBeNull()
    expect(emailError('a @b.com')).not.toBeNull()
  })
})
