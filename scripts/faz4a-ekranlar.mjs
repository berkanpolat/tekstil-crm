// docs/faz-4a-ekranlar.md için 5 belgenin TR + EN ekran görüntüleri.
// /preview çıktısını (stilli HTML) Playwright'a yükler, ilk sayfayı PNG'ye çeker.
// Tasarım taşması gözle görülsün diye A4 genişliğinde, 2x ölçekle.
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdirSync } from 'node:fs'

const SVC = process.env.PDF_SERVICE_URL ?? 'http://localhost:4046'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
const OUT = 'docs/assets/faz-4a'
mkdirSync(OUT, { recursive: true })
const uretici = JSON.parse(execFileSync('psql', [PGURL, '-qtAc', 'select public.document_uretici()'], { encoding: 'utf8' }).trim())

// Temsili, dolu veri — çıktı gerçekçi görünsün.
const DATA = {
  fiyat_teklifi: { uretici, tkS: { talep: '204871', musteri: 'ACME Tekstil A.Ş.', grup: 'Örme', tur: 'Sweatshirt', gecerli: '7 Gün', teslimat: '2026-08-15', odeme: '%50 Peşin, %50 Sevk Öncesi', para: 'TRY', kdv: '10', indirim: '0', not: 'Numune onayı sonrası seri üretim başlar.', dil: 'tr', opts: [{ detay: 'Standart Kalıp', kumas: '320 g/m² pamuk süprem', adet: '1200', birim: '185', oner: true }, { detay: 'Ekonomik', kumas: '280 g/m² pamuk', adet: '1200', birim: '160', oner: false }] } },
  siparis_onay: { uretici, soS: { kod: '204871', dtarih: '2026-07-27', musteri: 'ACME Tekstil A.Ş.', yetkili: 'Ayşe Yılmaz', ftarih: '2026-07-27', grup: 'Örme', tur: 'Sweatshirt', kumas: '320 g/m² pamuk süprem', renk: 'Lacivert / Antrasit', beden: 'S-M-L-XL (30/40/40/20)', adet: '1200', birim: '185 TL', termin: '12' } },
  numune_etiketi: { uretici, norder: { musteri: 'ACME Tekstil A.Ş.', urunkodu: 'TAS-204871' }, numuneler: [{ beden: 'M', renk: 'Lacivert' }, { beden: 'L', renk: 'Antrasit' }, { beden: 'S', renk: 'Beyaz' }, { beden: 'XL', renk: 'Lacivert' }] },
  siparis_formu: { uretici, sip: { no6: '204871', urunkodu: 'TAS-204871', tarih: '2026-07-27', toplam: '', alici: { unvan: 'ACME Tekstil A.Ş.', vno: '1234567890', vd: 'Kadıköy', adres: 'Ataşehir, İstanbul' }, grup: 'Örme', tur: 'Sweatshirt', bsistem: 'Alfa', bedenler: ['S', 'M', 'L', 'XL'], renkler: [{ ad: 'Lacivert', hex: '#1f2f57', q: { S: 90, M: 120, L: 120, XL: 60 } }, { ad: 'Antrasit', hex: '#3a3f45', q: { S: 60, M: 90, L: 90, XL: 40 } }], kompozisyon: '%100 Pamuk', bakim: [], yorum: 'Yıkama sonrası ütü orta ısı.', para: 'TRY', birim: '185', tavsiye: '499', odeme: '%50 Peşin, %50 Sevk Öncesi' } },
  koli_ustu: { uretici, order: { musteri: 'ACME Tekstil A.Ş.', icerik: 'TAS-204871', adres: 'Ataşehir, İstanbul', toplam: 2 }, koliler: [{ musteri: 'ACME Tekstil A.Ş.', icerik: 'TAS-204871', adres: 'Ataşehir, İstanbul', renk: 'Lacivert', beden: 'M', adet: '30', agirlik: '8.5 kg' }, { musteri: 'ACME Tekstil A.Ş.', icerik: 'TAS-204871', adres: 'Ataşehir, İstanbul', renk: 'Antrasit', beden: 'L', adet: '30', agirlik: '9.0 kg' }] },
}
const LABEL = { fiyat_teklifi: 'Fiyat Teklifi', siparis_onay: 'Sipariş Onay Formu', numune_etiketi: 'Numune Etiketi', siparis_formu: 'Sipariş Formu', koli_ustu: 'Koli Üstü Etiketi' }

const preview = async (template, data, language) => {
  const r = await fetch(SVC + '/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ template, data, language }) })
  if (!r.ok) throw new Error(`preview ${template} ${language} ${r.status}`)
  return r.text()
}

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 820, height: 1160 }, deviceScaleFactor: 2 })
for (const t of Object.keys(DATA)) {
  for (const lang of ['tr', 'en']) {
    const html = await preview(t, DATA[t], lang)
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.waitForTimeout(300)
    const file = `${OUT}/ekran-${t.replace(/_/g, '-')}-${lang}.png`
    await page.screenshot({ path: file, fullPage: true })
    console.log('✓', file)
  }
}
await b.close()
console.log('bitti.')
