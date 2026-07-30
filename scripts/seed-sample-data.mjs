// =====================================================================
// P1.11 — Örnek veri üreteci (tek giriş noktası).
// Sırayla: 3000 potansiyel + 600 müşteri (yoksa) + aktivite (iletişim/etkileşim/
// not/etiket). Tekrar-çalıştırılabilir: mevcut sayıya bakar, aktivite idempotent.
// Sıfırlamak için: psql -f scripts/reset-sample-data.sql
//
// Bağlantı: psql + PG* env (bkz. diğer scriptler / hafıza).
// Çalıştırma: node scripts/seed-sample-data.mjs
// =====================================================================
import { execFileSync } from 'node:child_process'

const PG = ['-h', process.env.PGHOST, '-p', process.env.PGPORT ?? '5432',
  '-U', process.env.PGUSER, '-d', process.env.PGDATABASE ?? 'postgres', '-tA']
if (!process.env.PGHOST || !process.env.PGUSER) {
  console.error('PGHOST / PGUSER gerekli (.env).')
  process.exit(2)
}
const q = (sql) => execFileSync('psql', [...PG, '-c', sql], { encoding: 'utf8', env: process.env }).trim()
const runFile = (f) => execFileSync('psql', [...PG, '-v', 'ON_ERROR_STOP=1', '-f', f], { encoding: 'utf8', env: process.env })

const leadCount = Number(q(`select count(*) from public.leads where external_source='seed'`))
if (leadCount < 3000) {
  console.log(`Potansiyeller üretiliyor (${leadCount}/3000)…`)
  runFile('scripts/seed-fake-leads.sql')
} else console.log(`Potansiyeller mevcut (${leadCount}).`)

const custCount = Number(q(`select count(*) from public.customers where external_source='seed'`))
if (custCount < 600) {
  console.log(`Müşteriler üretiliyor (${custCount}/600)…`)
  runFile('scripts/seed-fake-customers.sql')
} else console.log(`Müşteriler mevcut (${custCount}).`)

console.log('Aktivite (iletişim/etkileşim/not/etiket) üretiliyor…')
runFile('scripts/seed-activity.sql')

const s = q(`select
  (select count(*) from public.leads where external_source='seed')||' potansiyel, '||
  (select count(*) from public.customers where external_source='seed')||' müşteri, '||
  (select count(*) from public.contact_points)||' iletişim, '||
  (select count(*) from public.interactions)||' etkileşim, '||
  (select count(*) from public.notes)||' not, '||
  (select count(*) from public.entity_tags)||' etiket'`)
console.log('Tamam →', s)
