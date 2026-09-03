// Belge doğrulama senaryoları ve ortak sayfa kurulumu.
//
// İki doğrulama betiği de buradan besleniyor: sablon-dogrula.mjs (hermetik şablon
// orijinalle aynı mı) ve onizleme-dogrula.mjs (tarayıcıdaki köprü sunucuyla aynı mı).
// Şekiller CRM'in gerçekten gönderdiğiyle birebir — bkz. src/pages/documents/editorForms.tsx.

const STATE_VARS = ['tkS', 'sip', 'soS', 'norder', 'order']

// ---- Örnek veriler (render-test.mjs ile aynı teklif + diğer şablonlar) ----
const tkS = {
  talep: '588892', musteri: 'Ness Casual', grup: 'Kadın Giyim', tur: 'Bluz',
  teslimat: '2026-08-01', para: 'USD', kdv: '10', indirim: '0', gecerli: '7 Gün',
  odeme: '%50 Peşin, %50 Sevk Öncesi', foto: '', fotoAR: 0,
  not: 'Lorem Ipsum is simply dummy text of the printing and typesetting industry.',
  opts: [
    { detay: 'Takım 50 Adet', kumas: 'Keten', adet: '50', birim: '15', oner: false },
    { detay: 'Takım 200 Adet', kumas: 'keten', adet: '200', birim: '16', oner: true },
  ],
}
const rates = { USD: 47.5, EUR: null, GBP: null, date: '', source: 'manual', status: 'ok' }

// Şekiller CRM'in GERÇEKTEN gönderdiğiyle aynı: src/pages/documents/editorForms.tsx
// içindeki başlangıç değerleri + normalizeForRender() çıktısı (ör. siparis_formu'nda
// bedenlerText → bedenler dizisine çevrilir; koli_ustu'nda başlık alanları kolilere yayılır).
export const SENARYOLAR = [
  { ad: 'fiyat_teklifi', template: 'fiyat_teklifi', data: { tkS, rates }, language: 'tr' },
  { ad: 'fiyat_teklifi (EN)', template: 'fiyat_teklifi', data: { tkS, rates }, language: 'en' },
  {
    // Barkod yolu: sipariş formu JsBarcode ile CODE128 çizer → GÖMÜLÜ kütüphaneyi sınar.
    ad: 'siparis_formu', template: 'siparis_formu', language: 'tr',
    data: {
      sip: {
        no6: '204871', urunkodu: 'TAS-204871', tarih: '2026-09-01', teslim: '2026-10-15', toplam: '500',
        alici: { unvan: 'Ness Casual', vno: '1234567890', vd: 'Yenibosna', adres: 'Küçükbakkalköy Mah., İstanbul' },
        grup: 'Kadın Giyim', tur: 'Bluz', bsistem: 'Alfa',
        bedenler: ['XS', 'S', 'M', 'L', 'XL'],
        renkler: [
          { ad: 'Siyah', hex: '#111111', q: { XS: '20', S: '50', M: '100', L: '50', XL: '20' } },
          { ad: 'Ekru', hex: '#efe6d6', q: { XS: '10', S: '40', M: '80', L: '40', XL: '10' } },
        ],
        kompozisyon: '%100 Keten', bakim: ['30', 'nobleach', 'iron', 'notumble', 'inside'],
        yorum: 'Numune onayı sonrası üretime geçilecektir.',
        para: 'TRY', birim: '15,00', tavsiye: '', odeme: '%50 Ön Ödeme %50 Sevkiyat Öncesi',
      },
    },
  },
  {
    ad: 'siparis_onay', template: 'siparis_onay', language: 'tr',
    data: {
      soS: {
        kod: 'TAS-204871', dtarih: '2026-09-01', ftarih: '2026-09-05', musteri: 'Ness Casual',
        yetkili: 'Satın Alma', grup: 'Kadın Giyim', tur: 'Bluz', kumas: 'Keten', renk: 'Siyah',
        beden: 'S-M-L', adet: '500', birim: '15,00', tutar: '7.500,00', termin: '45 gün', para: 'TRY',
        sgAd: 'Berkan Polat Çetiner', sgUnvan: 'Satış', sgTarih: '2026-09-01',
        mgAd: 'Ness Casual', mgUnvan: 'Satın Alma', mgTarih: '2026-09-02',
      },
    },
  },
  {
    // İkinci barkod yolu (numuneHTML kendi barkodunu çizer) + çok sayfalı yerleşim.
    ad: 'numune_etiketi', template: 'numune_etiketi', language: 'tr',
    data: {
      norder: { musteri: 'Ness Casual', urunkodu: 'TAS-204871' },
      numuneler: [
        { musteri: 'Ness Casual', urunkodu: 'TAS-204871', beden: 'M', renk: 'Siyah' },
        { musteri: 'Ness Casual', urunkodu: 'TAS-204871', beden: 'L', renk: 'Ekru' },
        { musteri: 'Ada Tekstil', urunkodu: 'TAS-204872', beden: 'S', renk: 'Lacivert' },
      ],
    },
  },
  {
    ad: 'koli_ustu', template: 'koli_ustu', language: 'tr',
    data: {
      order: { musteri: 'Ness Casual', icerik: 'TAS-204871 Bluz', adres: 'İstanbul / Türkiye', toplam: 3 },
      koliler: [
        { musteri: 'Ness Casual', icerik: 'TAS-204871 Bluz', adres: 'İstanbul / Türkiye', renk: 'Siyah', beden: 'M', adet: '50', agirlik: '12' },
        { musteri: 'Ness Casual', icerik: 'TAS-204871 Bluz', adres: 'İstanbul / Türkiye', renk: 'Ekru', beden: 'L', adet: '40', agirlik: '11' },
        { musteri: 'Ness Casual', icerik: 'TAS-204871 Bluz', adres: 'İstanbul / Türkiye', renk: 'Siyah', beden: 'S', adet: '30', agirlik: '9' },
      ],
    },
  },
  {
    ad: 'maliyet_belgesi', template: 'maliyet_belgesi', language: 'tr',
    data: {
      maliyet: {
        code: 'TAS-204871', name: 'Keten Bluz', category: 'Kadın Giyim', composition: '%100 Keten',
        items: [{ name: 'Kumaş', detail: '1,4 m × 120 ₺', amount: '168,00 ₺' }, { name: 'Dikim', detail: 'fason', amount: '45,00 ₺' }],
        tiers: [{ qty: '50', unitCost: '213,00', margin: '35', unitPrice: '287,55', total: '14.377,50' }],
        totalTry: '213,00 ₺', totalUsd: '4,48 $', rateSource: 'TCMB', usdRate: '47,50', rateDate: '01.09.2026',
        hazirlayan: 'Tuna Cardak', tarih: '01.09.2026', versiyon: 'v1',
      },
    },
  },
  {
    ad: 'cari_ekstre', template: 'cari_ekstre', language: 'tr',
    data: {
      ekstre: {
        company: { name: 'Tekstil A.Ş.', address: 'İstanbul', phone: '0850 242 57 00', email: 'info@tekstilas.com' },
        customer: { name: 'Ness Casual', taxNumber: '1234567890', taxOffice: 'Yenibosna', address: 'İstanbul' },
        periodLabel: '01.01.2026 – 01.09.2026', currency: 'TRY', opening: '0,00', closing: '1.500,00',
        rows: [
          { date: '01.08.2026', desc: 'Fatura #1042', debit: '2.000,00', credit: '', balance: '2.000,00' },
          { date: '15.08.2026', desc: 'Tahsilat', debit: '', credit: '500,00', balance: '1.500,00' },
        ],
        generatedAt: '01.09.2026 14:00',
      },
    },
  },
  {
    // reportDoc + temizleHtml (beyaz liste) yolu: SVG grafik işaretlemesi korunmalı.
    ad: 'rapor', template: 'rapor', language: 'tr',
    data: {
      rapor: {
        baslik: 'Satış Hunisi', altbaslik: 'Ağustos 2026',
        bodyHtml: '<section style="padding:14px"><h3>Özet</h3>' +
          '<svg width="200" height="60" viewBox="0 0 200 60"><rect x="0" y="0" width="120" height="20" fill="#1f2f57"></rect>' +
          '<text x="4" y="15" font-size="11" fill="#fff">Teklif 120</text></svg>' +
          '<table><tr><td>Dönüşüm</td><td>%3,4</td></tr></table></section>',
      },
    },
  },
]

export async function sayfaAc(browser, yol, agKapali) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 2 })
  await page.route('**/*', (route) => {
    const u = route.request().url()
    if (u.startsWith('file:')) return route.continue()
    // Orijinal şablon dış CDN'e muhtaç (JsBarcode); hermetik olan hiçbir şeye muhtaç değil.
    if (agKapali) return route.abort()
    if (u.includes('JsBarcode') || u.includes('supabase-js@2')) return route.continue()
    return route.abort()
  })
  page.on('pageerror', () => {})
  await page.goto('file://' + yol, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForFunction('typeof tkQuoteDoc==="function" && typeof siparisDocHTML==="function" && typeof soDoc==="function" && typeof numuneHTML==="function" && typeof stickerHTML==="function"', { timeout: 30000 })
  await page.waitForFunction('typeof JsBarcode!=="undefined"', { timeout: 30000 })

  const eksik = await page.evaluate((names) => {
    const bad = []
    for (const n of names) { try { window.eval('void ' + n) } catch { bad.push(n) } }
    return bad
  }, STATE_VARS)
  if (eksik.length) throw new Error(`${yol}: durum değişkenleri erişilemiyor: ${eksik.join(', ')}`)
  return page
}
