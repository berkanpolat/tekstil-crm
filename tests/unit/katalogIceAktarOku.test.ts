// @ts-nocheck — .mjs betik modülü, tip bildirimi yok (tsc -b derlemeyi kilitlemesin)
import { describe, it, expect, vi, afterEach } from 'vitest'
import { oku } from '../../scripts/katalog-ice-aktar.mjs'

const O = { url: 'https://ornek.supabase.co', anahtar: 'gizli-anahtar' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('oku — sayfalama', () => {
  it('1000 + 300 satırlık iki sayfayı birleştirip 1300 satır döner', async () => {
    const sayfa1 = Array.from({ length: 1000 }, (_, i) => ({ id: i }))
    const sayfa2 = Array.from({ length: 300 }, (_, i) => ({ id: 1000 + i }))
    const cagrilar = []

    const sahteFetch = vi.fn(async (url) => {
      cagrilar.push(String(url))
      const u = new URL(String(url))
      const offset = Number(u.searchParams.get('offset'))
      const gövde = offset === 0 ? sayfa1 : offset === 1000 ? sayfa2 : []
      return { ok: true, json: async () => gövde }
    })
    vi.stubGlobal('fetch', sahteFetch)

    const sonuc = await oku(O, 'catalog_products?select=id')

    expect(sonuc.length).toBe(1300)
    expect(sahteFetch).toHaveBeenCalledTimes(2)
    expect(cagrilar[0]).toContain('offset=0')
    expect(cagrilar[1]).toContain('offset=1000')
  })

  it('okuma başarısızsa hata fırlatır', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    await expect(oku(O, 'catalog_products?select=id')).rejects.toThrow(/Okuma başarısız/)
  })
})
