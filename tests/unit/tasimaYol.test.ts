// @ts-nocheck — .mjs betik modülü, tip bildirimi yok (tsc -b derlemeyi kilitlemesin)
import { describe, it, expect } from 'vitest'
// BİLEREK yardımcı dosyadan içe aktarılır, `scripts/r2-tasima.mjs`'den DEĞİL:
// ana betik `sharp` (yerel ikili modül) yükler ve test ortamı jsdom'dur —
// ana betiği içe aktarmak testte sharp yüklemeye çalışır ve kırılabilir.
import { kucukYolu, gorselMi } from '../../scripts/r2-tasima-yardimci.mjs'

describe('kucukYolu', () => {
  it('160 anahtarını kurar', () => {
    expect(kucukYolu('image/a.jpg', 160)).toBe('k/160/image/a.jpg.webp')
  })
  it('480 anahtarını kurar', () => {
    expect(kucukYolu('image/a.jpg', 480)).toBe('k/480/image/a.jpg.webp')
  })
  it('Worker anahtar kuralıyla birebir aynıdır', () => {
    // services/dosya-worker/src/index.js → r2Anahtar ile aynı biçim:
    // r2Anahtar(yol, genislik) => `k/${genislik}/${yol}.webp`
    expect(kucukYolu('doc/x/y.png', 160)).toBe('k/160/doc/x/y.png.webp')
  })
})

describe('gorselMi', () => {
  it('görsel tiplerini tanır', () => {
    expect(gorselMi('image/jpeg')).toBe(true)
    expect(gorselMi('image/png')).toBe(true)
    expect(gorselMi('image/webp')).toBe(true)
  })
  it('sharp desteklemeyen tipleri dışlar', () => {
    expect(gorselMi('image/heic')).toBe(false)
    expect(gorselMi('image/heif')).toBe(false)
  })
  it('görsel olmayanları dışlar', () => {
    expect(gorselMi('application/pdf')).toBe(false)
    expect(gorselMi(null)).toBe(false)
  })
})
