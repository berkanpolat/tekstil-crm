import { describe, it, expect, vi, beforeEach } from 'vitest'
import { kucukResimUret, kucukResimleriUret } from '@/lib/kucukResim'

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

  it('oranı koruyarak küçültür, webp üretir ve kaliteyi 0,82 sabitler', async () => {
    const cizilen: number[] = []
    const kaliteler: (number | undefined)[] = []
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
      kalite?: number,
    ) {
      kaliteler.push(kalite)
      geri(new Blob([new Uint8Array([9])], { type: tip }))
    })

    const blob = await kucukResimUret(sahteDosya('image/jpeg'), 160)
    expect(blob?.type).toBe('image/webp')
    expect(cizilen).toEqual([160, 120]) // 800x600 → 160x120
    expect(kaliteler).toEqual([0.82])
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

describe('kucukResimleriUret', () => {
  it('görsel olmayan dosya için boş harita döner', async () => {
    const sonuc = await kucukResimleriUret(sahteDosya('application/pdf'), [160, 480])
    expect(sonuc.size).toBe(0)
  })

  it('createImageBitmap yoksa boş harita döner (HEIC gibi)', async () => {
    vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('desteklenmiyor')))
    const sonuc = await kucukResimleriUret(sahteDosya('image/heic'), [160, 480])
    expect(sonuc.size).toBe(0)
  })

  it('görseli TEK KEZ kod çözüp iki boyutu birden üretir', async () => {
    let kodCozmeSayisi = 0
    vi.stubGlobal('createImageBitmap', () => {
      kodCozmeSayisi += 1
      return Promise.resolve({ width: 800, height: 600, close: () => {} })
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: () => {},
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      geri: BlobCallback,
      tip?: string,
    ) {
      geri(new Blob([new Uint8Array([9])], { type: tip }))
    })

    const sonuc = await kucukResimleriUret(sahteDosya('image/jpeg'), [160, 480])
    expect(kodCozmeSayisi).toBe(1)
    expect(sonuc.size).toBe(2)
    expect(sonuc.get(160)?.type).toBe('image/webp')
    expect(sonuc.get(480)?.type).toBe('image/webp')
  })

  it('bir boyut başarısız olursa diğerini yine de üretir', async () => {
    vi.stubGlobal('createImageBitmap', () =>
      Promise.resolve({ width: 800, height: 600, close: () => {} }),
    )
    let cagriNo = 0
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      cagriNo += 1
      // İlk çağrı (160) başarısız olsun, ikinci (480) başarılı.
      if (cagriNo === 1) return null
      return { drawImage: () => {} } as unknown as CanvasRenderingContext2D
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      geri: BlobCallback,
      tip?: string,
    ) {
      geri(new Blob([new Uint8Array([9])], { type: tip }))
    })

    const sonuc = await kucukResimleriUret(sahteDosya('image/jpeg'), [160, 480])
    expect(sonuc.has(160)).toBe(false)
    expect(sonuc.has(480)).toBe(true)
  })
})
