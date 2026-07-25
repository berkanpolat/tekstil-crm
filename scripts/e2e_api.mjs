// =====================================================================
// Uçtan uca API testi (UI olmadan) — yeni tasarım.
// Zincir: bootstrap-owner (secret) → owner login → create-user (2 adımlı)
//         → çalışan doğrulama. + Negatif testler.
// Yalnızca anon key + BOOTSTRAP_SECRET (.env) + psql (DB şifresi).
// Sonunda tüm test kayıtlarını temizler.
//
// ÖN KOŞUL: Supabase panelinde "Allow new users to sign up" KAPALI olmalı
// (aksi halde "signUp reddedilmeli" negatif testi başarısız olur).
// =====================================================================
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'

const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SECRET = process.env.BOOTSTRAP_SECRET
if (!URL || !ANON || !SECRET) {
  console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / BOOTSTRAP_SECRET gerekli')
  process.exit(2)
}

const OWNER = { email: 'e2e.owner@tekstilas.com', password: 'OwnerPass1!' }
const EMP = { email: 'e2e.employee@tekstilas.com', password: 'EmpPass1!' }
const SECOND = { email: 'e2e.second@tekstilas.com', password: 'SecondPass1!' }
const ALL = [OWNER.email, EMP.email, SECOND.email]

const PG = ['-h', process.env.PGHOST, '-p', process.env.PGPORT ?? '5432',
  '-U', process.env.PGUSER, '-d', process.env.PGDATABASE ?? 'postgres', '-tA']
const psql = (sql) => execFileSync('psql', [...PG, '-c', sql], { encoding: 'utf8', env: process.env }).trim()

let pass = 0, fail = 0
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`PASS: ${name}`) }
  else { fail++; console.log(`FAIL: ${name} ${extra}`) }
}
const cleanup = () => {
  const list = ALL.map((e) => `'${e}'`).join(',')
  psql(`delete from public.users where email in (${list});`)
  psql(`delete from auth.users where email in (${list});`)
}

const fnFetch = (name, headers, body) =>
  fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

async function main() {
  console.log('--- ön temizlik ---')
  cleanup()

  const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

  // NEGATİF 1: yanlış secret ile bootstrap → 403
  {
    const r = await fnFetch('bootstrap-owner', { 'X-Bootstrap-Secret': 'yanlis-secret' },
      { email: OWNER.email, password: OWNER.password, full_name: 'X' })
    check('bootstrap-owner yanlış secret → 403', r.status === 403, `(status ${r.status})`)
  }

  // 1) OWNER BOOTSTRAP (doğru secret) → 201
  {
    const r = await fnFetch('bootstrap-owner', { 'X-Bootstrap-Secret': SECRET },
      { email: OWNER.email, password: OWNER.password, full_name: 'E2E Owner' })
    check('bootstrap-owner (owner oluştu) → 201', r.status === 201, `(status ${r.status})`)
  }
  const ownerRole = psql(`select r.key from public.users u join public.roles r on r.id=u.role_id where u.email='${OWNER.email}';`)
  check("owner rolü 'owner'", ownerRole === 'owner', `(görülen '${ownerRole}')`)
  const ownerMcp = psql(`select must_change_password from public.users where email='${OWNER.email}';`)
  check('owner must_change_password=false', ownerMcp === 'f', `(görülen '${ownerMcp}')`)

  // NEGATİF 2: ikinci bootstrap (doğru secret ama artık kullanıcı var) → 403
  {
    const r = await fnFetch('bootstrap-owner', { 'X-Bootstrap-Secret': SECRET },
      { email: 'baska@tekstilas.com', password: OWNER.password, full_name: 'X' })
    check('bootstrap-owner ikinci kez → 403 (tek kullanımlık)', r.status === 403, `(status ${r.status})`)
  }

  // 2) OWNER LOGIN
  const si = await anon.auth.signInWithPassword(OWNER)
  check('owner login', !si.error && !!si.data?.session, si.error?.message ?? '')
  const token = si.data?.session?.access_token
  const ownerId = si.data?.user?.id

  // admin rol id
  const { data: adminRole } = await anon.from('roles').select('id').eq('key', 'admin').single()

  // 3) CREATE-USER (iki adımlı) → 201
  {
    const r = await fnFetch('create-user', { Authorization: `Bearer ${token}` },
      { email: EMP.email, password: EMP.password, full_name: 'E2E Çalışan', role_id: adminRole?.id, phone: '5551112233' })
    const b = await r.text()
    check('create-user (çalışan eklendi) → 201', r.status === 201, `(status ${r.status} body ${b})`)
  }
  const empRow = psql(`select r.key||'|'||u.must_change_password||'|'||coalesce(u.phone,'-') from public.users u join public.roles r on r.id=u.role_id where u.email='${EMP.email}';`)
  check('çalışan admin|must_change=true|phone yazıldı (adım 2)', empRow === 'admin|true|5551112233', `(görülen '${empRow}')`)
  if (ownerId) {
    const cb = psql(`select (created_by='${ownerId}') from public.users where email='${EMP.email}';`)
    check('çalışan created_by = owner', cb === 't', `(görülen '${cb}')`)
  }

  // NEGATİF 3: doğrudan self-signup → platform seviyesinde reddedilmeli
  {
    const anon2 = createClient(URL, ANON, { auth: { persistSession: false } })
    const { data, error } = await anon2.auth.signUp({ email: SECOND.email, password: SECOND.password })
    check('doğrudan signUp reddedildi (platform kilidi)', !!error || !data?.user, error?.message ?? 'kullanıcı oluştu!')
    const c = psql(`select count(*) from public.users where email='${SECOND.email}';`)
    check('reddedilen signUp public.users\'a yazılmadı', c === '0', `(görülen ${c})`)
  }

  await anon.auth.signOut()
  console.log('--- son temizlik ---')
  cleanup()
  const leftover = psql(`select count(*) from public.users where email in (${ALL.map((e) => `'${e}'`).join(',')});`)
  check('temizlik tamam', leftover === '0', `(kalan ${leftover})`)

  console.log(`\n=== SONUÇ: ${pass} PASS, ${fail} FAIL ===`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('E2E hata:', e); try { cleanup() } catch { /* */ } process.exit(1) })
