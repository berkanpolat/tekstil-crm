// =====================================================================
// Deneme (demo) verisini temizler — genel kontrol öncesi sıfırlama.
// Referans/yapılandırma verisine, kataloğa, sistem geçmişine DOKUNMAZ.
//
// SİLER: potansiyeller + müşteriler (tümü), operasyonlar/teklifler/numuneler/
//   siparişler (+kalemleri), etkileşimler/notlar/etiket bağlantıları/iletişim
//   noktaları, demo dosyalar (+ storage'daki PDF/görselleri), açık dosyalar,
//   bildirimler, görevler+hedefler, ödemeler+cari hareketler, üretilen belgeler,
//   ai_requests, code_registry'deki TAS + MUS kodları.
//
// KORUR: kullanıcılar/departman/pozisyon/rol/yetki, ayarlar (settings +
//   history), referans listeleri (durum/öncelik/kategori/kanal/kaynak/etiket
//   tanımı/ödeme yöntemi/marj kademesi/görev şablonu/operasyon aşaması),
//   KATALOG (ürün + görsel + koleksiyon), banka hesapları, döviz kurları,
//   product_costs, audit_log + event_log (sistem geçmişi).
//
// Bağlantı: psql + PG* env (bkz. hafıza tekstil-crm-db-baglanti). Şifre .env'den
//   (SUPABASE_DB_PASSWORD) otomatik okunur. Ağ gerektiği için Bash'i
//   dangerouslyDisableSandbox ile çalıştır.
// Çalıştırma: node scripts/reset-demo-data.mjs
// =====================================================================
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

// ---- Bağlantı ----
function envFromDotenv(key) {
  try {
    const line = readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith(key + '='))
    return line ? line.slice(key.length + 1).trim().replace(/\r$/, '') : undefined
  } catch { return undefined }
}
const PGHOST = process.env.PGHOST || 'aws-0-eu-west-1.pooler.supabase.com'
const PGPORT = process.env.PGPORT || '5432'
const PGUSER = process.env.PGUSER || 'postgres.kkxvoxeqfsaqzklrtgrw'
const PGDATABASE = process.env.PGDATABASE || 'postgres'
const PGPASSWORD = process.env.PGPASSWORD || envFromDotenv('SUPABASE_DB_PASSWORD')
if (!PGPASSWORD) { console.error('HATA: PGPASSWORD veya .env SUPABASE_DB_PASSWORD bulunamadı.'); process.exit(2) }
const ENV = { ...process.env, PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD }
const BASE = ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-d', PGDATABASE, '-tA']
const q = (sql) => execFileSync('psql', [...BASE, '-c', sql], { encoding: 'utf8', env: ENV }).trim()
const num = (sql) => Number(q(sql))

// ---- Silme planı (FK bağımlılık sırasına göre; sayaç sorgusu = silme yordamıyla aynı koşul) ----
// Demo dosya koşulu: yalnız lead/customer/operation eklerine ait dosyalar — katalog görselleri (entity_type=catalog_product) HARİÇ.
const DEMO_FILES = "entity_type in ('lead','customer','operation')"
const steps = [
  ['ai_requests',             'delete from public.ai_requests'],
  ['notifications',           'delete from public.notifications'],
  ['open_file_snoozes',       'delete from public.open_file_snoozes'],
  ['open_files',              'delete from public.open_files'],
  ['task_dependencies',       'delete from public.task_dependencies'],
  ['task_assignments',        'delete from public.task_assignments'],
  ['task_suggestion_state',   'delete from public.task_suggestion_state'],
  ['tasks',                   'delete from public.tasks'],
  ['goals',                   'delete from public.goals'],
  ['payments',                'delete from public.payments'],
  ['account_transactions',    'delete from public.account_transactions'],
  ['documents',               'delete from public.documents'],
  ['order_items',             'delete from public.order_items'],
  ['orders',                  'delete from public.orders'],
  ['samples',                 'delete from public.samples'],
  ['quote_items',             'delete from public.quote_items'],
  ['quotes',                  'delete from public.quotes'],
  ['operation_catalog_items', 'delete from public.operation_catalog_items'],
  ['operation_items',         'delete from public.operation_items'],
  ['operations',              'delete from public.operations'],
  ['interactions',            'delete from public.interactions'],
  ['notes',                   'delete from public.notes'],
  ['entity_tags',             'delete from public.entity_tags'],
  ['contact_points',          'delete from public.contact_points'],
  // NOT: storage.objects psql'den doğrudan silinemez (Supabase protect_objects_delete tetikleyicisi) —
  // fiziksel silme DB transaction'ından SONRA Storage API ile yapılır (aşağıda).
  ['files (demo ekleri)',     `delete from public.files where ${DEMO_FILES}`, `select count(*) from public.files where ${DEMO_FILES}`],
  ['leads',                   'delete from public.leads'],
  ['customers',               'delete from public.customers'],
  ['code_registry (TAS/MUS)', "delete from public.code_registry where code like 'TAS-%' or code like 'MUS-%'",
                              "select count(*) from public.code_registry where code like 'TAS-%' or code like 'MUS-%'"],
]
// sayaç sorgusu verilmemişse tam-tablo say
const countSqlFor = (s) => s[2] || `select count(*) from ${s[0].split(' ')[0]}`

// ---- Silinecek demo dosyaların storage yolları (transaction ÖNCESİ yakala; files silinince kaybolur) ----
const storagePaths = q(`select storage_path from public.files where ${DEMO_FILES} and storage_path is not null`)
  .split('\n').map((s) => s.trim()).filter(Boolean)

// ---- Ön sayım ----
console.log('\n🧹 DENEME VERİSİ TEMİZLEME — genel kontrol öncesi\n')
console.log('Silinecek kayıtlar (ön sayım):')
const before = []
let total = 0
for (const s of steps) {
  const n = num(countSqlFor(s))
  before.push([s[0], n]); total += n
  console.log(`  ${s[0].padEnd(26)} ${String(n).padStart(6)}`)
}
console.log(`  ${'—'.repeat(26)} ${'—'.repeat(6)}`)
console.log(`  ${'TOPLAM'.padEnd(26)} ${String(total).padStart(6)}\n`)

// Korunacakların kanıtı (dokunulmayacak)
const keepReport = () => ({
  'katalog ürün': num('select count(*) from catalog_products'),
  'katalog görsel': num('select count(*) from catalog_product_images'),
  'kullanıcı': num('select count(*) from users'),
  'ayar': num('select count(*) from settings'),
  'referans (durumlar+kategoriler)': num('select (select count(*) from order_statuses)+(select count(*) from product_categories)+(select count(*) from request_statuses)+(select count(*) from quote_statuses)+(select count(*) from sample_statuses)'),
  'banka hesabı': num('select count(*) from bank_accounts'),
  'döviz kuru': num('select count(*) from exchange_rates'),
  'event_log (geçmiş)': num('select count(*) from event_log'),
  'audit_log (geçmiş)': num('select count(*) from audit_log'),
})
const keepBefore = keepReport()
console.log('Korunacaklar (dokunulmayacak):')
for (const [k, v] of Object.entries(keepBefore)) console.log(`  ${k.padEnd(34)} ${String(v).padStart(6)}`)
console.log('')

if (total === 0) { console.log('Silinecek demo kaydı yok. Çıkılıyor.'); process.exit(0) }

// ---- Onay ----
const rl = createInterface({ input: process.stdin, output: process.stdout })
const answer = await new Promise((res) => rl.question('⚠️  Bu işlem GERİ ALINAMAZ, devam? (evet/hayır) ', res))
rl.close()
if (answer.trim().toLowerCase() !== 'evet') { console.log('İptal edildi. Hiçbir şey silinmedi.'); process.exit(0) }

// ---- Silme (tek transaction) ----
console.log('\nSiliniyor…')
const tx = 'begin;\n' + steps.map((s) => s[1] + ';').join('\n') + '\ncommit;'
try {
  execFileSync('psql', [...BASE, '-v', 'ON_ERROR_STOP=1', '-c', tx], { encoding: 'utf8', env: ENV })
} catch (e) {
  console.error('\n❌ HATA — transaction geri alındı, hiçbir şey silinmedi:')
  console.error((e.stderr || e.stdout || e.message).toString().trim())
  process.exit(1)
}

// ---- Doğrulama + rapor ----
console.log('\n✅ Tamamlandı. Silinen kayıtlar:')
let grand = 0
for (const [label, n] of before) { if (n > 0) console.log(`  ${label.padEnd(26)} ${String(n).padStart(6)}`); grand += n }
console.log(`  ${'—'.repeat(26)} ${'—'.repeat(6)}`)
console.log(`  ${'TOPLAM'.padEnd(26)} ${String(grand).padStart(6)}`)

// kalan sayılar sıfır mı? (tam-tablo silinenler için)
const leftover = []
for (const s of steps) {
  if (s[2]) continue // filtreli adımlar (files/code_registry/storage) — kalanı normal
  const left = num(`select count(*) from ${s[0]}`)
  if (left > 0) leftover.push([s[0], left])
}
if (leftover.length) { console.log('\n⚠️  Beklenmeyen kalan kayıtlar:'); for (const [t, n] of leftover) console.log(`  ${t}: ${n}`) }
else console.log('\nTüm hedef tablolar temiz (0 kayıt).')

const keepAfter = keepReport()
const changed = Object.keys(keepBefore).filter((k) => keepBefore[k] !== keepAfter[k])
if (changed.length) { console.log('\n⚠️  KORUNMASI gerekenlerde DEĞİŞİKLİK:'); for (const k of changed) console.log(`  ${k}: ${keepBefore[k]} → ${keepAfter[k]}`) }
else console.log('Korunan veriler bütün (katalog/kullanıcı/ayar/referans/geçmiş değişmedi).')

// ---- Storage temizliği (Storage API — psql tetikleyici engellediği için) ----
console.log('\nStorage (documents bucket) — demo dosyalar:')
const SUPA_URL = envFromDotenv('VITE_SUPABASE_URL') || process.env.VITE_SUPABASE_URL
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY || envFromDotenv('SUPABASE_SERVICE_ROLE_KEY') || ''
const placeholder = !SVC || SVC.startsWith('<') || SVC.length < 40
if (storagePaths.length === 0) {
  console.log('  Silinecek storage objesi yok.')
} else if (placeholder || !SUPA_URL) {
  console.log(`  ⚠️  ${storagePaths.length} obje kaldı — SUPABASE_SERVICE_ROLE_KEY gerçek değil (placeholder).`)
  console.log('  DB kayıtları silindi (uygulamada görünmezler). Fiziksel silmek için gerçek service-role anahtarıyla:')
  console.log('    SUPABASE_SERVICE_ROLE_KEY=sb_secret_… node scripts/reset-demo-data.mjs')
  console.log('  (veya Supabase panosu → Storage → documents → şu yolları sil):')
  for (const p of storagePaths) console.log(`    • ${p}`)
} else {
  try {
    const res = await fetch(`${SUPA_URL}/storage/v1/object/documents`, {
      method: 'DELETE',
      headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: storagePaths }),
    })
    if (res.ok) { const j = await res.json().catch(() => []); console.log(`  ✅ ${Array.isArray(j) ? j.length : storagePaths.length} obje Storage API ile silindi.`) }
    else console.log(`  ⚠️  Storage API ${res.status}: ${(await res.text()).slice(0, 200)} — objeler kaldı (DB kayıtları silindi).`)
  } catch (e) { console.log(`  ⚠️  Storage API hatası: ${e.message} — objeler kaldı (DB kayıtları silindi).`) }
}
console.log('')
