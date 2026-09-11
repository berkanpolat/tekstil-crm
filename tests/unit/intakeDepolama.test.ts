import { describe, it, expect, vi } from 'vitest'
import { depolamayaYaz, guvenliDosyaAdi } from '../../supabase/functions/_shared/dosyaDepo.ts'

const ORTAM = { url: 'https://dosya.test', sir: 'sir123' }

// services/dosya-worker/src/index.js içindeki `yolGecerli` ile AYNI kural.
// Kasıtlı kopya: kenar işlevi (Deno) ile Worker ayrı derleme birimleri, ortak
// modül paylaşamıyorlar. İki taraf ayrışırsa bu testler kırılır — amaç bu.
const yolGecerli = (yol: string) =>
  typeof yol === 'string' && !!yol && yol.length <= 200 &&
  !yol.includes('..') && !yol.includes('\\') &&
  !yol.startsWith('/') && !yol.startsWith('k/') &&
  /^[a-zA-Z0-9_\-./]+$/.test(yol)

/** intake-request'in `store` içinde ürettiği YOL biçiminin aynısı. */
function intakeYolu(ad: string): string {
  return `intake/42/11111111-1111-1111-1111-111111111111-${guvenliDosyaAdi(ad)}`.slice(0, 200)
}

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

// REGRESYON — Düzeltme turu 1 (Ö1): "rapor..pdf" gibi bir dosya adı Worker'ın
// yolGecerli kuralından (".." alt dizi olarak her yerde yasak) geçmezdi;
// sessizce kaybolan dosya sınıfından bir hataydı. Bu testler bir daha
// olmamasını garanti eder — regex sadeleştirilirse burada kırılmalı.
describe('guvenliDosyaAdi', () => {
  it('ardışık noktaları tekilleştirir, ".." asla üretmez', () => {
    expect(guvenliDosyaAdi('rapor..pdf')).not.toContain('..')
    expect(guvenliDosyaAdi('a...b.jpg')).not.toContain('..')
    expect(guvenliDosyaAdi('....')).not.toContain('..')
  })

  it('yol ayıracı ve geri bölüyü temizler', () => {
    expect(guvenliDosyaAdi('../../etc/passwd')).not.toContain('..')
    expect(guvenliDosyaAdi('dosya\\ters.pdf')).not.toContain('\\')
  })

  it('boş dizede "dosya" döner', () => {
    expect(guvenliDosyaAdi('')).toBe('dosya')
  })

  it('yalnız nokta olan adı da temizler', () => {
    expect(guvenliDosyaAdi('.')).not.toContain('..')
  })
})

describe('intake yolu Worker kuralından geçer (uçtan uca regresyon)', () => {
  const girdiler = [
    'rapor..pdf',
    'a...b.jpg',
    '../../etc/passwd',
    'dosya adı boşluklu.pdf',
    'Ürün Görseli ÇŞĞİÖÜ.png',
    '....',
    '.',
    '',
    'a'.repeat(300) + '.pdf',
    // Kesme öncesi uzun bir nokta dizisi 80. karaktere yakın yerde olsun —
    // sıra (önce ardışık-nokta temizliği, SONRA slice) yanlış olsaydı burada
    // kırpma ".." üretebilirdi.
    'a'.repeat(70) + '.'.repeat(20) + 'b'.repeat(200) + '.pdf',
    'dosya\\ters.pdf',
  ]

  it.each(girdiler)('%s → üretilen yol yolGecerli\'den geçer', (ad) => {
    const yol = intakeYolu(ad)
    expect(yolGecerli(yol)).toBe(true)
    expect(yol).not.toContain('..')
  })
})
