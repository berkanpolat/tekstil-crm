import { describe, it, expect } from 'vitest'
import { AppError, toUserMessage, ensureRows } from '@/lib/errors'

describe('toUserMessage', () => {
  it('AppError mesajını aynen döner', async () => {
    expect(await toUserMessage(new AppError('Özel mesaj'))).toBe('Özel mesaj')
  })

  it('42501 RLS (İngilizce jargon) → "yetkiniz yok"', async () => {
    const m = await toUserMessage({
      code: '42501',
      message: 'new row violates row-level security policy for table "users"',
    })
    expect(m).toBe('Bu işlem için yetkiniz yok.')
  })

  it('42501 özel Türkçe trigger mesajı → aynen gösterir', async () => {
    expect(await toUserMessage({ code: '42501', message: 'Kendi rolünüzü değiştiremezsiniz.' })).toBe(
      'Kendi rolünüzü değiştiremezsiniz.',
    )
  })

  it('23505 → tekrar eden değer mesajı', async () => {
    expect(await toUserMessage({ code: '23505', message: 'duplicate key' })).toContain('zaten kullanılıyor')
  })

  it('23503 → ilişkili kayıt mesajı', async () => {
    expect(await toUserMessage({ code: '23503', message: 'FK violation' })).toContain('ilişkili')
  })

  it('İngilizce jargonlu Error gizlenir (boş "hata oluştu" değil, anlamlı fallback)', async () => {
    expect(await toUserMessage(new Error('fetch failed'))).toBe('İşlem tamamlanamadı. Lütfen tekrar deneyin.')
  })

  it('Türkçe anlamlı Error mesajı korunur', async () => {
    expect(await toUserMessage(new Error('Şifre en az 8 karakter olmalı.'))).toBe('Şifre en az 8 karakter olmalı.')
  })
})

describe('ensureRows (sessiz RLS reddi tespiti)', () => {
  it('hata varsa fırlatır', () => {
    expect(() => ensureRows({ data: null, error: { code: '42501' } })).toThrow()
  })
  it('0 satır etkilendiyse AppError (sessiz red) fırlatır', () => {
    expect(() => ensureRows({ data: [], error: null })).toThrow(AppError)
  })
  it('satır etkilendiyse veriyi döner', () => {
    expect(ensureRows({ data: [{ id: 1 }], error: null })).toEqual([{ id: 1 }])
  })
})
