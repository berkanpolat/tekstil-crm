#!/usr/bin/env node
// =====================================================================
// YENİ SEZON KATALOG aktarımı — SIRA 2-5 (katalog → kategori → koleksiyon → ürün)
//   Kaynak: data/yeni-katalog.csv (475 ürün)
//   Mevcut "Tekstilaş Ürün Kataloğu" (197 ürün) + 342 kategori ağacına DOKUNMAZ.
// İdempotent: (catalog_id, source_code) çakışmasında GÜNCELLER, kopya oluşturmaz.
// Görsel yükleme AYRI script (bu script Storage'a DOKUNMAZ).
// Çalıştır:  node scripts/yeni-katalog-aktar.mjs
// =====================================================================
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CSV = join(ROOT, 'data', 'yeni-katalog.csv')
const STAGING = join(ROOT, 'scripts', '.katalog-urunler-staging.csv')
const GENSQL = join(ROOT, 'scripts', '.katalog-aktar.generated.sql')

const pass = process.env.PGPASSWORD || readFileSync(join(ROOT, '.env'), 'utf8')
  .split('\n').find(l => l.startsWith('SUPABASE_DB_PASSWORD='))?.split('=').slice(1).join('=').trim()
const ENV = { ...process.env, PGHOST: 'aws-0-eu-west-1.pooler.supabase.com', PGPORT: '5432', PGUSER: 'postgres.kkxvoxeqfsaqzklrtgrw', PGDATABASE: 'postgres', PGPASSWORD: pass }

// --- CSV ayrıştırıcı (tırnaklı çok-satırlı alanlar dahil) ---
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false } else field += c }
    else { if (c === '"') q = true; else if (c === ',') { row.push(field); field = '' } else if (c === '\r') {} else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' } else field += c }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

// --- KUMAŞ: onaylı 36-kanonik küratörlü sözlük ---
const KUMAS = {
  'Pamuk Keten': 'Pamuk Keten', 'PAMUK KETEN': 'Pamuk Keten',
  'Medine İpeği': 'Medine İpeği', 'MEDİNE İPEĞİ': 'Medine İpeği',
  'İki İplik': 'İki İplik', 'İKİ İPLİK': 'İki İplik',
  'COMPACT PENYE (%100 PAMUK)': 'Compact Penye (%100 Pamuk)', 'Compact Penye (%100 Pamuk)': 'Compact Penye (%100 Pamuk)',
  'MODAL': 'Modal', 'Modal': 'Modal',
  'DENIM': 'Denim', 'Denim': 'Denim',
  'CREP': 'Krep', 'Krep': 'Krep',
  'DOUBLE': 'Double',
  'SATEN': 'Saten', 'Saten': 'Saten',
  'TERİKOTON': 'Terikoton',
  'Kaşkorse': 'Kaşkorse', 'KAŞKORSE': 'Kaşkorse',
  'VISCON': 'Viscon', 'Viskon': 'Viscon',
  'ŞİFON': 'Şifon', 'Şifon': 'Şifon',
  'OYSHO': 'Oysho',
  'TENCEL': 'Tencel', 'Tensel': 'Tencel',
  'TÜVİT': 'Tüvit',
  'SCUBA': 'Scuba',
  'SANDY': 'Sandy',
  'PLİSELİ JERSEY': 'Pliseli Jersey',
  'ÖZEL ÖRGÜ': 'Özel Örgü',
  'Tül': 'Tül', 'TÜL': 'Tül',
  'CUPRA': 'Kupra', 'Kupra': 'Kupra',
  'PARAŞÜT': 'Paraşüt',
  'KETEN': 'Keten',
  'PERA KETEN': 'Pera Keten',
  'TRİKO': 'Triko', 'Triko': 'Triko',
  'PİKE CUPRA': 'Pike Cupra',
  'DANTEL': 'Dantel',
  'LAME': 'Lame',
  'PUL PAYET': 'Pul Payet',
  'POLİVİSKON DOKUMA': 'Poliviskon Dokuma',
  'SÜET': 'Süet', 'Süet': 'Süet',
  'GABARDİN': 'Gabardin',
  'Filamlı Keten': 'Filamlı Keten',
  'Gübür': 'Gübür',
  'VISCON+TERİKOTON': 'Viscon+Terikoton',
}

// --- KATEGORİ: CSV değeri -> (key, label) ; sort_order = liste sırası ---
const KATEGORILER = [
  ['ELBİSE', 'ys_elbise', 'Elbise'],
  ['TUNİK', 'ys_tunik', 'Tunik'],
  ['FERACE', 'ys_ferace', 'Ferace'],
  ['PANTOLON', 'ys_pantolon', 'Pantolon'],
  ['ETEK', 'ys_etek', 'Etek'],
  ['GÖMLEK', 'ys_gomlek', 'Gömlek'],
  ['CEKET', 'ys_ceket', 'Ceket'],
  ['TULUM', 'ys_tulum', 'Tulum'],
  ['SWEATSHIRT', 'ys_sweatshirt', 'Sweatshirt'],
  ['TSHIRT', 'ys_tshirt', 'T-Shirt'],
  ['KİMONO & PANÇO', 'ys_kimono_panco', 'Kimono & Panço'],
  ['ALT ÜST TAKIM', 'ys_alt_ust_takim', 'Alt Üst Takım'],
  ['BLUZ & BÜSTİYER', 'ys_bluz_bustiyer', 'Bluz & Büstiyer'],
  ['EV GİYİM', 'ys_ev_giyim', 'Ev Giyim'],
]
const KAT_KEY = Object.fromEntries(KATEGORILER.map(([csv, key]) => [csv, key]))

// --- KOLEKSİYON: CSV ALT KATEGORİ -> (name, code, sort) ---
const KOLEKSIYONLAR = [['Tesettür', 'tesettur', 1], ['Premium', 'premium', 2], ['Casual', 'casual', 3]]

const CATALOG_NAME = 'Yeni Sezon Katalog'

// name_normalized: mevcut katalog kalıbı (küçük harf + Türkçe fold + alfasayısal)
function norm(s) {
  return s.toLocaleLowerCase('tr')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}
const csvQuote = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"'

// ---------- CSV oku, doğrula, staging üret ----------
const rows = parseCsv(readFileSync(CSV, 'utf8'))
const H = rows[0]
const data = rows.slice(1).filter(r => r.some(x => x && x.trim()))
const iKat = H.indexOf('KATEGORİ'), iAlt = H.indexOf('ALT KATEGORİ'), iKod = H.indexOf('Kodlar'),
  iKumas = H.indexOf('KUMAŞ'), iAd = H.indexOf('ÜRÜN ADI'), iAcik = H.indexOf('AÇIKLAMA')

const hatalar = []
const seenKod = new Set()
const stagingLines = ['source_code,code,name,name_normalized,composition,description,category_key,collection_name,sort_order']
data.forEach((r, idx) => {
  const kod = (r[iKod] || '').trim()
  const kat = (r[iKat] || '').trim()
  const alt = (r[iAlt] || '').trim()
  const kumasRaw = (r[iKumas] || '').trim()
  const ad = (r[iAd] || '').trim()
  const acik = (r[iAcik] || '').replace(/[\r\n]+/g, ' ').trim()
  const catKey = KAT_KEY[kat]
  const kumas = KUMAS[kumasRaw]
  if (!kod) hatalar.push(`satır ${idx + 2}: boş Kodlar`)
  else if (seenKod.has(kod)) hatalar.push(`satır ${idx + 2}: mükerrer Kodlar "${kod}"`)
  else seenKod.add(kod)
  if (!ad) hatalar.push(`satır ${idx + 2}: boş ÜRÜN ADI`)
  if (!catKey) hatalar.push(`satır ${idx + 2}: bilinmeyen kategori "${kat}"`)
  if (!kumas) hatalar.push(`satır ${idx + 2}: sözlükte yok kumaş "${kumasRaw}"`)
  if (!KOLEKSIYONLAR.find(k => k[0] === alt)) hatalar.push(`satır ${idx + 2}: bilinmeyen koleksiyon "${alt}"`)
  const code = 'YS-' + String(idx + 1).padStart(4, '0')
  stagingLines.push([kod, code, ad, norm(ad), kumas, acik, catKey, alt, idx + 1].map(csvQuote).join(','))
})

if (hatalar.length) {
  console.error('!!! DOĞRULAMA HATASI — YAZILMADI:')
  hatalar.slice(0, 25).forEach(h => console.error('  ' + h))
  if (hatalar.length > 25) console.error(`  (toplam ${hatalar.length} hata)`)
  process.exit(1)
}
writeFileSync(STAGING, stagingLines.join('\n') + '\n')
console.log(`Staging üretildi: ${data.length} ürün → ${STAGING}`)

// ---------- Idempotent SQL üret ----------
const catChildValues = KATEGORILER.map(([, key, label], i) => `('${key}','${label.replace(/'/g, "''")}',${i + 1})`).join(',\n    ')
const collValues = KOLEKSIYONLAR.map(([name, code, ord]) => `('${name.replace(/'/g, "''")}','${code}',${ord})`).join(',\n    ')

const sqlText = `
\\set ON_ERROR_STOP on
BEGIN;

-- (2) Katalog (idempotent, ada göre)
INSERT INTO public.catalogs (name, season, year, currency, is_active)
SELECT '${CATALOG_NAME}', '26SS', 2026, 'USD', true
WHERE NOT EXISTS (SELECT 1 FROM public.catalogs WHERE name = '${CATALOG_NAME}');

-- (3a) Kök kategori
INSERT INTO public.product_categories (key, label, parent_id, sort_order, is_active, is_system)
VALUES ('ys_root', 'Yeni Sezon', NULL, 100, true, false)
ON CONFLICT (key) DO NOTHING;

-- (3b) 14 çocuk kategori
INSERT INTO public.product_categories (key, label, parent_id, sort_order, is_active, is_system)
SELECT v.key, v.label, (SELECT id FROM public.product_categories WHERE key = 'ys_root'), v.ord, true, false
FROM (VALUES
    ${catChildValues}
) AS v(key, label, ord)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label, parent_id = EXCLUDED.parent_id, sort_order = EXCLUDED.sort_order;

-- (4) 3 koleksiyon (katalog-scoped, idempotent)
INSERT INTO public.catalog_collections (catalog_id, name, code, sort_order, is_active)
SELECT (SELECT id FROM public.catalogs WHERE name = '${CATALOG_NAME}'), v.name, v.code, v.ord, true
FROM (VALUES
    ${collValues}
) AS v(name, code, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.catalog_collections cc
  WHERE cc.catalog_id = (SELECT id FROM public.catalogs WHERE name = '${CATALOG_NAME}') AND cc.name = v.name
);

-- (5) Ürünler — staging temp tablo + idempotent upsert (source_code anahtarı)
CREATE TEMP TABLE stg (
  source_code text, code text, name text, name_normalized text,
  composition text, description text, category_key text, collection_name text, sort_order int
) ON COMMIT DROP;

\\copy stg FROM '${STAGING.replace(/'/g, "''")}' WITH (FORMAT csv, HEADER true)

-- name_normalized: GENERATED kolon (DB otomatik hesaplar) — insert edilmez.
INSERT INTO public.catalog_products
  (catalog_id, collection_id, code, source_code, name, category_id, composition, description, sort_order, is_active)
SELECT c.id, col.id, s.code, s.source_code, s.name, cat.id, s.composition, s.description, s.sort_order, true
FROM stg s
JOIN public.catalogs c ON c.name = '${CATALOG_NAME}'
JOIN public.product_categories cat ON cat.key = s.category_key
JOIN public.catalog_collections col ON col.catalog_id = c.id AND col.name = s.collection_name
ON CONFLICT (catalog_id, source_code) WHERE source_code IS NOT NULL AND deleted_at IS NULL
DO UPDATE SET
  code = EXCLUDED.code, name = EXCLUDED.name,
  category_id = EXCLUDED.category_id, collection_id = EXCLUDED.collection_id,
  composition = EXCLUDED.composition, description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order, updated_at = now();

COMMIT;
`
writeFileSync(GENSQL, sqlText)
console.log(`SQL üretildi: ${GENSQL}`)
console.log('psql ile uygulanıyor...\n')
const out = execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-f', GENSQL], { encoding: 'utf8', env: ENV })
console.log(out)
console.log('✓ Sıra 2-5 tamamlandı.')
