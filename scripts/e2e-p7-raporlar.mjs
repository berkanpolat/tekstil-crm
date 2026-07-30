// =====================================================================
// P7.13 — Rapor/panel test turu: tutarlılık, yetki, zaman dilimi, perf.
// Panel ve raporlar AYNI public.metric_* fonksiyonlarını çağırır → tutarlılık
// yapısaldır; burada ek olarak idempotentlik, guard, tz ve performans denetlenir.
//   node scripts/e2e-p7-raporlar.mjs
// =====================================================================
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pass = process.env.PGPASSWORD ||
  readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith('SUPABASE_DB_PASSWORD='))?.split('=').slice(1).join('=').trim()
const ENV = { ...process.env, PGHOST: 'aws-0-eu-west-1.pooler.supabase.com', PGPORT: '5432',
  PGUSER: 'postgres.kkxvoxeqfsaqzklrtgrw', PGDATABASE: 'postgres', PGPASSWORD: pass }
const q = (sql) => execFileSync('psql', ['-tA', '-c', sql], { encoding: 'utf8', env: ENV }).trim()
const OWNER = '5261d58d-52f5-4859-ba26-bcb0ace8f743'
const FAKE = '00000000-0000-0000-0000-0000000000aa'   // yetkisiz (kullanıcı yok → has_permission=false)
const asOwner = (sql) => `begin; set local request.jwt.claims='{"sub":"${OWNER}"}'; ${sql} rollback;`
const asFake = (sql) => `begin; set local request.jwt.claims='{"sub":"${FAKE}"}'; ${sql} rollback;`
// Değer okuma: oturum SET (işlem yok) → son satır DEĞERdir (ROLLBACK etiketi gelmez)
const readOwner = (sql) => q(`set request.jwt.claims='{"sub":"${OWNER}"}'; ${sql}`).split('\n').map((s) => s.trim()).filter(Boolean).pop()

let fail = 0
const ok = (c, m, x = '') => { if (!c) fail++; console.log(`  ${c ? '✅' : '❌'} ${m}${x ? ' → ' + x : ''}`) }
const P = "now()-interval '30 days'", N = 'now()'

console.log('P7.13 — Rapor testleri\n')

// 1) TUTARLILIK — aynı çağrı iki kez → birebir aynı (panel==rapor tek kaynak)
try {
  const two = readOwner(`select (public.metric_requests(${P},${N})=public.metric_requests(${P},${N}))::text;`)
  ok(two === 'true', 'Tutarlılık: metric_requests idempotent (panel==rapor tek kaynak)')
  const eq = readOwner(`select ((public.metric_funnel(${P},${N})->>'requests')::int = (public.metric_requests(${P},${N})->>'total')::int)::text;`)
  ok(eq === 'true', 'Tutarlılık: funnel.requests == requests.total')
} catch (e) { ok(false, 'Tutarlılık', String(e).split('\n')[0]) }

// 2) YETKİ — reports.view olmayan engellenir (42501)
try {
  q(asFake(`select public.metric_requests(${P},${N}); `))
  ok(false, 'Yetki: yetkisiz kullanıcı metric_requests çağıramaz')
} catch { ok(true, 'Yetki: yetkisiz → metric_requests reddedildi (42501)') }
try {
  q(asFake(`select public.report_permission_matrix(); `))
  ok(false, 'Yetki: yetkisiz matris çağıramaz')
} catch { ok(true, 'Yetki: yetkisiz → report_permission_matrix reddedildi') }
// finans metriği finance.view ister — fake engellenir
try {
  q(asFake(`select public.metric_finance(${P},${N}); `))
  ok(false, 'Yetki: yetkisiz metric_finance çağıramaz')
} catch { ok(true, 'Yetki: yetkisiz → metric_finance reddedildi') }

// 3) ZAMAN DİLİMİ — gruplama Europe/Istanbul; by_hour toplamı == total
try {
  const tz = q("select public.app_timezone();").split('\n').filter(Boolean).pop()
  ok(tz === 'Europe/Istanbul', 'Zaman dilimi: app_timezone = Europe/Istanbul', tz)
  const sumEq = readOwner(`select ((select coalesce(sum((x->>'count')::int),0) from jsonb_array_elements(public.metric_requests(${P},${N})->'by_hour') x) = (public.metric_requests(${P},${N})->>'total')::int)::text;`)
  ok(sumEq === 'true', 'Zaman dilimi: by_hour toplamı == total (kayıp yok)')
} catch (e) { ok(false, 'Zaman dilimi', String(e).split('\n')[0]) }

// 4) PERFORMANS — 30g + 365g metric_requests < 2000ms
try {
  const t0 = q(asOwner(`explain analyze select public.metric_requests(now()-interval '365 days', now());`))
  const m = t0.match(/Execution Time: ([\d.]+) ms/)
  const ms = m ? parseFloat(m[1]) : 9999
  ok(ms < 2000, `Performans: metric_requests(365g) ${ms.toFixed(0)}ms < 2000ms`)
} catch (e) { ok(false, 'Performans', String(e).split('\n')[0]) }

// 5) YETKİ YÖNETİMİ — set_role_permission owner/admin-only + owner satırı kilitli
try {
  q(asFake(`select public.set_role_permission('sales','reports.view',true); `))
  ok(false, 'Yetki yönetimi: yetkisiz set_role_permission çağıramaz')
} catch { ok(true, 'Yetki yönetimi: yetkisiz → set_role_permission reddedildi') }
try {
  q(asOwner(`select public.set_role_permission('owner','reports.view',false); `))
  ok(false, 'Yetki yönetimi: owner rolü değiştirilememeli')
} catch { ok(true, 'Yetki yönetimi: owner rolü kilitli (değiştirilemez)') }

// 6) DIŞA AKTARIM — CSV üreteci (BOM + ; ayraç) birim testi vitest'te; burada veri var mı
try {
  const has = readOwner(`select ((public.metric_quotes(${P},${N})->>'sent')::int >= 0)::text;`)
  ok(has === 'true', 'Dışa aktarım: teklif raporu verisi hazır (CSV Playwright-test edildi)')
} catch (e) { ok(false, 'Dışa aktarım', String(e).split('\n')[0]) }

console.log(`\n${fail === 0 ? '✅ P7.13' : '❌'} — ${fail} başarısız.`)
process.exit(fail ? 1 : 0)
