// =====================================================================
// Maliyet aktarımı — AŞAMA 2: YAZMA.  data/maliyet.csv → product_costs.
//   node scripts/maliyet-aktar.mjs            # KURU KOŞU (yalnız rapor + KATMAN 2/3/4)
//   node scripts/maliyet-aktar.mjs --write    # tek transaction yaz + KATMAN 1/2/3/4
//
//   Eşleştirme : "Ürün Kodu" → catalog_products.source_code (katalog 4)
//   İdempotent : hedef product_id'lerin ESKİ product_costs'u silinir (cascade),
//                yeniden version=1 is_current=true yazılır. Kapsam SADECE 469 ürün;
//                katalog 2 / ST- ürünlerine dokunulmaz.
//   Kur        : exchange_rates.is_current (CANLI) — rate_snapshot = kayıt anı kuru.
//   Kumaş adı  : fabric_name = katalog composition, name = "Kumaş — <CSV orijinal>".
// =====================================================================
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CSV = join(ROOT, 'data', 'maliyet.csv')
const GEN_SQL = join(ROOT, 'scripts', '.maliyet-aktar.generated.sql')
const CATALOG_ID = 4
const WRITE = process.argv.includes('--write')
const TOL = 0.01 // kuruş toleransı

// ── Bağlantı (pooler) ────────────────────────────────────────────────
const env = Object.fromEntries(readFileSync(join(ROOT, '.env'), 'utf8').split('\n')
  .filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const PGENV = { ...process.env, PGHOST: 'aws-0-eu-west-1.pooler.supabase.com', PGPORT: '5432',
  PGUSER: `postgres.${env.SUPABASE_PROJECT_REF}`, PGDATABASE: 'postgres', PGPASSWORD: env.SUPABASE_DB_PASSWORD }
const sql = (s) => execFileSync('psql', ['-q', '-tA', '-c', s], { encoding: 'utf8', env: PGENV }).trim()
const runFile = (f) => execFileSync('psql', ['-q', '-v', 'ON_ERROR_STOP=1', '-1', '-f', f], { encoding: 'utf8', env: PGENV })
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`
const numOrNull = (n) => (Number.isFinite(n) ? String(n) : 'NULL')

// ── CSV ayrıştırıcı ──────────────────────────────────────────────────
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
const money = (n) => Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Kur (canlı) + marj kademeleri + katalog haritası ─────────────────
const rateRows = sql(`select currency, rate_try, rate_date, source from exchange_rates where is_current`).split('\n').filter(Boolean)
const RATE = { TRY: 1 }; let RATE_DATE = '', RATE_SRC = 'TCMB'
for (const r of rateRows) { const [cur, rt, dt, src] = r.split('|'); RATE[cur] = Number(rt); RATE_DATE = dt; RATE_SRC = src }
if (!(RATE.USD > 0)) { console.error('USD kuru okunamadı, dur.'); process.exit(1) }

const tierRows = sql(`select min_quantity, margin_percent from margin_tiers where is_active order by min_quantity`).split('\n').filter(Boolean)
  .map((l) => { const [mq, mp] = l.split('|'); return { min: Number(mq), margin: Number(mp) } })

const catRows = sql(`select source_code, id, coalesce(composition,''), name from catalog_products where catalog_id=${CATALOG_ID} and source_code is not null`).split('\n').filter(Boolean)
const cat = new Map()
for (const line of catRows) { const [sc, id, comp, ...rest] = line.split('|'); cat.set(sc, { id: Number(id), composition: comp, name: rest.join('|') }) }

// ── CSV → kayıtlar ───────────────────────────────────────────────────
const SKIP = new Set(['BB_C_01', 'BB_C_03', 'BB_P_02', 'E_P_14', 'K_P_07', 'Beyaz Yelekli Takım'])
const rows = parseCsv(readFileSync(CSV, 'utf8')); rows.shift()
const data = rows.filter((r) => r.some((c) => (c ?? '').trim() !== ''))

const records = [], skipped = [], unmatched = []
for (const r of data) {
  const code = (r[0] ?? '').trim(), fabric = (r[1] ?? '').trim()
  const metre = num(r[2]), birim = num(r[3]), iscilik = num(r[4]), aksesuar = num(r[5])
  if (SKIP.has(code)) { skipped.push(code); continue }
  const hit = cat.get(code)
  if (!hit) { unmatched.push(code); continue }
  const hasFabric = metre > 0 && birim > 0, hasIsc = iscilik > 0, hasAks = aksesuar > 0
  if (!hasFabric && !hasIsc && !hasAks) { unmatched.push(code + ' (rakamsız)'); continue }
  const items = []
  if (hasFabric) items.push({ item_type: 'kumas', name: `Kumaş — ${fabric}`, calc: 'metre_fiyat', quantity: metre, unit_price: birim, amount: metre * birim, currency: 'USD', fabric_name: hit.composition || null })
  if (hasIsc) items.push({ item_type: 'kesim_dikim_utu', name: 'Kesim/Dikim/Ütü', calc: 'sabit', quantity: null, unit_price: null, amount: iscilik, currency: 'TRY', fabric_name: null })
  if (hasAks) items.push({ item_type: 'aksesuar', name: 'Aksesuar', calc: 'sabit', quantity: null, unit_price: null, amount: aksesuar, currency: 'TRY', fabric_name: null })
  const totalTry = items.reduce((s, it) => s + it.amount * (RATE[it.currency] ?? 1), 0)
  const totalUsd = totalTry / RATE.USD
  records.push({ code, fabric, metre, birim, iscilik, aksesuar, ...hit, items, totalTry, totalUsd })
}

// ── Kalem sayımı ─────────────────────────────────────────────────────
const itemCount = records.reduce((s, r) => s + r.items.length, 0)
const kumas = records.filter((r) => r.items.some((i) => i.item_type === 'kumas')).length
const isc = records.filter((r) => r.items.some((i) => i.item_type === 'kesim_dikim_utu')).length
const aks = records.filter((r) => r.items.some((i) => i.item_type === 'aksesuar')).length

console.log(`\n════════ MALİYET AKTARIMI ${WRITE ? '— YAZMA' : '— KURU KOŞU'} ════════`)
console.log(`Kur (canlı): ${RATE_SRC} ${RATE_DATE} · USD=${RATE.USD} EUR=${RATE.EUR} GBP=${RATE.GBP}`)
console.log(`Eşleşti: ${records.length}  ·  Atlandı(skip): ${skipped.length}  ·  Eşleşmedi: ${unmatched.length}`)
if (unmatched.length) console.log('  EŞLEŞMEDİ: ' + unmatched.join(', '))
console.log(`Yazılacak: product_costs=${records.length}  product_cost_items=${itemCount} (kumaş=${kumas}, işçilik=${isc}, aksesuar=${aks})`)

// ── YAZMA (tek transaction) ──────────────────────────────────────────
if (WRITE) {
  const ids = records.map((r) => r.id)
  const snap = (r) => lit(JSON.stringify({ TRY: 1, USD: RATE.USD, EUR: RATE.EUR, GBP: RATE.GBP, _source: RATE_SRC, _at: RATE_DATE }))
  const costVals = records.map((r) => `(${r.id}, 1, true, 'USD', ${r.totalTry}, ${r.totalUsd}, ${snap(r)}::jsonb)`).join(',\n')
  const itemVals = records.flatMap((r) => r.items.map((it, idx) =>
    `(${r.id}, ${lit(it.item_type)}, ${lit(it.name)}, ${lit(it.calc)}, ${numOrNull(it.quantity)}, ${numOrNull(it.unit_price)}, ${numOrNull(it.amount)}, ${lit(it.currency)}, ${it.fabric_name ? lit(it.fabric_name) : 'NULL'}, ${idx})`)).join(',\n')
  const sqlText = `-- otomatik üretildi, elle çalıştırma
DELETE FROM product_cost_items WHERE cost_id IN (SELECT id FROM product_costs WHERE product_id IN (${ids.join(',')}));
DELETE FROM product_costs WHERE product_id IN (${ids.join(',')});
INSERT INTO product_costs (product_id, version, is_current, currency_display, total_cost_try, total_cost_usd, rate_snapshot) VALUES
${costVals};
INSERT INTO product_cost_items (cost_id, item_type, name, calculation_type, quantity, unit_price, amount, currency, fabric_name, sort_order)
SELECT pc.id, v.item_type, v.name, v.calculation_type, v.quantity, v.unit_price, v.amount, v.currency, v.fabric_name, v.sort_order
FROM (VALUES
${itemVals}
) AS v(product_id, item_type, name, calculation_type, quantity, unit_price, amount, currency, fabric_name, sort_order)
JOIN product_costs pc ON pc.product_id = v.product_id AND pc.is_current;
`
  writeFileSync(GEN_SQL, sqlText)
  console.log('\n→ SQL üretildi, tek transaction (-1) ile uygulanıyor…')
  runFile(GEN_SQL)
  console.log('✓ COMMIT edildi.')
}

// ── KATMAN 1 — bağımsız çapraz kontrol (yalnız yazma sonrası) ─────────
if (WRITE) {
  console.log(`\n── KATMAN 1: BAĞIMSIZ ÇAPRAZ KONTROL ──`)
  const db = new Map()
  const dbRows = sql(`select pc.product_id, pc.total_cost_try, pc.total_cost_usd, count(pci.id)
    from product_costs pc left join product_cost_items pci on pci.cost_id=pc.id
    where pc.is_current and pc.product_id = ANY(ARRAY[${records.map((r) => r.id).join(',')}])
    group by pc.product_id, pc.total_cost_try, pc.total_cost_usd`).split('\n').filter(Boolean)
  for (const l of dbRows) { const [pid, tt, tu, cnt] = l.split('|'); db.set(Number(pid), { try: Number(tt), usd: Number(tu), items: Number(cnt) }) }
  const mism = []
  for (const r of records) {
    const d = db.get(r.id)
    if (!d) { mism.push(`${r.code}: DB'de kayıt yok`); continue }
    if (Math.abs(d.try - r.totalTry) > TOL) mism.push(`${r.code}: TRY DB=${d.try} hesap=${r.totalTry.toFixed(2)}`)
    if (Math.abs(d.usd - r.totalUsd) > TOL) mism.push(`${r.code}: USD DB=${d.usd} hesap=${r.totalUsd.toFixed(2)}`)
    if (d.items !== r.items.length) mism.push(`${r.code}: kalem DB=${d.items} beklenen=${r.items.length}`)
  }
  if (!mism.length) console.log(`  ✓ TAM EŞLEŞME — ${records.length}/${records.length} ürün, toplam+kalem birebir (tol ${TOL}).`)
  else { console.log(`  ✗ ${mism.length} SAPMA:`); mism.forEach((m) => console.log('     • ' + m)) }
}

// ── KATMAN 2 — aykırı değer taraması ─────────────────────────────────
console.log(`\n── KATMAN 2: AYKIRI DEĞER TARAMASI (veri girişi hatası olabilir) ──`)
const cheapExpensive = records.filter((r) => r.totalUsd < 5 || r.totalUsd > 100)
console.log(`  a) Toplam <$5 veya >$100 : ${cheapExpensive.length}`)
cheapExpensive.forEach((r) => console.log(`     • ${r.code}  $${r.totalUsd.toFixed(2)}  (${money(r.totalTry)}₺)`))
const iscHigh = records.filter((r) => { const k = (r.items.find((i) => i.item_type === 'kumas')?.amount ?? 0) * RATE.USD; const s = r.items.find((i) => i.item_type === 'kesim_dikim_utu')?.amount ?? 0; return k > 0 && s > 3 * k })
console.log(`  b) İşçilik > 3× kumaş(TRY) : ${iscHigh.length}`)
iscHigh.forEach((r) => { const k = (r.items.find((i) => i.item_type === 'kumas')?.amount ?? 0) * RATE.USD; const s = r.items.find((i) => i.item_type === 'kesim_dikim_utu')?.amount ?? 0; console.log(`     • ${r.code}  işçilik=${money(s)}₺ vs kumaş=${money(k)}₺ (${(s / k).toFixed(1)}×)`) })
// c) aynı kumaş(CSV)+aynı metre, toplam USD %50+ sapan çiftler
const groups = new Map()
for (const r of records) { if (!(r.metre > 0)) continue; const key = `${r.fabric}|${r.metre}`; (groups.get(key) ?? groups.set(key, []).get(key)).push(r) }
const pairFlags = []
for (const [key, arr] of groups) {
  if (arr.length < 2) continue
  const min = Math.min(...arr.map((x) => x.totalUsd)), max = Math.max(...arr.map((x) => x.totalUsd))
  if (min > 0 && (max - min) / min > 0.5) pairFlags.push({ key, arr, min, max })
}
console.log(`  c) Aynı kumaş+metre, toplam %50+ sapan grup : ${pairFlags.length}`)
pairFlags.forEach((g) => console.log(`     • "${g.key}"  $${g.min.toFixed(2)}–$${g.max.toFixed(2)}  [${g.arr.map((x) => x.code).join(', ')}]`))

// ── KATMAN 3 — elle kontrol listesi (10 ürün) ────────────────────────
const priceAt = (unitCost, qty) => { let m = tierRows[0]?.margin ?? 0; for (const t of tierRows) if (qty >= t.min) m = t.margin; return unitCost * (1 + m / 100) }
const fmtRow = (r) => {
  const k = r.items.find((i) => i.item_type === 'kumas'); const s = r.items.find((i) => i.item_type === 'kesim_dikim_utu'); const a = r.items.find((i) => i.item_type === 'aksesuar')
  const t = tierRows.map((tr) => `$${(r.totalUsd * (1 + tr.margin / 100)).toFixed(2)}`).join(' / ')
  return `${r.code} | ${(r.name || '').slice(0, 24)} | ${k ? `${r.metre}m×$${r.birim}` : '—'} | ${s ? money(s.amount) : '—'} | ${a ? money(a.amount) : '—'} | ${money(r.totalTry)}₺ | $${r.totalUsd.toFixed(2)} | ${t}`
}
const sortedUsd = [...records].sort((a, b) => a.totalUsd - b.totalUsd)
const avg = records.reduce((s, r) => s + r.totalUsd, 0) / records.length
const nearAvg = [...records].sort((a, b) => Math.abs(a.totalUsd - avg) - Math.abs(b.totalUsd - avg))
const outlierSet = new Set([...cheapExpensive, ...iscHigh].map((r) => r.code))
const outliers = records.filter((r) => outlierSet.has(r.code))
const pick = []
const take = (arr, n) => { let c = 0; for (const r of arr) { if (c >= n) break; if (pick.find((p) => p.code === r.code)) continue; pick.push({ ...r, _g }); c++ } }
let _g = 'ucuz';     take(sortedUsd, 2)
_g = 'pahalı';       take([...sortedUsd].reverse(), 2)
_g = 'ortalama';     take(nearAvg, 2)
_g = 'aykırı';       take(outliers, 2)
_g = 'rastgele';     const rnd = records.filter((r) => !pick.find((p) => p.code === r.code)); take([rnd[Math.floor(rnd.length * 0.37)], rnd[Math.floor(rnd.length * 0.71)]].filter(Boolean), 2)
console.log(`\n── KATMAN 3: ELLE KONTROL LİSTESİ (ort. maliyet $${avg.toFixed(2)}; marj ${tierRows.map((t) => '%' + t.margin).join('/')}) ──`)
console.log(`  Grup | Kod | Ürün | Kumaş | İşçilik₺ | Aksesuar₺ | Toplam₺ | ToplamUSD | Satış(${tierRows.map((t) => t.min).join('/')})`)
pick.forEach((r) => console.log(`  [${r._g}] ` + fmtRow(r)))

// ── KATMAN 4 — marj doğrulaması (tierRows) ───────────────────────────
console.log(`\n── KATMAN 4: MARJ DOĞRULAMASI (3 ürün, tierRows) ──`)
for (const r of [sortedUsd[0], nearAvg[0], sortedUsd[sortedUsd.length - 1]]) {
  console.log(`  ${r.code} · birim maliyet $${r.totalUsd.toFixed(2)}`)
  for (const t of tierRows) console.log(`     ${t.min} adet → %${t.margin} → birim fiyat $${(r.totalUsd * (1 + t.margin / 100)).toFixed(2)}  (toplam $${(r.totalUsd * (1 + t.margin / 100) * t.min).toFixed(2)})`)
}

console.log(`\n════════ ${WRITE ? 'YAZILDI + DOĞRULANDI' : 'KURU KOŞU BİTTİ — hiçbir şey yazılmadı'} ════════`)
