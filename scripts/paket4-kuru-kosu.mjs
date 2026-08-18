// =====================================================================
// PAKET 4 — Geriye dönük tutar düzeltmesi · KURU KOŞU (yalnız OKUMA).
// total=0 ve order_items boş siparişleri bulur; writeExtractedItem'daki
// AYNI parse/doğrulama mantığını (parseDecimal) uygular ve raporlar.
// HİÇBİR ŞEY YAZMAZ.  Çalıştır:  node scripts/paket4-kuru-kosu.mjs
// =====================================================================
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseDecimal } from '../src/lib/money.ts' // gerçek fonksiyon — yeni parse YOK

const pass = process.env.PGPASSWORD || readFileSync('.env','utf8').split('\n').find(l=>l.startsWith('SUPABASE_DB_PASSWORD='))?.split('=').slice(1).join('=').trim()
const ENV = { ...process.env, PGHOST:'aws-0-eu-west-1.pooler.supabase.com', PGPORT:'5432', PGUSER:'postgres.kkxvoxeqfsaqzklrtgrw', PGDATABASE:'postgres', PGPASSWORD:pass }
const run = (sql) => execFileSync('psql',['-tA','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',env:ENV})

const SQL = `
select coalesce(json_agg(t order by t.id), '[]') from (
  select o.id, o.subtotal::float8 as subtotal, o.total::float8 as total,
    o.tax_rate::float8 as tax_rate, o.extraction_source,
    o.extracted_data->>'adet'  as adet_raw,
    o.extracted_data->>'fiyat' as fiyat_raw,
    o.extracted_data->>'renk'  as renk,
    o.currency,
    coalesce(c.company_name, c.full_name, '—') as musteri,
    op.code as op_code
  from public.orders o
  join public.operations op on op.id = o.operation_id
  left join public.customers c on c.id = op.customer_id
  where o.deleted_at is null
    and coalesce(o.total, 0) = 0
    and not exists (select 1 from public.order_items oi where oi.order_id = o.id and oi.deleted_at is null)
) t;`

const rows = JSON.parse(run(SQL).trim() || '[]')

const r2 = (n) => Math.round(n * 100) / 100
const fmt = (n) => new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n)

const onarilacak = []
const atlanacak = []
for (const o of rows) {
  // writeExtractedItem ile BİREBİR aynı doğrulama:
  const price = parseDecimal(o.fiyat_raw)
  if (price == null || price <= 0) { atlanacak.push({ ...o, neden: 'no_price' }); continue }
  const qty = parseDecimal(o.adet_raw)
  if (qty == null || qty <= 0) { atlanacak.push({ ...o, neden: 'no_qty' }); continue }
  const subtotal = r2(qty * price)                       // discount_rate = 0
  const total = r2(subtotal + subtotal * (o.tax_rate || 0) / 100)
  onarilacak.push({ ...o, qty, price, subtotal, total })
}

console.log('\n════════ PAKET 4 · KURU KOŞU (yazma YOK) ════════\n')
console.log(`Aday (total=0 & kalemi boş): ${rows.length} sipariş\n`)

console.log('── ONARILACAK ──────────────────────────────────────────')
if (!onarilacak.length) console.log('  (yok)')
for (const o of onarilacak)
  console.log(`  #${o.id} ${o.op_code} · ${o.musteri}\n      adet="${o.adet_raw}"→${o.qty}  fiyat="${o.fiyat_raw}"→${fmt(o.price)}  KDV%${o.tax_rate}`
    + `\n      ara toplam ${fmt(o.subtotal)}  →  TOPLAM ${fmt(o.total)} ${o.currency} [${o.extraction_source}]`)

console.log('\n── ELLE GİRİLECEK (dokunulmayacak) ─────────────────────')
if (!atlanacak.length) console.log('  (yok)')
for (const o of atlanacak)
  console.log(`  #${o.id} ${o.op_code} · ${o.musteri}  — ${o.neden}  (adet="${o.adet_raw ?? ''}" fiyat="${o.fiyat_raw ?? ''}")`)

const byCur = {}
for (const o of onarilacak) byCur[o.currency] = (byCur[o.currency] || 0) + o.total

console.log('\n── ÖZET ────────────────────────────────────────────────')
console.log(`  Düzelecek sipariş : ${onarilacak.length}`)
console.log(`  Elle girilecek    : ${atlanacak.length}`)
console.log(`  Cariye yazılacak toplam borç:`)
for (const [cur, sum] of Object.entries(byCur)) console.log(`      ${fmt(sum)} ${cur}`)
if (!onarilacak.length) console.log('      (yok)')
console.log('\n(DUR — onay bekleniyor, hiçbir şey yazılmadı.)\n')
