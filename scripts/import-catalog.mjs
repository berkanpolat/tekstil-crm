// P4B.2 — Katalog içe aktarma. PDF (pdftotext -layout) → ürünler; pdfimages → görseller.
// Tekrar çalıştırılabilir (koda göre upsert). --dry-run: yalnızca ayrıştır + rapor, DB'ye yazma.
// Kullanım: node scripts/import-catalog.mjs [--dry-run] [--pdf <yol>] [--images]
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const DO_IMAGES = args.includes('--images')
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? Number(args[i + 1]) : Infinity })()
const PDF = (() => { const i = args.indexOf('--pdf'); if (i >= 0) return args[i + 1]
  const cand = readdirSync('docs/kaynak').find((f) => /atalog.*\.pdf$/i.test(f)); return cand ? join('docs/kaynak', cand) : null })()
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
const sql = (s) => execFileSync('psql', [PGURL, '-qtAc', s], { encoding: 'utf8' }).trim()
const sqlSafe = (s) => s.replace(/'/g, "''")
if (!PDF || !existsSync(PDF)) { console.error('PDF bulunamadı. --pdf ile yol verin veya docs/kaynak/ altına koyun.'); process.exit(1) }
console.log('PDF:', PDF, DRY ? '(DRY-RUN)' : '')

// ── Görsel geçişi (--images): sayfa=sıra+4; ürün-boyutu görselleri documents/catalog/ altına yükler ──
if (DO_IMAGES) { await importImages(); process.exit(0) }

async function loadEnv() {
  const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
  return { url: env.VITE_SUPABASE_URL, anon: env.VITE_SUPABASE_ANON_KEY }
}
async function importImages() {
  const { url, anon } = await loadEnv()
  const supa = createClient(url, anon, { auth: { persistSession: false } })
  const { error: authErr } = await supa.auth.signInWithPassword({ email: 'ui.test@tekstilas.com', password: 'TestPass1!' })
  if (authErr) { console.error('Giriş başarısız (görsel yüklemesi için ui.test gerekli):', authErr.message); process.exit(1) }
  const { data: { user } } = await supa.auth.getUser()
  const prods = sql(`select id||'|'||code||'|'||coalesce(sort_order,0) from public.catalog_products where sort_order>0 order by sort_order`).split('\n').filter(Boolean)
    .map((l) => { const [id, code, so] = l.split('|'); return { id: Number(id), code, page: Number(so) + 4 } })
  const TYPES = ['detay', 'arka', 'yan', 'diger', 'diger']
  let done = 0, skipped = 0, imgCount = 0
  for (const p of prods.slice(0, LIMIT === Infinity ? undefined : LIMIT)) {
    if (sql(`select count(*) from public.catalog_product_images where product_id=${p.id}`) !== '0') { skipped++; continue }
    // bu sayfadaki ürün-boyutu görsellerin indeksleri (yükseklik ~1000, genişlik 400-820)
    const list = execFileSync('pdfimages', ['-list', '-f', String(p.page), '-l', String(p.page), PDF], { encoding: 'utf8' }).split('\n').slice(2)
    const keep = []; const dims = []
    for (const row of list) { const m = row.trim().split(/\s+/); if (m.length > 4) { const num = Number(m[1]), w = Number(m[3]), h = Number(m[4]); dims.push({ num, area: w * h }); if (h >= 950 && h <= 1050 && w >= 400 && w <= 820) keep.push(num) } }
    // Fallback: ürün-boyutu foto yoksa (tek kompozit görselli sayfa) en büyük görseli tek 'ana' al
    if (keep.length === 0 && dims.length) keep.push(dims.sort((a, b) => b.area - a.area)[0].num)
    const dir = mkdtempSync(join(tmpdir(), 'cat-'))
    execFileSync('pdfimages', ['-j', '-f', String(p.page), '-l', String(p.page), PDF, join(dir, 'i')])
    const files = readdirSync(dir).filter((f) => /\.(jpg|jpeg)$/i.test(f)).sort()
    let idx = 0
    for (let k = 0; k < files.length; k++) {
      if (!keep.includes(k)) continue          // yalnızca ürün görselleri
      const buf = readFileSync(join(dir, files[k]))
      const path = `catalog/${p.code}/${idx}.jpg`
      const up = await supa.storage.from('documents').upload(path, buf, { contentType: 'image/jpeg', upsert: true })
      if (up.error) { console.error(`  ${p.code} yükleme hatası:`, up.error.message); continue }
      const fid = sql(`insert into public.files (bucket, storage_path, original_name, mime_type, category, entity_type, entity_id, uploaded_by)
        values ('documents','${path}','${p.code}-${idx}.jpg','image/jpeg','image','catalog_product','${p.id}','${user.id}') returning id`)
      sql(`insert into public.catalog_product_images (product_id, file_id, image_type, sort_order) values (${p.id}, ${fid}, '${TYPES[idx] || 'diger'}', ${idx})`)
      idx++; imgCount++
    }
    rmSync(dir, { recursive: true, force: true })
    done++
    if (done % 20 === 0) console.log(`  ...${done}/${prods.length} ürün, ${imgCount} görsel`)
  }
  console.log(`Görsel: ${done} ürün işlendi (${skipped} atlandı), ${imgCount} görsel yüklendi.`)
}

// normalize_tr JS eşleniği (tür eşlemesi için)
const norm = (s) => (s || '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/[çğöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ö: 'o', ş: 's', ü: 'u' }[c]))
  .replace(/[^a-z0-9]+/g, ' ').trim()
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()

// ── PDF metnini sayfalara böl ───────────────────────────────────────────────
const fullText = execFileSync('pdftotext', ['-layout', PDF, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const pages = fullText.split('\f')
console.log(`Sayfa: ${pages.length}`)

// ── Ürün ayrıştırma ─────────────────────────────────────────────────────────
function parseProduct(t) {
  const code = (t.match(/Ürün Kodu\s{2,}(\S+)/) || [])[1]
  if (!code) return null
  const moq = parseInt((t.match(/Min\.\s*Sipariş\s*\(MOQ\)\s{2,}(\d+)/) || [])[1] || '50', 10)
  const after = t.split('ÜRÜN ÖZELLİKLERİ')[1] || ''
  const before = t.split('ÜRÜN ÖZELLİKLERİ')[0] || ''
  const kategori = clean((after.match(/Kategori\s{2,}(.+)/) || [])[1])
  const tip = clean((after.match(/Ürün\s*Tipi\s{2,}(.+)/) || [])[1])
  let komp = (after.match(/Kompozisyon\s{2,}([\s\S]*?)\s*Min\.\s*Sipariş/) || [])[1] || ''
  komp = clean(komp)
  let desc = (t.split('AÇIKLAMA')[1] || '')
  desc = desc.split(/D\s*E\s*TAY|DETAY\s*0?1/i)[0]
  desc = desc.replace(/\d{2,3}\s+İ\s*N\s*F\s*O[\s\S]*/i, '')
  desc = clean(desc)
  const sira = (before.match(/\n\s*(\d{1,3})\s*\n/) || [])[1] || null
  // Koleksiyon: PREMİUM Türkçe İ ile yazılı → İ ve I birlikte eşle
  const collRaw = ((before.replace(/\s+/g, '').match(/(CASUAL|TESETT[ÜU]R|PREM[İIı]UM)/i)) || [])[1] || ''
  const cn = collRaw.toLocaleUpperCase('tr')
  const collection = /CASUAL/.test(cn) ? 'CASUAL' : /TESETT/.test(cn) ? 'TESETTÜR' : /PREM/.test(cn) ? 'PREMIUM' : null
  // Ürün adı: koleksiyon-spaced satır ile "Kategori · Tip" özet satırı ARASI (1-2 satır olabilir)
  const bl = before.split('\n').map((s) => s.trim()).filter(Boolean)
  const summaryIdx = bl.findIndex((l) => l.includes(' · ') && !/KOLEKS/i.test(l) && !/İNFO|INFO/i.test(l))
  // Koleksiyon satırı kelimeyle BAŞLAR (başlık "STUDİO—KADINKOLEKSİYONU…" ile karışmasın)
  const kolIdx = bl.findIndex((l) => { const d = l.replace(/\s+/g, ''); return /^(CASUAL|TESETT|PREM)/i.test(d) && /KOLEKS/i.test(d) })
  let name = null
  if (summaryIdx > 0) { const start = kolIdx >= 0 && kolIdx < summaryIdx ? kolIdx + 1 : summaryIdx - 1; name = clean(bl.slice(start, summaryIdx).join(' ')) }
  return { code, name, collection, kategori, tip, composition: komp, moq, description: desc, sira }
}

const products = []
for (const p of pages) { const r = parseProduct(p); if (r) products.push(r) }
console.log(`Ayrıştırılan ürün: ${products.length}`)

// ── Kategori/tür eşleme (Faz 3 ağacı) ───────────────────────────────────────
const catRows = sql(`select id||'|'||coalesce(parent_id::text,'')||'|'||label from public.product_categories where is_active`).split('\n').filter(Boolean)
  .map((l) => { const [id, parent, ...lab] = l.split('|'); return { id: Number(id), parent: parent ? Number(parent) : null, label: lab.join('|') } })
const groups = catRows.filter((c) => c.parent == null)
const kadinGroups = new Set(groups.filter((g) => /^kadin giyim/.test(norm(g.label))).map((g) => g.id))
const ALIAS = { 't shirt': 'tisort', 'tshirt': 'tisort', 'sweatshirt': 'sweatshirt', 'esofman': 'esofman alti',
  'atlet ve body': 'body', 'takim elbise': 'ikili takim' }
function mapType(tip) {
  if (!tip) return { type_id: null, category_id: null }
  const key = ALIAS[norm(tip)] || norm(tip)
  // 1) tür eşleşmesi (Kadın grupları altında)
  const tur = catRows.find((c) => c.parent != null && kadinGroups.has(c.parent) && norm(c.label) === key)
  if (tur) return { type_id: tur.id, category_id: tur.parent }
  // 2) grup(dal) eşleşmesi: tip bir dal adıysa (ör. "Tesettür") gruba eşle, tür null
  const grp = groups.find((g) => kadinGroups.has(g.id) && norm((g.label.split('/').pop() || '')) === key)
  if (grp) return { type_id: null, category_id: grp.id }
  return { type_id: null, category_id: null }
}

// ── Rapor ───────────────────────────────────────────────────────────────────
const byColl = {}; const unmappedTypes = new Set(); const noName = []
for (const p of products) {
  byColl[p.collection || '—'] = (byColl[p.collection || '—'] || 0) + 1
  const m = mapType(p.tip); p._map = m
  if (!m.type_id) unmappedTypes.add(p.tip || '(boş)')
  if (!p.name) noName.push(p.code)
}
console.log('Koleksiyon dağılımı:', byColl)
console.log('Eşleşmeyen tipler (kategori null bırakılır):', [...unmappedTypes].join(', ') || 'yok')
if (noName.length) console.log('Adı çıkmayan ürünler:', noName.join(', '))
console.log('Örnek ilk 2:', JSON.stringify(products.slice(0, 2).map((p) => ({ code: p.code, name: p.name, coll: p.collection, tip: p.tip, komp: p.composition.slice(0, 40), moq: p.moq })), null, 1))

if (DRY) { console.log('\n(DRY-RUN — DB yazılmadı)'); process.exit(0) }

// ── Katalog + koleksiyonlar (idempotent) ────────────────────────────────────
const catName = 'Kadın Koleksiyonu 26SS'
let catId = sql(`select id from public.catalogs where name='${sqlSafe(catName)}' limit 1`)
if (!catId) catId = sql(`insert into public.catalogs (name, season, year, currency, is_active, published_at) values ('${sqlSafe(catName)}','26SS',2026,'USD',true,now()) returning id`)
const collIds = {}
for (const cn of ['CASUAL', 'TESETTÜR', 'PREMIUM']) {
  let id = sql(`select id from public.catalog_collections where catalog_id=${catId} and name='${cn}' limit 1`)
  if (!id) id = sql(`insert into public.catalog_collections (catalog_id, name, sort_order) values (${catId},'${cn}',0) returning id`)
  collIds[cn] = id
}

// ── Ürünleri upsert (koda göre) ─────────────────────────────────────────────
let ins = 0, upd = 0
for (const p of products) {
  const collId = collIds[p.collection] || 'null'
  const before = sql(`select count(*) from public.catalog_products where code='${sqlSafe(p.code)}'`)
  sql(`insert into public.catalog_products (catalog_id, collection_id, code, name, category_id, type_id, composition, description, moq, size_system, sizes, colors, sort_order)
    values (${catId}, ${collId}, '${sqlSafe(p.code)}', '${sqlSafe(p.name || p.code)}', ${p._map.category_id || 'null'}, ${p._map.type_id || 'null'},
      '${sqlSafe(p.composition)}', '${sqlSafe(p.description)}', ${p.moq}, 'Alfa', '{XS,S,M,L,XL}', '[]'::jsonb, ${Number(p.sira) || 0})
    on conflict (code) do update set collection_id=excluded.collection_id, name=excluded.name, category_id=excluded.category_id,
      type_id=excluded.type_id, composition=excluded.composition, description=excluded.description, moq=excluded.moq, sort_order=excluded.sort_order`)
  if (before === '0') ins++; else upd++
}
console.log(`Ürün: ${ins} eklendi, ${upd} güncellendi.`)
console.log(DO_IMAGES ? 'Görseller için ayrı geçiş (--images) çalıştırılacak.' : 'Görseller için: node scripts/import-catalog.mjs --images')
