// =====================================================================
// Maliyet aktarımı — AŞAMA 1: KURU KOŞU. HİÇBİR ŞEY YAZMAZ.
//   Kaynak: data/maliyet.csv → catalog_products.source_code (katalog 4)
//   Yalnız rapor üretir: eşleşme, kalem/kayıt sayısı, örnek hesap.
// =====================================================================
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CSV = join(ROOT, 'data', 'maliyet.csv')
const CATALOG_ID = 4
const RATE_USD = 47.8066 // TCMB 2026-08-17 (rapor için; canlı hesap DB'den)

const env = Object.fromEntries(readFileSync(join(ROOT, '.env'), 'utf8').split('\n')
  .filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const PGENV = { ...process.env, PGHOST: 'aws-0-eu-west-1.pooler.supabase.com', PGPORT: '5432',
  PGUSER: `postgres.${env.SUPABASE_PROJECT_REF}`, PGDATABASE: 'postgres', PGPASSWORD: env.SUPABASE_DB_PASSWORD }
const sql = (s) => execFileSync('psql', ['-q', '-tA', '-c', s], { encoding: 'utf8', env: PGENV }).trim()

// ── CSV ayrıştırıcı (tırnaklı alan) ──────────────────────────────────
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) { const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false } else field += c }
    else { if (c === '"') q = true; else if (c === ',') { row.push(field); field = '' }
      else if (c === '\r') {} else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' } else field += c } }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

const num = (v) => { const n = Number(String(v ?? '').replace(',', '.').trim()); return Number.isFinite(n) ? n : NaN }

// ── CSV oku ──────────────────────────────────────────────────────────
const rows = parseCsv(readFileSync(CSV, 'utf8'))
const header = rows.shift()
const data = rows.filter((r) => r.some((c) => (c ?? '').trim() !== ''))

// prompt'taki maliyetsiz kalacaklar (yazma, atla)
const SKIP = new Set(['BB_C_01', 'BB_C_03', 'BB_P_02', 'E_P_14', 'K_P_07', 'Beyaz Yelekli Takım'])

// ── Katalog source_code → {id, composition} ─────────────────────────
const catRows = sql(`select source_code, id, coalesce(composition,'') from catalog_products where catalog_id=${CATALOG_ID} and source_code is not null`).split('\n').filter(Boolean)
const cat = new Map()
for (const line of catRows) { const [sc, id, comp] = line.split('|'); cat.set(sc, { id: Number(id), composition: comp }) }

// ── Analiz ───────────────────────────────────────────────────────────
const parsed = data.map((r) => ({
  code: (r[0] ?? '').trim(), fabric: (r[1] ?? '').trim(),
  metre: num(r[2]), birim: num(r[3]), iscilik: num(r[4]), aksesuar: num(r[5]), raw: r,
}))

const matched = [], unmatched = [], skipped = [], noNumbers = []
for (const p of parsed) {
  if (SKIP.has(p.code)) { skipped.push(p); continue }
  const hit = cat.get(p.code)
  if (!hit) { unmatched.push(p); continue }
  // rakam var mı? kumaş metre+birim veya işçilik olmalı
  const hasFabric = Number.isFinite(p.metre) && Number.isFinite(p.birim) && p.metre > 0 && p.birim > 0
  const hasIscilik = Number.isFinite(p.iscilik) && p.iscilik > 0
  const hasAks = Number.isFinite(p.aksesuar) && p.aksesuar > 0
  if (!hasFabric && !hasIscilik && !hasAks) { noNumbers.push(p); continue }
  matched.push({ ...p, ...hit, hasFabric, hasIscilik, hasAks })
}

// ── kalem/kayıt sayımı ───────────────────────────────────────────────
let items = 0, kumas = 0, isc = 0, aks = 0
for (const m of matched) {
  if (m.hasFabric) { items++; kumas++ }
  if (m.hasIscilik) { items++; isc++ }
  if (m.hasAks) { items++; aks++ }
}

console.log('════════════ MALİYET AKTARIMI — KURU KOŞU RAPORU ════════════')
console.log(`CSV başlık: ${header.join(' | ')}`)
console.log(`CSV veri satırı: ${data.length}   Katalog(4) source_code'lu ürün: ${cat.size}`)

console.log(`\n── 1) EŞLEŞME ──`)
console.log(`  Eşleşti (maliyet yazılacak): ${matched.length}`)
console.log(`  Atlandı (prompt-skip listesi): ${skipped.length}`)
for (const s of skipped) console.log(`     • ${s.code}`)
console.log(`  Rakamsız (kalem yok, atla): ${noNumbers.length}`)
for (const s of noNumbers) console.log(`     • ${s.code}  (kumaş="${s.fabric}", metre=${s.raw[2]}, birim=${s.raw[3]}, işç=${s.raw[4]}, aks=${s.raw[5]})`)
console.log(`  EŞLEŞMEDİ (source_code katalogda yok): ${unmatched.length}`)
for (const s of unmatched) console.log(`     • ${s.code}  (kumaş="${s.fabric}")`)

// katalogda olup CSV'de olmayan (maliyetsiz kalacak) — bilgi
const csvCodes = new Set(parsed.map((p) => p.code))
const catOnly = [...cat.keys()].filter((k) => !csvCodes.has(k))
console.log(`\n  (bilgi) Katalogda olup CSV'de HİÇ olmayan: ${catOnly.length}`)
if (catOnly.length) console.log('     ' + catOnly.join(', '))

console.log(`\n── 2) YAZILACAK ──`)
console.log(`  product_costs kaydı: ${matched.length}`)
console.log(`  product_cost_items kalem: ${items}  (kumaş=${kumas}, işçilik=${isc}, aksesuar=${aks})`)
console.log(`  Aksesuar 0/boş → kalem yazılmayan ürün: ${matched.length - aks}`)
console.log(`  İşçilik 0/boş → işçilik kalemi olmayan: ${matched.length - isc}`)
console.log(`  Kumaş eksik (metre/birim 0) → kumaş kalemi olmayan: ${matched.length - kumas}`)

console.log(`\n── 3) ÖRNEK 3 ÜRÜN (canlı kur USD=${RATE_USD}) ──`)
for (const m of matched.slice(0, 3)) {
  const kumasUsd = m.hasFabric ? m.metre * m.birim : 0
  const kumasTry = kumasUsd * RATE_USD
  const iscTry = m.hasIscilik ? m.iscilik : 0
  const aksTry = m.hasAks ? m.aksesuar : 0
  const totTry = kumasTry + iscTry + aksTry
  const totUsd = totTry / RATE_USD
  console.log(`  ${m.code} → ürün#${m.id}  (katalog composition="${m.composition || '—'}", CSV kumaş="${m.fabric}")`)
  console.log(`     Kumaş : ${m.metre} m × $${m.birim} = $${kumasUsd.toFixed(2)}  → ${kumasTry.toFixed(2)} ₺`)
  console.log(`     İşçilik: ${iscTry.toFixed(2)} ₺` + (m.hasIscilik ? '' : '  (yok)'))
  console.log(`     Aksesuar: ${aksTry.toFixed(2)} ₺` + (m.hasAks ? '' : '  (0 → kalem yok)'))
  console.log(`     TOPLAM : ${totTry.toFixed(2)} ₺  ≈  $${totUsd.toFixed(2)}`)
}
console.log('\n════════════ DUR — hiçbir şey yazılmadı ════════════')
