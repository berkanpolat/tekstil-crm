// =====================================================================
// Katalog aktarımı — data/urunler.csv (197 ürün) + indirilen görseller.
//   Kaynak görseller: data/katalog-gorseller/<ÜRÜN_KODU>/*.webp
//   Hedef: catalogs (tek katalog) + catalog_products + Storage + files +
//          catalog_product_images
// KURU KOŞU varsayılan: --dry-run VERİLMEZSE de önce sorar; yazma için --write.
//   node scripts/paket-katalog-aktar.mjs            # kuru koşu (yalnız rapor)
//   node scripts/paket-katalog-aktar.mjs --write    # DB'ye yaz + görsel yükle
// Bağlantı: pooler (.env SUPABASE_DB_PASSWORD), diğer scriptlerle aynı.
// Kategori eşleme: SQL normalize_tr() ile (ham upper/lower Türkçe İ/ı bozar).
// =====================================================================
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CSV = join(ROOT, 'data', 'urunler.csv')
const IMG_DIR = join(ROOT, 'data', 'katalog-gorseller')
const CATALOG_NAME = 'Tekstilaş Ürün Kataloğu'
const WRITE = process.argv.includes('--write')

// ── Bağlantı (pooler) ────────────────────────────────────────────────
const env = Object.fromEntries(readFileSync(join(ROOT, '.env'), 'utf8').split('\n')
  .filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const PGENV = { ...process.env, PGHOST: 'aws-0-eu-west-1.pooler.supabase.com', PGPORT: '5432',
  PGUSER: `postgres.${env.SUPABASE_PROJECT_REF}`, PGDATABASE: 'postgres', PGPASSWORD: env.SUPABASE_DB_PASSWORD }
// -q şart: yoksa INSERT/UPDATE "INSERT 0 1" etiketini stdout'a basar ve returning id'yi bozar.
const sql = (s) => execFileSync('psql', ['-q', '-tA', '-c', s], { encoding: 'utf8', env: PGENV }).trim()
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`

// ── CSV ayrıştırıcı (tırnaklı çok-satırlı alan) ──────────────────────
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) { const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false } else field += c }
    else { if (c === '"') q = true; else if (c === ',') { row.push(field); field = '' }
      else if (c === '\r') {} else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' } else field += c } }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

const rows = parseCsv(readFileSync(CSV, 'utf8'))
const H = rows[0]
const ci = (name) => H.indexOf(name)
const iSira = ci('Sıra No'), iCode = ci('Ürün Kodu'), iName = ci('Ürün Adı'), iCat = ci('Kategori'), iDesc = ci('Açıklama / Bakım')
const products = rows.slice(1).filter((r) => r[iCode]).map((r) => ({
  sira: parseInt((r[iSira] || '').trim(), 10) || 0,
  code: (r[iCode] || '').trim(), name: (r[iName] || '').trim(),
  category: (r[iCat] || '').trim(), description: (r[iDesc] || '').trim().replace(/\s+/g, ' '),
}))

// ── Mükerrer kod kontrolü ────────────────────────────────────────────
const codeCount = {}
for (const p of products) codeCount[p.code] = (codeCount[p.code] || 0) + 1
const dupCodes = Object.entries(codeCount).filter(([, n]) => n > 1)

// ── Kategori eşleme (SQL normalize_tr) ───────────────────────────────
// CSV'deki farklı kategori etiketleri → normalize_tr ile grupla (T-Shirt=T-shirt).
const csvCats = [...new Set(products.map((p) => p.category).filter(Boolean))]
// normalize edilmiş → gösterilecek ham etiket + ürün sayısı
const normOf = {} // rawLabel -> normalized (SQL)
{
  // tek sorguda tüm ham etiketlerin normalize_tr karşılığını al
  const vals = csvCats.map((c, i) => `(${i}, ${lit(c)})`).join(',')
  const out = sql(`select i||'|'||normalize_tr(v) from (values ${vals}) as t(i,v)`)
  out.split('\n').filter(Boolean).forEach((line) => { const [i, n] = line.split('|'); normOf[csvCats[Number(i)]] = n })
}
// normalized grup → { rawLabels[], productCount }
const catGroups = {}
for (const p of products) {
  if (!p.category) { (catGroups.__EMPTY__ ??= { raws: new Set(), n: 0 }); catGroups.__EMPTY__.n++; continue }
  const nz = normOf[p.category]
  const g = (catGroups[nz] ??= { raws: new Set(), n: 0 })
  g.raws.add(p.category); g.n++
}

// DB kategorilerini yükle: id, label, parent_id, normalize_tr(label), yaprak mı
const dbCats = sql(`select c.id||'|'||coalesce(c.parent_id::text,'')||'|'||
  (case when exists(select 1 from public.product_categories x where x.parent_id=c.id) then '0' else '1' end)||'|'||
  normalize_tr(c.label)||'|'||c.label
  from public.product_categories c where c.is_active order by c.id`)
  .split('\n').filter(Boolean).map((l) => { const [id, parent, leaf, norm, ...lab] = l.split('|')
    return { id: Number(id), parent: parent ? Number(parent) : null, leaf: leaf === '1', norm, label: lab.join('|') } })

// Ağaç yolu (kök→düğüm) — hangi cinsiyet dalında olduğunu göstermek için
const byId = Object.fromEntries(dbCats.map((c) => [c.id, c]))
const pathOf = (c) => { const parts = []; let cur = c; let guard = 0
  while (cur && guard++ < 20) { parts.unshift(cur.label); cur = cur.parent ? byId[cur.parent] : null }
  return parts.join(' / ') }

// ── KARAR (kullanıcı onayı — güncel) ─────────────────────────────────
// Bu bir KADIN koleksiyonu: belirsiz kategorilerde "Kadın Giyim / *" alt ağacını
// varsayılan al. Kadın ağacında karşılığı olmayan kategori → null (listelenir).
const ALIAS = { 't shirt': 'tisort', 'tshirt': 'tisort', 'esofman': 'esofman alti', 'atlet ve body': 'body' }
const EXPLICIT = { tesettur: 186 } // Kadın Giyim / Tesettür grup düğümü (tek yaprak yok, alt tipleri kapsar)

// Kadın Giyim / * grup düğümlerinin altındaki yapraklar: normalize_tr(label) → id
const kadinLeaves = Object.fromEntries(
  sql(`select normalize_tr(c.label)||'|'||c.id from public.product_categories c
    join public.product_categories g on g.id=c.parent_id
    where g.parent_id is null and normalize_tr(g.label) like 'kadin giyim%' and c.is_active`)
    .split('\n').filter(Boolean).map((l) => { const i = l.lastIndexOf('|'); return [l.slice(0, i), Number(l.slice(i + 1))] }))

// nz → { id, note } : id null ise atanmaz
function resolveCategory(nz) {
  if (EXPLICIT[nz] != null) return { id: EXPLICIT[nz], note: 'Kadın Giyim / Tesettür grubu' }
  const key = ALIAS[nz] || nz
  if (kadinLeaves[key] != null) return { id: kadinLeaves[key], note: key === nz ? 'Kadın ağacı' : `Kadın ağacı (alias: ${nz}→${key})` }
  return { id: null, note: 'Kadın ağacında karşılığı yok → null' }
}

const catReport = []
for (const [nz, g] of Object.entries(catGroups)) {
  if (nz === '__EMPTY__') { catReport.push({ nz, raws: ['(boş)'], n: g.n, res: { id: null, note: 'kategori boş' } }); continue }
  catReport.push({ nz, raws: [...g.raws], n: g.n, res: resolveCategory(nz) })
}
// Her ürüne category_id ata
for (const p of products) p._categoryId = p.category ? resolveCategory(normOf[p.category]).id : null

// ── Görsel envanteri ─────────────────────────────────────────────────
const imgInventory = {} // code -> [dosya yolları sıralı]
let totalImgFiles = 0
for (const p of products) {
  const dir = join(IMG_DIR, p.code)
  if (!existsSync(dir)) { imgInventory[p.code] = []; continue }
  const files = readdirSync(dir).filter((f) => /\.(webp|jpg|jpeg)$/i.test(f))
    .sort((a, b) => parseInt(a) - parseInt(b))
  imgInventory[p.code] = files.map((f) => join(dir, f))
  totalImgFiles += files.length
}
const noImageProducts = products.filter((p) => imgInventory[p.code].length === 0)

// =====================================================================
// RAPOR
// =====================================================================
console.log('='.repeat(64))
console.log('KATALOG AKTARIMI — ' + (WRITE ? 'YAZMA MODU (--write)' : 'KURU KOŞU (yazma yok)'))
console.log('='.repeat(64))
console.log(`\nKatalog          : "${CATALOG_NAME}" (tek katalog, koleksiyon yok)`)
console.log(`CSV ürün sayısı  : ${products.length}`)
console.log(`Mükerrer kod     : ${dupCodes.length ? dupCodes.map(([c, n]) => `${c}×${n}`).join(', ') : 'YOK'}`)

console.log(`\n--- KATEGORİ EŞLEME (${csvCats.length} ham etiket → ${Object.keys(catGroups).filter((k) => k !== '__EMPTY__').length} normalize grup) ---`)
let prodWithCat = 0, prodNullCat = 0
for (const r of catReport.sort((a, b) => b.n - a.n)) {
  if (r.nz === '__EMPTY__') { prodNullCat += r.n; console.log(`  – (kategori boş)  (${r.n} ürün)  →  null`); continue }
  const rawStr = r.raws.length > 1 ? `${r.raws.join(' + ')} (BİRLEŞTİ)` : r.raws[0]
  if (r.res.id != null) { prodWithCat += r.n
    console.log(`  ✓ ${rawStr}  (${r.n} ürün)  →  [${r.res.id}] ${pathOf(byId[r.res.id])}  (${r.res.note})`)
  } else { prodNullCat += r.n
    console.log(`  ○ ${rawStr}  (${r.n} ürün)  →  null  (${r.res.note})`)
  }
}
console.log(`\nKategori atanan ürün: ${prodWithCat} | category_id=null: ${prodNullCat}`)

console.log(`\n--- GÖRSELLER ---`)
console.log(`Toplam görsel dosyası : ${totalImgFiles}`)
console.log(`Ürün başına ortalama  : ${(totalImgFiles / products.length).toFixed(2)}`)
console.log(`Görseli olmayan ürün  : ${noImageProducts.length}`)
if (noImageProducts.length) for (const p of noImageProducts) console.log(`   - ${p.code}  ${p.name}`)

if (!WRITE) {
  console.log('\n' + '='.repeat(64))
  console.log('KURU KOŞU tamam — DB\'ye HİÇBİR ŞEY yazılmadı. Onay sonrası: --write')
  console.log('='.repeat(64))
  process.exit(0)
}

// =====================================================================
// YAZMA (--write) — Aşama 2
// =====================================================================
// Görsel indirmesi tamamlanmış olmalı (idempotent ama eksik inmiş ürünler atlanır).
const folderCount = existsSync(IMG_DIR) ? readdirSync(IMG_DIR).length : 0
if (folderCount < products.length && !process.argv.includes('--force')) {
  console.error(`\nDURDU: görsel klasörü ${folderCount}/${products.length} — indirme bitmemiş. Bitince tekrar çalıştır (veya --force).`)
  process.exit(1)
}

const supa = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// ── 1) Katalog (idempotent, ada göre) ────────────────────────────────
let catId = sql(`select id from public.catalogs where name=${lit(CATALOG_NAME)} limit 1`)
if (!catId) catId = sql(`insert into public.catalogs (name, currency, is_active, published_at) values (${lit(CATALOG_NAME)}, 'USD', true, now()) returning id`)
console.log(`Katalog id=${catId}`)

// ── 2) Ürünler (upsert, koda göre) ───────────────────────────────────
let ins = 0, upd = 0
for (const p of products) {
  const before = sql(`select count(*) from public.catalog_products where code=${lit(p.code)}`)
  sql(`insert into public.catalog_products (catalog_id, code, name, description, category_id, sort_order)
    values (${catId}, ${lit(p.code)}, ${lit(p.name || p.code)}, ${p.description ? lit(p.description) : 'null'}, ${p._categoryId ?? 'null'}, ${p.sira})
    on conflict (code) do update set catalog_id=excluded.catalog_id, name=excluded.name,
      description=excluded.description, category_id=excluded.category_id, sort_order=excluded.sort_order`)
  if (before === '0') ins++; else upd++
}
console.log(`Ürün: ${ins} eklendi, ${upd} güncellendi.`)

// ── 3) Görseller (Storage + files + catalog_product_images) ───────────
let imgUploaded = 0, prodImgDone = 0, prodImgSkip = 0
const mimeOf = (f) => (/\.webp$/i.test(f) ? 'image/webp' : 'image/jpeg')
for (const p of products) {
  const pid = sql(`select id from public.catalog_products where code=${lit(p.code)} limit 1`)
  const files = imgInventory[p.code]
  if (!files.length) continue
  if (sql(`select count(*) from public.catalog_product_images where product_id=${pid}`) !== '0') { prodImgSkip++; continue }
  let idx = 0
  for (const abs of files) {
    const buf = readFileSync(abs)
    const ext = abs.split('.').pop().toLowerCase()
    const path = `catalog/${p.code}/${idx + 1}.${ext}`
    const up = await supa.storage.from('documents').upload(path, buf, { contentType: mimeOf(abs), upsert: true })
    if (up.error) { console.error(`  ${p.code} görsel ${idx + 1} yükleme hatası: ${up.error.message}`); continue }
    const fid = sql(`insert into public.files (bucket, storage_path, original_name, mime_type, size_bytes, category, entity_type, entity_id)
      values ('documents', ${lit(path)}, ${lit(`${p.code}-${idx + 1}.${ext}`)}, ${lit(mimeOf(abs))}, ${buf.length}, 'image', 'catalog_product', ${lit(String(pid))}) returning id`)
    sql(`insert into public.catalog_product_images (product_id, file_id, image_type, sort_order)
      values (${pid}, ${fid}, ${idx === 0 ? "'ana'" : "'diger'"}, ${idx})`)
    idx++; imgUploaded++
  }
  prodImgDone++
  if (prodImgDone % 25 === 0) console.log(`  ...${prodImgDone} ürün görseli, ${imgUploaded} dosya`)
}
console.log(`Görsel: ${prodImgDone} ürün yüklendi (${prodImgSkip} zaten vardı), ${imgUploaded} dosya.`)

// ── 4) Doğrulama ─────────────────────────────────────────────────────
console.log('\n--- DOĞRULAMA ---')
console.log(`catalogs            : ${sql(`select count(*) from public.catalogs where id=${catId}`)}`)
console.log(`catalog_products    : ${sql(`select count(*) from public.catalog_products where catalog_id=${catId}`)} (beklenen ${products.length})`)
console.log(`catalog_product_images: ${sql(`select count(*) from public.catalog_product_images i join public.catalog_products p on p.id=i.product_id where p.catalog_id=${catId}`)}`)
console.log(`  ana görselli ürün : ${sql(`select count(distinct product_id) from public.catalog_product_images i join public.catalog_products p on p.id=i.product_id where p.catalog_id=${catId} and i.image_type='ana'`)}`)
console.log(`  kategori atanan   : ${sql(`select count(*) from public.catalog_products where catalog_id=${catId} and category_id is not null`)}`)
console.log('Kategori dağılımı (atanan):')
console.log(sql(`select '  '||coalesce(pc.label,'(null)')||': '||count(*) from public.catalog_products cp left join public.product_categories pc on pc.id=cp.category_id where cp.catalog_id=${catId} group by pc.label order by count(*) desc`))
