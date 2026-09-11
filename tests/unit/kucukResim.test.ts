import { describe, it, expect, vi, beforeEach } from 'vitest'
import { kucukResimUret } from '@/lib/kucukResim'

// jsdom'da canvas ve createImageBitmap yoktur; davranışı sahteleriz.
beforeEach(() => {
  vi.restoreAllMocks()
})

const sahteDosya = (tip: string) => new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: tip })

describe('kucukResimUret', () => {
  it('görsel olmayan dosya için null döner', async () => {
    expect(await kucukResimUret(sahteDosya('application/pdf'), 160)).toBeNull()
  })

  it('createImageBitmap yoksa null döner (HEIC gibi)', async () => {
    vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('desteklenmiyor')))
    expect(await kucukResimUret(sahteDosya('image/heic'), 160)).toBeNull()
  })

  it('canvas bağlamı yoksa null döner', async () => {
    vi.stubGlobal('createImageBitmap', () =>
      Promise.resolve({ width: 800, height: 600, close: () => {} }),
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(await kucukResimUret(sahteDosya('image/jpeg'), 160)).toBeNull()
  })

  it('oranı koruyarak küçültür ve webp üretir', async () => {
    const cizilen: number[] = []
    vi.stubGlobal('createImageBitmap', () =>
      Promise.resolve({ width: 800, height: 600, close: () => {} }),
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: (_b: unknown, _x: number, _y: number, w: number, h: number) => {
        cizilen.push(w, h)
      },
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      geri: BlobCallback,
      tip?: string,
    ) {
      geri(new Blob([new Uint8Array([9])], { type: tip }))
    })

    const blob = await kucukResimUret(sahteDosya('image/jpeg'), 160)
    expect(blob?.type).toBe('image/webp')
    expect(cizilen).toEqual([160, 120]) // 800x600 → 160x120
  })

  it('hedeften küçük görseli büyütmez', async () => {
    const cizilen: number[] = []
    vi.stubGlobal('createImageBitmap', () =>
      Promise.resolve({ width: 100, height: 50, close: () => {} }),
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: (_b: unknown, _x: number, _y: number, w: number, h: number) => {
        cizilen.push(w, h)
      },
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      geri: BlobCallback,
      tip?: string,
    ) {
      geri(new Blob([new Uint8Array([9])], { type: tip }))
    })

    await kucukResimUret(sahteDosya('image/jpeg'), 160)
    expect(cizilen).toEqual([100, 50])
  })
})
