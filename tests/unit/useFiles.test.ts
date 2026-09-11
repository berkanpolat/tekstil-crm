import { describe, it, expect } from 'vitest'
import { hataMesajiUret, mimeNormallestir } from '@/hooks/useFiles'

describe('hataMesajiUret', () => {
  it('haritalı durumlarda Worker gövdesini EZER (durum kodu kazanır)', () => {
    // Worker HER hata yolunda bir gövde döndürür; 413/409/415/401 için bu
    // ham teşhis metni değil, kullanıcıya anlamlı Türkçe cümle gösterilmeli.
    expect(hataMesajiUret(413, { hata: 'dosya çok büyük' })).toBe(
      'Dosya çok büyük (en çok 25 MB).',
    )
    expect(hataMesajiUret(409, { hata: 'nesne zaten var' })).toBe('Bu dosya zaten yüklenmiş.')
    expect(hataMesajiUret(415, { hata: 'tip kabul edilmiyor' })).toBe(
      'Bu dosya türü kabul edilmiyor.',
    )
    expect(hataMesajiUret(401, { hata: 'oturum yok' })).toBe(
      'Oturum doğrulanamadı. Sayfayı yenileyip tekrar deneyin.',
    )
  })

  it('haritalı durumlarda gövde olmasa da aynı mesajı verir', () => {
    expect(hataMesajiUret(413, null)).toBe('Dosya çok büyük (en çok 25 MB).')
  })

  it('haritada olmayan durumlarda Worker gövdesini sarmalayarak kullanır', () => {
    expect(hataMesajiUret(502, { hata: 'yükleme başarısız' })).toBe(
      'Dosya yüklenemedi (502): yükleme başarısız',
    )
    expect(hataMesajiUret(400, { hata: 'gövde okunamadı' })).toBe(
      'Dosya yüklenemedi (400): gövde okunamadı',
    )
  })

  it('haritada olmayan durumda gövde de yoksa yalnız durum koduyla mesaj verir', () => {
    expect(hataMesajiUret(502, null)).toBe('Dosya yüklenemedi (502).')
    expect(hataMesajiUret(502, {})).toBe('Dosya yüklenemedi (502).')
  })
})

describe('mimeNormallestir', () => {
  it('parametreli tipi sadeleştirir', () => {
    expect(mimeNormallestir('text/csv; charset=utf-8')).toBe('text/csv')
  })

  it('büyük harfli tipi küçültür', () => {
    expect(mimeNormallestir('IMAGE/JPEG')).toBe('image/jpeg')
  })

  it('boşlukları temizler', () => {
    expect(mimeNormallestir('  application/pdf  ')).toBe('application/pdf')
  })

  it('parametreli ve büyük harfli tip, Worker ile aynı sonuca varır ve İZİNLİ sayılır', () => {
    // Worker: (headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    // İstemci normalizasyonu bununla BİREBİR aynı sonucu vermeli.
    expect(mimeNormallestir('TEXT/CSV; charset=utf-8')).toBe('text/csv')
  })
})
