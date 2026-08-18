// =====================================================================
// Paylaşılan test yöneticisi (ui.test) — güvenli yaşam döngüsü.
//
// NEDEN: Eskiden her UI test scripti sabit `TestPass1!` şifreli bir ADMIN
// hesabını canlı DB'ye kurup çoğu zaman silmiyordu → üretimde bilinen
// admin arka kapısı. Bu modül o riski kapatır:
//   • Şifre HER KOŞUDA rastgele (kaynakta sabit şifre yok).
//   • Hesap import anında idempotent kurulur (ensureUiTestUser).
//   • Teardown process ÇIKIŞINDA garanti çalışır — script çökse,
//     Ctrl-C ile kesilse, exception atsa bile (senkron psql).
//
// KULLANIM (test scriptinde):
//   import { UI_TEST as TEST } from './lib/ui-test-user.mjs'
//   // ...TEST.email / TEST.password / TEST.id ile devam et.
// Import etmek yeterli: kurulum + çıkışta silme otomatiktir.
//
// Bağlantı: script'in kendi PG* env'i varsa onu, yoksa .env pooler'ını
// kullanır (scriptin bağlantı yönteminden bağımsız, kendi kendine yeter).
// =====================================================================
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const EMAIL = 'ui.test@tekstilas.com'
const ID = '00000000-0000-0000-0000-0000000000f9'
// Her process için tek, rastgele, tırnaksız (SQL literaline güvenli) şifre.
const PASSWORD = 'uitest-' + randomBytes(24).toString('base64url')

// ── .env oku (modül konumuna göre; cwd'den bağımsız) ─────────────────
function readEnv(key) {
  if (process.env[key]) return process.env[key]
  try {
    const txt = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    const line = txt.split('\n').find((l) => l.startsWith(key + '='))
    return line ? line.slice(key.length + 1).replace(/^"(.*)"$/, '$1').trim() : undefined
  } catch { return undefined }
}

// ── Bağlantı: mevcut PG* env varsa onu kullan, yoksa .env pooler ──────
const CONN_ENV = {
  ...process.env,
  PGHOST: process.env.PGHOST || 'aws-0-eu-west-1.pooler.supabase.com',
  PGPORT: process.env.PGPORT || '5432',
  PGUSER: process.env.PGUSER || `postgres.${readEnv('SUPABASE_PROJECT_REF')}`,
  PGDATABASE: process.env.PGDATABASE || 'postgres',
  PGPASSWORD: process.env.PGPASSWORD || readEnv('SUPABASE_DB_PASSWORD'),
}
const CONN_ARGS = process.env.PGURL ? [process.env.PGURL] : []
const psql = (s) =>
  execFileSync('psql', [...CONN_ARGS, '-v', 'ON_ERROR_STOP=1', '-tAc', s], {
    encoding: 'utf8',
    env: CONN_ENV,
  }).trim()

// ── Kur/Sil ──────────────────────────────────────────────────────────
function deleteUser() {
  // Sıra önemli: public.users → auth.users (users.id → auth.users on delete restrict).
  // created_by/owner_id vb. hepsi `on delete set null` → FK bloklamaz.
  psql(`delete from public.users where email='${EMAIL}';`)
  psql(`delete from auth.users where email='${EMAIL}';`)
}

let ensured = false
export function ensureUiTestUser() {
  if (ensured) return UI_TEST
  deleteUser() // idempotent: varsa temizle
  // Tam auth.users + identity (app_metadata trigger'a görünmez → identity şart).
  psql(
    `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change) ` +
      `values('00000000-0000-0000-0000-000000000000','${ID}','authenticated','authenticated','${EMAIL}',extensions.crypt('${PASSWORD}',extensions.gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('full_name','Demo Yönetici','created_by_admin',true),'','','','');`,
  )
  psql(
    `insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at,last_sign_in_at) ` +
      `values(extensions.gen_random_uuid(),'${ID}','${ID}','email',jsonb_build_object('sub','${ID}','email','${EMAIL}'),now(),now(),now());`,
  )
  psql(
    `update public.users set role_id=(select id from public.roles where key='admin'), must_change_password=false where email='${EMAIL}';`,
  )
  ensured = true
  registerTeardown()
  return UI_TEST
}

let torn = false
export function teardownUiTestUser() {
  if (torn) return
  torn = true
  try {
    deleteUser()
  } catch (e) {
    // Görünür olsun ama diğer çıkış işini engellemesin.
    console.error('[ui-test-user] teardown hatası:', e.message)
  }
}

// ── Teardown'ı HER çıkış yolunda garanti et ──────────────────────────
let registered = false
function registerTeardown() {
  if (registered) return
  registered = true
  process.on('exit', teardownUiTestUser) // normal bitiş + process.exit()
  process.on('SIGINT', () => process.exit(130)) // Ctrl-C
  process.on('SIGTERM', () => process.exit(143))
  process.on('uncaughtException', (e) => {
    console.error('[ui-test-user] yakalanmamış hata:', e)
    process.exit(1) // → 'exit' → teardown
  })
  process.on('unhandledRejection', (e) => {
    console.error('[ui-test-user] işlenmemiş reddetme:', e)
    process.exit(1)
  })
}

export const UI_TEST = {
  email: EMAIL,
  id: ID,
  get password() {
    return PASSWORD
  },
}

// Import edildiğinde otomatik kur (ve teardown'ı kaydet).
ensureUiTestUser()
