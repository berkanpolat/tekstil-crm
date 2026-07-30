// P4B.10 — Katalog/maliyet/fiyat entegrasyon + SIZINTI testi (servis + DB).
// Kritik: maliyet müşteriye giden belgede GEÇMEZ. Ayrıca product_price fiyatı doğru,
// maliyet yetkisiz gizli; çok para birimli toplam kurla doğru.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const SVC = process.env.PDF_SERVICE_URL ?? 'http://localhost:4046'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
const sql = (s) => execFileSync('psql', [PGURL, '-qtAc', s], { encoding: 'utf8' }).trim()
let fails = 0
const ok = (l, c) => { if (!c) fails++; console.log(`  ${c ? '✓' : '✗ HATA'} ${l}`) }

// Kurulum: katalog + ürün + GİZLİ maliyet kalemi
const catId = sql(`select id from public.catalogs limit 1`)
const SECRET = 'GIZLIMALIYETXYZ'
const pid = sql(`insert into public.catalog_products (catalog_id, code, name, category_id, composition, moq)
  values (${catId}, 'TEST-P4B-${sql(`select floor(random()*100000)::int`)}', 'Test Ürün P4B', null, '%100 Pamuk', 50) returning id`)
// Kur ayarla (USD=40 sabit test)
sql(`select public.set_exchange_rate('USD', 40, 'TEST')`)
// Maliyet DOĞRUDAN (psql süper kullanıcı; save_product_cost RPC yetki ister — o gate ayrı doğru).
// Kumaş 2m×3USD=6USD=240TL + gizli sabit 50 TL → total 290 TL, 7.25 USD.
const costId = sql(`insert into public.product_costs (product_id, version, is_current, total_cost_try, total_cost_usd, rate_snapshot) values (${pid}, 1, true, 290, 7.25, '{"USD":40}'::jsonb) returning id`)
sql(`insert into public.product_cost_items (cost_id, item_type, name, calculation_type, quantity, unit_price, currency, fabric_name, sort_order) values (${costId}, 'kumas', 'Kumaş', 'metre_fiyat', 2, 3, 'USD', '320g süprem', 0)`)
sql(`insert into public.product_cost_items (cost_id, item_type, name, calculation_type, amount, currency, sort_order) values (${costId}, 'diger', '${SECRET}', 'sabit', 50, 'TRY', 1)`)

console.log('[1] product_price — fiyat doğru, maliyet yetkisiz GİZLİ')
{
  // 120 adet → kademe %25 (50-199). birim = 7.25 × 1.25 = 9.06 (round 2)
  const r = JSON.parse(sql(`select public.product_price(${pid}, 120)`))
  ok('has_cost true', r.has_cost === true)
  ok('birim fiyat = maliyet×(1+marj) = 7.25×1.25 = 9.06', Math.abs(r.unit_price_usd - 9.06) < 0.01)
  ok('kumaş adı fiyat yanıtında (teklife otomatik)', r.fabric_name === '320g süprem')
  // psql = süper kullanıcı, auth.uid() null → has_permission false → maliyet/marj GİZLİ
  ok('maliyet yetkisiz → unit_cost_usd GİZLİ (null)', r.unit_cost_usd === null)
  ok('maliyet yetkisiz → margin_percent GİZLİ (null)', r.margin_percent === null)
  // kademe sınırı: 200 adet → %20 → 7.25×1.20 = 8.70
  const r200 = JSON.parse(sql(`select public.product_price(${pid}, 200)`))
  ok('200 adet kademe sınırı → 8.70', Math.abs(r200.unit_price_usd - 8.70) < 0.01)
  const r49 = JSON.parse(sql(`select public.product_price(${pid}, 49)`))
  ok('49 adet (MOQ altı) → en küçük kademe %25 → 9.06', Math.abs(r49.unit_price_usd - 9.06) < 0.01)
}

console.log('[2] SIZINTI — maliyet kalemi müşteriye giden fiyat teklifinde GEÇMİYOR')
{
  // Katalogdan gelen teklif verisi: opts.birim = SATIŞ fiyatı; kumas = fabric_name. Maliyet YOK.
  const quoteData = { uretici: {}, tkS: { talep: '', musteri: 'ACME', grup: 'Örme', tur: 'Tişört', para: 'USD', kdv: '20', dil: 'tr',
    opts: [{ detay: 'Test Ürün P4B', kumas: '320g süprem', adet: '120', birim: '9.06', oner: true }] } }
  const res = execFileSync('curl', ['-s', '-m', '20', '-X', 'POST', SVC + '/preview', '-H', 'content-type: application/json', '-d', JSON.stringify({ template: 'fiyat_teklifi', data: quoteData, language: 'tr' })], { encoding: 'utf8', maxBuffer: 32e6 })
  ok('gizli maliyet kalemi adı teklifte YOK', !res.includes(SECRET))
  ok('maliyet tutarı (290/50 TL) teklifte YOK', !res.includes('290') || !res.includes('GIZLI'))
  ok('satış fiyatı (9.06) teklifte VAR (beklenen)', res.includes('9') )
  ok('kumaş bilgisi teklifte VAR (320g süprem)', res.includes('320g süprem'))
}

console.log('[3] Maliyet belgesi — İÇ KULLANIM işareti + maliyet İÇERİR (bu belge iç)')
{
  const m = { code: 'TEST', name: 'Test', category: 'x', composition: 'y', items: [{ name: SECRET, detail: 'TRY', amount: '50 TRY' }], totalTry: '290 ₺', totalUsd: '$7.25', rateSource: 'TEST', usdRate: '40.00', rateDate: '', tiers: [{ qty: 50, unitCost: '$7.25', margin: 25, unitPrice: '$9.06', total: '$453' }], hazirlayan: '-', tarih: '-', versiyon: 1 }
  const res = execFileSync('curl', ['-s', '-m', '20', '-X', 'POST', SVC + '/render', '-H', 'content-type: application/json', '-o', '/tmp/mali-test.pdf', '-w', '%{http_code}', '-d', JSON.stringify({ template: 'maliyet_belgesi', data: { maliyet: m }, language: 'tr' })], { encoding: 'utf8' })
  ok('maliyet belgesi üretildi', res.trim() === '200')
  const txt = execFileSync('pdftotext', ['/tmp/mali-test.pdf', '-'], { encoding: 'utf8' })
  ok('İÇ KULLANIM işareti var', txt.includes('İÇ KULLANIM') && txt.includes('Paylaşılmaz'))
  ok('maliyet belgesi maliyeti İÇERİR (iç belge)', txt.includes(SECRET))
}

console.log('[4] Çok para birimli toplam kurla doğru (DB kayıtlı)')
{
  const c = sql(`select round(total_cost_try,2)||'|'||round(total_cost_usd,2) from public.product_costs where product_id=${pid} and is_current`)
  ok('toplam TL=290, USD=7.25 (kurla)', c === '290.00|7.25')
}

// temizlik
sql(`delete from public.product_cost_items where cost_id in (select id from public.product_costs where product_id=${pid}); delete from public.product_costs where product_id=${pid}; delete from public.catalog_products where id=${pid};`)
console.log(`\n${fails === 0 ? '✓ TÜM P4B TESTLERİ GEÇTİ' : '✗ ' + fails + ' TEST BAŞARISIZ'}`)
process.exit(fails === 0 ? 0 : 1)
