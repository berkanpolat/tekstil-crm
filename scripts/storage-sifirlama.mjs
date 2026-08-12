// =====================================================================
// ADIM B — Storage temizliği (documents bucket)
// -------------------------------------------------------------------
// SADECE document/ image/ intake/ öneklerini siler. catalog/ (504) ASLA.
// Yöntem: storage.objects'ten TAM AD listesi çıkar → gönderim öncesi
//   ASSERT (hiçbir ad catalog/ ile başlamıyor) → Storage API ile TAM
//   ADLARLA sil (wildcard/özyinelemeli YOK). Önce/sonra catalog sayımı.
// Çalıştırma: node scripts/storage-sifirlama.mjs
// =====================================================================
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

function envFromDotenv(key) {
  const line = readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith(key + '='))
  return line ? line.slice(key.length + 1).trim().replace(/\r$/, '').replace(/^"|"$/g, '') : undefined
}
const PGHOST = 'aws-0-eu-west-1.pooler.supabase.com', PGPORT = '5432'
const PGUSER = 'postgres.kkxvoxeqfsaqzklrtgrw', PGDATABASE = 'postgres'
const PGPASSWORD = process.env.PGPASSWORD || envFromDotenv('SUPABASE_DB_PASSWORD')
const ENV = { ...process.env, PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD }
const BASE = ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-d', PGDATABASE, '-tA']
const q = (sql) => execFileSync('psql', [...BASE, '-c', sql], { encoding: 'utf8', env: ENV }).trim()
const num = (sql) => Number(q(sql))

const BUCKET = 'documents'
const KILL_PREFIXES = ['document/', 'image/', 'intake/']
const PROTECT = 'catalog/'

// ---- ÖNCE: önek bazında sayım ----
const catBefore = num(`select count(*) from storage.objects where bucket_id='${BUCKET}' and name like 'catalog/%'`)
console.log('\n📦 STORAGE TEMİZLİĞİ — documents bucket\n')
console.log(`  catalog/ (KORUNACAK) — ÖNCE : ${catBefore}  (beklenen 504)`)

// ---- TAM AD listesi (yalnız 3 önek) ----
const names = q(
  `select name from storage.objects where bucket_id='${BUCKET}' and (` +
  KILL_PREFIXES.map((p) => `name like '${p}%'`).join(' or ') + `) order by name`
).split('\n').map((s) => s.trim()).filter(Boolean)

const perPrefix = Object.fromEntries(KILL_PREFIXES.map((p) => [p, names.filter((n) => n.startsWith(p)).length]))
console.log('  Silinecek (önek bazında):')
for (const p of KILL_PREFIXES) console.log(`    ${p.padEnd(12)} ${perPrefix[p]}`)
console.log(`    ${'TOPLAM'.padEnd(12)} ${names.length}\n`)

// ---- GÖNDERİM ÖNCESİ ASSERT ----
if (names.length === 0) { console.log('Silinecek obje yok. Çıkılıyor.'); process.exit(0) }
const guardHits = names.filter((n) => n.startsWith(PROTECT))
if (guardHits.length > 0) { console.error(`❌ ASSERT: liste catalog/ içeriyor (${guardHits.length}). İptal.`); process.exit(1) }
if (!names.every((n) => KILL_PREFIXES.some((p) => n.startsWith(p)))) {
  console.error('❌ ASSERT: listede beklenmeyen önek var. İptal.'); process.exit(1)
}
console.log(`✔ Assert geçti: ${names.length} ad, hepsi izinli 3 önekte, catalog/ YOK.\n`)

// ---- Storage API ile TAM ADLARLA sil ----
const SUPA_URL = envFromDotenv('VITE_SUPABASE_URL')
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY || envFromDotenv('SUPABASE_SERVICE_ROLE_KEY') || ''
if (!SUPA_URL || !SVC || SVC.startsWith('<') || SVC.length < 40) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_URL eksik/placeholder. Silme yapılmadı.'); process.exit(2)
}
let deleted = 0
const CHUNK = 100
for (let i = 0; i < names.length; i += CHUNK) {
  const batch = names.slice(i, i + CHUNK)
  const res = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: batch }),
  })
  if (!res.ok) { console.error(`❌ Storage API ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1) }
  const j = await res.json().catch(() => [])
  deleted += Array.isArray(j) ? j.length : batch.length
}
console.log(`✅ Storage API sildi: ${deleted} obje.\n`)

// ---- SONRA: doğrulama ----
const catAfter = num(`select count(*) from storage.objects where bucket_id='${BUCKET}' and name like 'catalog/%'`)
console.log('SONUÇ (silme sonrası, önek bazında):')
for (const p of KILL_PREFIXES) {
  const left = num(`select count(*) from storage.objects where bucket_id='${BUCKET}' and name like '${p}%'`)
  console.log(`  ${p.padEnd(12)} kalan: ${left}  (beklenen 0)`)
}
console.log(`  ${PROTECT.padEnd(12)} SONRA: ${catAfter}  (beklenen 504 — DEĞİŞMEMELİ)`)
console.log(catBefore === catAfter && catAfter === 504 ? '\n✔ catalog/ bütün (504), dokunulmadı.' : '\n⚠️  catalog/ sayımı beklenenden farklı!')
