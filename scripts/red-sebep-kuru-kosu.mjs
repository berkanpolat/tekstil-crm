// =====================================================================
// RED SEBEBİ ATAMA · KURU KOŞU (yalnız OKUMA, HİÇBİR ŞEY YAZMAZ).
// data/red-sebepleri.csv → musteri_marka'yı normalize_tr ile müşteriyle
// eşler; stage=teklif_reddedildi olan operasyonların quote'larını bulur.
// rejection_reason_id ATANACAĞINI raporlar — YAZMAZ.
// Çalıştır:  node scripts/red-sebep-kuru-kosu.mjs
// =====================================================================
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pass = process.env.PGPASSWORD || readFileSync('.env','utf8').split('\n').find(l=>l.startsWith('SUPABASE_DB_PASSWORD='))?.split('=').slice(1).join('=').trim()
const ENV = { ...process.env, PGHOST:'aws-0-eu-west-1.pooler.supabase.com', PGPORT:'5432', PGUSER:'postgres.kkxvoxeqfsaqzklrtgrw', PGDATABASE:'postgres', PGPASSWORD:pass }
const run = (sql) => execFileSync('psql',['-tA','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',env:ENV})

// ── CSV red_sebebi metni → quote_rejection_reasons.key eşlemesi ──
const SEBEP_KEY = {
  'Ulaşım Sağlanamadı':          'ulasilamadi',           // mevcut
  'Yüksek Fiyat':                'fiyat_yuksek',          // mevcut
  'Müşteri Vazgeçti':            'musteri_vazgecti',      // mevcut
  'MOQ Fazla':                   'moq_fazla',             // yeni
  'Sonra Değerlendirecek':       'sonra_degerlendirecek', // yeni
  'Numune Ücreti Fazla Bulunur': 'numune_ucreti_fazla',   // yeni
  'Yanlış Numara':               'yanlis_numara',         // yeni
}

// ── normalize_tr'ın JS ikizi (SQL fonksiyonuyla BİREBİR aynı mantık) ──
const FROM = 'İIıŞşĞğÜüÖöÇç'+'äÄëËïÏéÉèÈêÊàÀáÁâÂñÑåÅøØíÍóÓúÚýÝ'
const TO   = 'iiissgguuoocc'+'aaeeiieeeeeeaaaaaannaaooiioouuyy'
const normalize_tr = (input) => {
  if (input == null) return null
  let s = input.replace(/ß/g,'ss')
  s = [...s].map(ch => { const i = FROM.indexOf(ch); return i>=0 ? TO[i] : ch }).join('')
  s = s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
  return s || null
}

// ── 1) CSV oku ──
const csv = readFileSync('data/red-sebepleri.csv','utf8').trim().split('\n').slice(1)
const rows = csv.map(line => {
  const i = line.indexOf(',')
  return { marka: line.slice(0,i).trim(), sebep: line.slice(i+1).trim() }
}).filter(r => r.marka)

// ── 2) DB'den teklif_reddedildi operasyonları + quote'ları ──
const SQL = `
select coalesce(json_agg(t), '[]') from (
  select
    c.id as customer_id,
    coalesce(nullif(c.company_name_normalized,''), c.full_name_normalized) as marka_norm,
    coalesce(nullif(btrim(c.company_name),''), c.full_name) as marka_disp,
    op.id as operation_id, op.code as op_code,
    q.id as quote_id, q.version, q.rejection_reason_id,
    (qs.key) as quote_status
  from public.operations op
  join public.operation_stages st on st.id = op.stage_id and st.key = 'teklif_reddedildi'
  join public.customers c on c.id = op.customer_id and c.deleted_at is null
  join public.quotes q on q.operation_id = op.id and q.deleted_at is null
  left join public.quote_statuses qs on qs.id = q.status_id
  where op.deleted_at is null
) t;`
const dbRows = JSON.parse(run(SQL).trim() || '[]')

// ── 3) rejection reason key → var mı? (yeni 4 sebep henüz DB'de olmayabilir) ──
const existingKeys = new Set(run(`select key from public.quote_rejection_reasons`).trim().split('\n').filter(Boolean))

// ── 4) Müşteri normalize → operasyon/quote grupla ──
const byMarka = new Map() // marka_norm -> [rows]
for (const r of dbRows) {
  if (!r.marka_norm) continue
  if (!byMarka.has(r.marka_norm)) byMarka.set(r.marka_norm, [])
  byMarka.get(r.marka_norm).push(r)
}

// ── 5) Eşleştir ──
const eslesenler = []      // { csv, key, quotes: [...] }
const eslesmeyenler = []   // { csv, neden }
const bilinmeyenSebep = [] // csv sebebi eşlemede yok

for (const r of rows) {
  const key = SEBEP_KEY[r.sebep]
  if (!key) { bilinmeyenSebep.push(r); continue }
  const norm = normalize_tr(r.marka)
  const hit = byMarka.get(norm)
  if (!hit || !hit.length) { eslesmeyenler.push({ ...r, norm, neden: 'operasyon yok (teklif_reddedildi)' }); continue }
  eslesenler.push({ csv: r, key, quotes: hit, keyExists: existingKeys.has(key) })
}

// ── 6) Rapor ──
const fmt = (n) => String(n).padStart(3)
console.log('\n════════ RED SEBEBİ ATAMA · KURU KOŞU (yazma YOK) ════════\n')
console.log(`CSV kayıt              : ${rows.length}`)
console.log(`teklif_reddedildi op   : ${new Set(dbRows.map(d=>d.operation_id)).size}`)
console.log(`  bunların quote'u     : ${dbRows.length}`)
console.log(`  farklı müşteri (norm): ${byMarka.size}`)
console.log(`Eşleşen CSV kaydı      : ${eslesenler.length}`)
console.log(`Eşleşmeyen CSV kaydı   : ${eslesmeyenler.length}`)
if (bilinmeyenSebep.length) console.log(`⚠ Bilinmeyen sebep     : ${bilinmeyenSebep.length}`)

// quote sayısı
const toplamQuote = eslesenler.reduce((a,e)=>a+e.quotes.length,0)
console.log(`Yazılacak quote (rejection_reason_id) : ${toplamQuote}`)

// yeni sebep anahtarı DB'de yoksa uyar
const eksikKey = [...new Set(eslesenler.filter(e=>!e.keyExists).map(e=>e.key))]
if (eksikKey.length) {
  console.log(`\n⚠ DB'de HENÜZ OLMAYAN sebep anahtarı (migration uygulanmadan atama yapılamaz):`)
  console.log('   ' + eksikKey.join(', '))
}

// ── aynı markaya birden fazla reddedilmiş teklif ──
console.log('\n── AYNI MARKAYA BİRDEN FAZLA REDDEDİLMİŞ TEKLİF ──────────')
const coklu = eslesenler.filter(e => new Set(e.quotes.map(q=>q.operation_id)).size > 1 || e.quotes.length > 1)
if (!coklu.length) console.log('  (yok)')
for (const e of coklu) {
  const ops = [...new Set(e.quotes.map(q=>q.op_code))]
  console.log(`  • ${e.csv.marka} → ${e.quotes.length} quote / ${ops.length} operasyon: ${ops.join(', ')}`)
}

// ── eşleşmeyenler tek tek ──
console.log('\n── EŞLEŞMEYEN CSV KAYITLARI (tek tek) ────────────────────')
if (!eslesmeyenler.length) console.log('  (yok)')
eslesmeyenler.forEach((r,i) => console.log(`  ${fmt(i+1)}. "${r.marka}"  [${r.sebep}]  → ${r.neden}`))

if (bilinmeyenSebep.length) {
  console.log('\n── EŞLEMEDE OLMAYAN SEBEP METNİ ──────────────────────────')
  bilinmeyenSebep.forEach((r,i)=>console.log(`  ${fmt(i+1)}. "${r.marka}"  [${r.sebep}]`))
}

// ── CSV'de olmayan ama teklif_reddedildi olan operasyonlar (boş kalacak) ──
const csvNorms = new Set(rows.map(r=>normalize_tr(r.marka)))
const listedisi = [...byMarka.entries()].filter(([norm])=>!csvNorms.has(norm))
const listedisiQuote = listedisi.reduce((a,[,v])=>a+v.length,0)
console.log(`\n── LİSTE DIŞI (dokunulmayacak, boş kalacak) ──────────────`)
console.log(`  ${listedisi.length} müşteri / ${listedisiQuote} quote — CSV'de yok, rejection_reason_id boş kalır.`)

console.log('\n════════ KURU KOŞU BİTTİ · HİÇBİR ŞEY YAZILMADI ════════\n')
