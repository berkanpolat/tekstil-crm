import { describe, it, expect, vi } from 'vitest'
import { depolamayaYaz } from '../../supabase/functions/_shared/dosyaDepo.ts'

const ORTAM = { url: 'https://dosya.test', sir: 'sir123' }

describe('depolamayaYaz', () => {
  it('doğru uca sırla PUT eder', async () => {
    const cagri: { adres?: string; secenek?: RequestInit } = {}
    const sahte = vi.fn((adres: string, secenek: RequestInit) => {
      cagri.adres = adres
      cagri.secenek = secenek
      return Promise.resolve(new Response('{}', { status: 201 }))
    })
    const ok = await depolamayaYaz('intake/5/a.jpg', new Uint8Array([1]), 'image/jpeg', ORTAM, sahte as never)
    expect(ok).toBe(true)
    expect(cagri.adres).toBe('https://dosya.test/y?yol=intake%2F5%2Fa.jpg')
    expect(cagri.secenek?.method).toBe('PUT')
    expect((cagri.secenek?.headers as Record<string, string>)['x-servis-sirri']).toBe('sir123')
  })

  it('başarısız yanıtta false döner (fırlatmaz)', async () => {
    const sahte = vi.fn(() => Promise.resolve(new Response('hata', { status: 500 })))
    expect(await depolamayaYaz('a.jpg', new Uint8Array([1]), 'image/jpeg', ORTAM, sahte as never)).toBe(false)
  })

  it('ağ hatasında false döner (fırlatmaz)', async () => {
    const sahte = vi.fn(() => Promise.reject(new Error('ağ')))
    expect(await depolamayaYaz('a.jpg', new Uint8Array([1]), 'image/jpeg', ORTAM, sahte as never)).toBe(false)
  })

  it('yapılandırma eksikse false döner', async () => {
    const sahte = vi.fn()
    expect(await depolamayaYaz('a.jpg', new Uint8Array([1]), 'image/jpeg', { url: '', sir: '' }, sahte as never)).toBe(false)
    expect(sahte).not.toHaveBeenCalled()
  })
})
