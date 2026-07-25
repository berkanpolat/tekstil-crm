// =====================================================================
// Güvenlik regresyon testi — kabul testinde çıkan açıklar bir daha sessizce
// açılmasın. Geçici admin + Satış kullanıcısı + kurban kurar, saldırıları
// dener, hepsi kapalı olmalı. Gerçek owner'a DOKUNMAZ, sonunda temizler.
//   node scripts/security_regression.mjs
// =====================================================================
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'

const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const A = { email: 'sec.admin@tekstilas.com', password: 'AdminPass1!', id: '00000000-0000-0000-0000-0000000000ea' }
const S = { email: 'sec.sales@tekstilas.com', password: 'SalesPass1!' }
const V = { email: 'sec.victim@tekstilas.com', password: 'VictPass1!' }
const W = { email: 'sec.newhire@tekstilas.com', password: 'HirePass1!' }
const PG = ['-h', process.env.PGHOST, '-p', '5432', '-U', process.env.PGUSER, '-d', 'postgres', '-tA']
const q = (s) => execFileSync('psql', [...PG, '-c', s], { encoding: 'utf8', env: process.env }).trim()
const clean = () => {
  const l = [A, S, V, W].map((u) => `'${u.email}'`).join(',')
  q(`delete from public.users where email in (${l});`)
  q(`delete from auth.users where email in (${l});`)
}
let pass = 0, fail = 0
const check = (n, ok, x = '') => { if (ok) { pass++; console.log(`PASS: ${n}`) } else { fail++; console.log(`FAIL: ${n} ${x}`) } }
const invokeStatus = async (err) => (err?.context ? `${err.context.status} ${await err.context.text().catch(() => '')}` : 'yok')

async function main() {
  clean()
  // Geçici admin (doğrudan DB)
  q(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change) values('00000000-0000-0000-0000-000000000000','${A.id}','authenticated','authenticated','${A.email}',extensions.crypt('${A.password}',extensions.gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('full_name','Sec Admin','created_by_admin',true),'','','','');`)
  q(`insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at,last_sign_in_at) values(extensions.gen_random_uuid(),'${A.id}','${A.id}','email',jsonb_build_object('sub','${A.id}','email','${A.email}'),now(),now(),now());`)
  q(`update public.users set role_id=(select id from public.roles where key='admin'), must_change_password=false where email='${A.email}';`)

  const admin = createClient(URL, ANON, { auth: { persistSession: false } })
  await admin.auth.signInWithPassword({ email: A.email, password: A.password })
  const rid = async (key) => (await admin.from('roles').select('id').eq('key', key).single()).data.id
  const salesRole = await rid('sales'), viewerRole = await rid('viewer'), adminRole = await rid('admin')

  // Satış + kurban oluştur
  const c1 = await admin.functions.invoke('create-user', { body: { email: S.email, password: S.password, full_name: 'Sec Sales', role_id: salesRole } })
  const c2 = await admin.functions.invoke('create-user', { body: { email: V.email, password: V.password, full_name: 'Sec Victim', role_id: salesRole } })
  check('admin create-user çağırabildi', !c1.error && !c2.error, await invokeStatus(c1.error))

  // TEST: seçilen rol DB'ye doğru yazıldı
  const salesRoleKey = q(`select coalesce((select key from public.roles r where r.id=u.role_id),'NULL') from public.users u where email='${S.email}';`)
  check('oluşturmada seçilen rol DB\'ye doğru yazıldı (sales)', salesRoleKey === 'sales', `(görülen '${salesRoleKey}')`)
  const salesId = q(`select id from public.users where email='${S.email}';`)
  const victimId = q(`select id from public.users where email='${V.email}';`)
  await admin.auth.signOut()

  // Satış olarak giriş
  const sales = createClient(URL, ANON, { auth: { persistSession: false } })
  await sales.auth.signInWithPassword({ email: S.email, password: S.password })

  // TEST: Satış → create-user → 403
  const c3 = await sales.functions.invoke('create-user', { body: { email: W.email, password: W.password, full_name: 'X', role_id: salesRole } })
  check('Satış kullanıcısı create-user → 403', !!c3.error && c3.error.context?.status === 403, await invokeStatus(c3.error))
  check('  → kurban oluşmadı', q(`select count(*) from public.users where email='${W.email}';`) === '0')

  // TEST: Satış → KENDİ rolünü değiştir → trigger reddi (42501)
  const u1 = await sales.from('users').update({ role_id: adminRole }).eq('id', salesId)
  check('Satış kullanıcısı KENDİ rolünü değiştiremez (trigger)', u1.error?.code === '42501', u1.error ? '' : 'HATA YOK!')
  check('  → kendi rolü sales kaldı', q(`select coalesce((select key from public.roles r where r.id=u.role_id),'NULL') from public.users u where email='${S.email}';`) === 'sales')

  // TEST: Satış → BAŞKASININ rolünü değiştir → RLS engeli (satır güncellenmez)
  await sales.from('users').update({ role_id: viewerRole }).eq('id', victimId)
  check('Satış kullanıcısı BAŞKASININ rolünü değiştiremez (RLS)', q(`select coalesce((select key from public.roles r where r.id=u.role_id),'NULL') from public.users u where email='${V.email}';`) === 'sales')

  // TEST: Satış → BAŞKASINI pasifleştir → RLS engeli
  await sales.from('users').update({ is_active: false }).eq('id', victimId)
  check('Satış kullanıcısı BAŞKASINI pasifleştiremez (RLS)', q(`select is_active from public.users where email='${V.email}';`) === 't')

  // TEST: Satış → KENDİ profilini (ad) güncelleyebilir (self-update korunur)
  await sales.from('users').update({ full_name: 'Sec Sales Güncel' }).eq('id', salesId)
  check('Satış kullanıcısı kendi profilini güncelleyebilir', q(`select full_name from public.users where email='${S.email}';`) === 'Sec Sales Güncel')
  await sales.auth.signOut()

  // TEST: must_change kullanıcısı şifre değiştirince must_change false olur
  q(`update public.users set must_change_password=true where email='${S.email}';`)
  const s2 = createClient(URL, ANON, { auth: { persistSession: false } })
  await s2.auth.signInWithPassword({ email: S.email, password: S.password })
  await s2.auth.updateUser({ password: 'YeniSifre9!' })
  const mc = await s2.from('users').update({ must_change_password: false }).eq('id', salesId)
  check('kullanıcı kendi must_change_password\'ünü false yapabilir', !mc.error, mc.error?.message ?? '')
  check('  → DB must_change_password=false', q(`select must_change_password from public.users where email='${S.email}';`) === 'f')
  await s2.auth.signOut()

  clean()
  console.log(`\n=== GÜVENLİK REGRESYON: ${pass} PASS, ${fail} FAIL ===`)
  process.exit(fail === 0 ? 0 : 1)
}
main().catch((e) => { console.error('hata:', e); try { clean() } catch { /* */ } process.exit(1) })
