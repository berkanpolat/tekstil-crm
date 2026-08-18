// =====================================================================
// TAM STORAGE SIFIRLAMASI — catalog/ DAHİL HER ŞEY
// -------------------------------------------------------------------
// 2. sıfırlama (2026-08-13): DB'de files=0; storage'daki TÜM objeler
//   (catalog/ 504 dahil) silinir. Yöntem: bucket bazında TAM AD listesi
//   çıkar → Storage API ile TAM ADLARLA sil (chunk 100) → önce/sonra sayım.
//   Önceki storage-sifirlama.mjs catalog/'ü KORUYORDU; bu script KORUMAZ.
// Çalıştırma: node scripts/storage-sifirlama-tam.mjs
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

// ---- ÖNCE: bucket bazında toplam sayım ----
console.log('\n📦 TAM STORAGE SIFIRLAMASI (catalog/ DAHİL)\n')
const beforeRows = q(`select bucket_id, count(*) from storage.objects group by bucket_id order by bucket_id`)
const totalBefore = Number(q(`select count(*) from storage.objects`))
console.log('  ÖNCE (bucket bazında):')
console.log(beforeRows ? beforeRows.split('\n').map((r) => '    ' + r.replace('|', ' : ')).join('\n') : '    (boş)')
console.log(`    TOPLAM : ${totalBefore}  (beklenen 505)\n`)

if (totalBefore === 0) { console.log('Silinecek obje yok. Çıkılıyor.'); process.exit(0) }

// ---- Storage API kimlik ----
const SUPA_URL = envFromDotenv('VITE_SUPABASE_URL')
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY || envFromDotenv('SUPABASE_SERVICE_ROLE_KEY') || ''
if (!SUPA_URL || !SVC || SVC.startsWith('<') || SVC.length < 40) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_URL eksik/placeholder. Silme yapılmadı.'); process.exit(2)
}

// ---- Bucket listesi ----
const buckets = q(`select distinct bucket_id from storage.objects order by bucket_id`).split('\n').map((s) => s.trim()).filter(Boolean)

let deletedTotal = 0
const CHUNK = 100
for (const bucket of buckets) {
  const names = q(`select name from storage.objects where bucket_id='${bucket}' order by name`)
    .split('\n').map((s) => s.trim()).filter(Boolean)
  console.log(`  [${bucket}] ${names.length} obje siliniyor…`)
  let del = 0
  for (let i = 0; i < names.length; i += CHUNK) {
    const batch = names.slice(i, i + CHUNK)
    const res = await fetch(`${SUPA_URL}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: batch }),
    })
    if (!res.ok) { console.error(`❌ Storage API ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1) }
    const j = await res.json().catch(() => [])
    del += Array.isArray(j) ? j.length : batch.length
  }
  console.log(`    ✅ ${del} obje silindi.`)
  deletedTotal += del
}
console.log(`\n✅ Storage API TOPLAM sildi: ${deletedTotal} obje.\n`)

// ---- SONRA: doğrulama ----
const totalAfter = Number(q(`select count(*) from storage.objects`))
const catAfter = Number(q(`select count(*) from storage.objects where name like 'catalog/%'`))
console.log('SONRA (doğrulama):')
console.log(`  catalog/     kalan: ${catAfter}  (beklenen 0)`)
console.log(`  TOPLAM obje  kalan: ${totalAfter}  (beklenen 0)`)
console.log(totalAfter === 0 ? '\n✔ Storage tamamen boş (0 obje).' : '\n⚠️  Storage boş değil!')
