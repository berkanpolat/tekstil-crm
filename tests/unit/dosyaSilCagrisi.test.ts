import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoke = vi.fn(() => Promise.resolve({ data: null, error: null }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }))

const { dosyalariSil } = await import('@/hooks/useFiles')

beforeEach(() => invoke.mockClear())

describe('dosyalariSil', () => {
  it('boş listede çağrı yapmaz', async () => {
    await dosyalariSil([])
    expect(invoke).not.toHaveBeenCalled()
  })

  it('yolları tek çağrıda kenar işlevine gönderir', async () => {
    await dosyalariSil(['image/a.jpg', 'doc/b.pdf'])
    expect(invoke).toHaveBeenCalledWith('dosya-sil', {
      body: { yollar: ['image/a.jpg', 'doc/b.pdf'] },
    })
  })

  it('boş yolları ayıklar', async () => {
    await dosyalariSil(['', 'image/a.jpg'])
    expect(invoke).toHaveBeenCalledWith('dosya-sil', { body: { yollar: ['image/a.jpg'] } })
  })

  it('hata fırlatmaz (DB zaten silinmiş)', async () => {
    invoke.mockRejectedValueOnce(new Error('ağ'))
    await expect(dosyalariSil(['image/a.jpg'])).resolves.toBeUndefined()
  })
})
