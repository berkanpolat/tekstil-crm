/// <reference types="node" />
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { IZINLI_MIME as ISTEMCI_IZINLI_MIME, AZAMI_BAYT as ISTEMCI_AZAMI_BAYT } from '@/hooks/useFiles'
import { kucukYolu } from '../../scripts/r2-tasima-yardimci.mjs'

// Bu dosya (tests/unit) tsconfig.app.json (tarayıcı `lib`, "types" listesinde
// "node" YOK) kapsamında derleniyor; bu yüzden `node:fs`/`node:path` tipleri
// için yukarıdaki üçlü-eğik-çizgi referansı gerekli. `__dirname` ESM'de
// tanımsız olduğu için (proje "module": "ESNext") burada `process.cwd()`
// kullanılıyor — vitest her zaman proje kökünden çalıştığı için güvenli.

/**
 * SÖZLEŞME TESTİ — Worker (services/dosya-worker/src/index.js) ile istemci
 * (src/hooks/useFiles.ts) aynı MIME listesini ve boyut sınırını kullanmak
 * ZORUNDA. Ayrı derleme birimleri oldukları için ortak modül paylaşamıyorlar
 * (biri Cloudflare Workers, öbürü tarayıcı); bu test kopyaların ayrışmasını
 * yakalar. Ayrışırsa kullanıcı ya reddedilmesi gerekeni yükler ya da
 * yükleyebileceği dosya reddedilir.
 *
 * Worker kaynağı DİSKTEN OKUNUR ve düzenli ifadeyle ayıklanır — Worker'ı
 * doğrudan içe aktarmıyoruz çünkü `services/dosya-worker/src/index.js`
 * `kimlik.js` üzerinden Cloudflare Workers'a özel API'lere (`caches.default`)
 * dayanır; burada yalnız metin düzeyinde sabitleri karşılaştırmak yeterli
 * ve daha kararlı.
 */

const KOK = process.cwd()
const WORKER_KAYNAK = readFileSync(path.resolve(KOK, 'services/dosya-worker/src/index.js'), 'utf8')
const ISTEMCI_KAYNAK = readFileSync(path.resolve(KOK, 'src/hooks/useFiles.ts'), 'utf8')

/** `noUncheckedIndexedAccess` altında güvenli yakalama-grubu erişimi. */
function grup(m: RegExpMatchArray, i: number, baglam: string): string {
  const deger = m[i]
  if (deger === undefined) throw new Error(`${baglam}: yakalama grubu ${i} yok — regex/kaynak uyuşmuyor.`)
  return deger
}

function workerIzinliMimeCikar(kaynak: string): Set<string> {
  const m = kaynak.match(/const IZINLI_MIME = new Set\(\[([\s\S]*?)\]\)/)
  if (!m) throw new Error('Worker kaynağında IZINLI_MIME bulunamadı — sözleşme testi güncellenmeli.')
  const govde = grup(m, 1, 'IZINLI_MIME')
  const tipler = [...govde.matchAll(/'([^']+)'/g)].map((x) => grup(x, 1, 'IZINLI_MIME öğesi'))
  if (!tipler.length) throw new Error('IZINLI_MIME ayıklandı ama boş çıktı — regex bozuk olabilir.')
  return new Set(tipler)
}

function workerAzamiBaytCikar(kaynak: string): number {
  const m = kaynak.match(/export const AZAMI_BAYT = ([0-9_ *]+)/)
  if (!m) throw new Error('Worker kaynağında AZAMI_BAYT bulunamadı — sözleşme testi güncellenmeli.')
  const ifade = grup(m, 1, 'AZAMI_BAYT')
  // Yalnız rakam/boşluk/çarpım karakterlerinden oluştuğu yukarıdaki regex ile
  // doğrulandı (`[0-9_ *]+`) — güvenli, çünkü Worker kaynağından gelen serbest
  // metin değil, zaten dar bir karakter kümesiyle sınırlanmış bir eşleşme.
  return new Function(`"use strict"; return (${ifade});`)() as number
}

/** Worker'ın r2Anahtar fonksiyonunun gövdesini metin düzeyinde ayıklar. */
function workerKucukAnahtarBicimiCikar(kaynak: string): string {
  const m = kaynak.match(/export function r2Anahtar\(yol, genislik\) \{\n(.*)\n\}/)
  if (!m) throw new Error('Worker kaynağında r2Anahtar bulunamadı — sözleşme testi güncellenmeli.')
  return grup(m, 1, 'r2Anahtar').trim()
}

/** İstemcinin (useFiles.ts) yükleme sırasında kurduğu küçük resim anahtar
 * template literal'ini metin düzeyinde ayıklar (satır içi, dışa verilmiyor). */
function istemciKucukAnahtarBicimiCikar(kaynak: string): string {
  const m = kaynak.match(/dosyaYukle\(`(k\/\$\{boyut\}\/\$\{path\}\.webp)`/)
  if (!m) throw new Error('İstemci kaynağında küçük resim anahtar template literal bulunamadı — sözleşme testi güncellenmeli.')
  return grup(m, 1, 'istemci küçük resim anahtarı')
}

describe('Worker ↔ istemci sözleşmesi: IZINLI_MIME', () => {
  it('Worker kaynağından ayıklanan liste istemcideki ile BİREBİR aynı', () => {
    const worker = workerIzinliMimeCikar(WORKER_KAYNAK)
    expect(new Set(ISTEMCI_IZINLI_MIME)).toEqual(worker)
  })

  it('13 tip bekleniyor (genel-kısıtlar.md ile uyumlu sayaç)', () => {
    const worker = workerIzinliMimeCikar(WORKER_KAYNAK)
    expect(worker.size).toBe(13)
    expect(ISTEMCI_IZINLI_MIME.size).toBe(13)
  })
})

describe('Worker ↔ istemci sözleşmesi: AZAMI_BAYT', () => {
  it('Worker kaynağından ayıklanan sınır istemcideki ile BİREBİR aynı', () => {
    const worker = workerAzamiBaytCikar(WORKER_KAYNAK)
    expect(ISTEMCI_AZAMI_BAYT).toBe(worker)
    expect(worker).toBe(25 * 1024 * 1024)
  })
})

describe('Worker ↔ istemci sözleşmesi: küçük resim anahtar biçimi', () => {
  it('Worker r2Anahtar biçimi `k/${genislik}/${yol}.webp` — taşıma betiğinin kucukYolu ile birebir', () => {
    const govde = workerKucukAnahtarBicimiCikar(WORKER_KAYNAK)
    // Worker: `BOYUTLAR.has(genislik) ? \`k/${genislik}/${yol}.webp\` : yol`
    expect(govde).toContain('k/${genislik}/${yol}.webp')

    // İstemcinin (useFiles.ts) kaynağından AYIKLANAN gerçek template literal —
    // hardcoded bir dize DEĞİL: useFiles.ts'teki satır değişirse bu test kırılır.
    const istemciBicim = istemciKucukAnahtarBicimiCikar(ISTEMCI_KAYNAK)
    expect(istemciBicim).toBe('k/${boyut}/${path}.webp')

    // Worker'ın okurken kurduğu anahtar (r2Anahtar), istemcinin yüklerken
    // kurduğu anahtar (üstteki template) ve taşıma betiğinin (kucukYolu)
    // ürettiği anahtar ÜÇÜ DE aynı somut değerlere varmalı.
    const yol = 'image/9f2c-ornek.jpg'
    for (const boyut of [160, 480]) {
      const worker = `k/${boyut}/${yol}.webp`
      // istemciBicim'deki `${boyut}`/`${path}` adlarını gerçek değerlerle
      // doldurarak istemcinin üreteceği gerçek anahtarı hesapla.
      const istemciGercek = istemciBicim.replace('${boyut}', String(boyut)).replace('${path}', yol)
      const tasima = kucukYolu(yol, boyut)
      expect(istemciGercek).toBe(worker)
      expect(tasima).toBe(worker)
    }
  })
})
