// =====================================================================
// SQL ↔ TS normalizasyon tutarlılık kontrolü.
// Aynı fixture dosyalarını (tests/fixtures/*.json) HEM Vitest birim testi HEM
// bu script okur. Bu script veritabanındaki normalize_tr() ve
// normalize_contact_value('phone', ...) fonksiyonlarını psql ile çalıştırıp
// fixture'daki beklenen değerle karşılaştırır. Biri ayrışırsa (TS veya SQL)
// test kırılır. Migrasyon PUSH edildikten SONRA çalıştırılır.
//
// Bağlantı: psql + PGHOST/PGPORT/PGUSER/PGDATABASE (.env, diğer scriptlerle aynı).
// Çalıştırma: node scripts/check-normalize-consistency.mjs
// =====================================================================
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const NULL = '<<null>>' // NULL sentinel'i (psql -tA boş satır ile NULL'ı ayırmak zor)

const PG = ['-h', process.env.PGHOST, '-p', process.env.PGPORT ?? '5432',
  '-U', process.env.PGUSER, '-d', process.env.PGDATABASE ?? 'postgres', '-tA']
if (!process.env.PGHOST || !process.env.PGUSER) {
  console.error('PGHOST / PGUSER gerekli (.env). Diğer scriptlerle aynı bağlantı.')
  process.exit(2)
}

// Değeri güvenli tek-tırnaklı Postgres literal'ine çevir (standard_conforming_strings
// açık; yalnızca ' → '' kaçışı gerekir). $VAL ifadenin içine gömülür.
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`
const evalSql = (value, expr) =>
  execFileSync('psql', [...PG, '-c',
    // GÜVENLİK (SAST 1 Eyl 2026): ikinci argüman STRING verilirse String.replace
    // özel dizileri yorumlar — `$'` "eşleşmeden sonraki metin" demektir ve lit()'in
    // tırnak kaçışını yiyerek enjeksiyona yol açar. Fonksiyon biçimi bu yorumlamayı
    // tamamen kapatır.
    `select coalesce((${expr.replace(/\$VAL/g, () => lit(value))})::text, '${NULL}')`],
    { encoding: 'utf8', env: process.env }).trim()

const load = (name) => JSON.parse(readFileSync(join(ROOT, 'tests/fixtures', name), 'utf8'))

let pass = 0, fail = 0
const run = (label, cases, expr) => {
  for (const { input, expected } of cases) {
    const got = evalSql(input, expr)
    const want = expected === null ? NULL : expected
    if (got === want) {
      pass++
    } else {
      fail++
      console.log(`FAIL [${label}] ${JSON.stringify(input)}: SQL=${JSON.stringify(got)} beklenen=${JSON.stringify(want)}`)
    }
  }
}

run('normalize_tr', load('normalize-tr-cases.json'), 'normalize_tr($VAL)')
run('phone', load('phone-cases.json'), "normalize_contact_value('phone', $VAL)")

console.log(`\n${pass} geçti, ${fail} başarısız.`)
process.exit(fail === 0 ? 0 : 1)
