// UI güvenlik doğrulaması: BUG 4 (Satış kullanıcısı Ayarlar'ı görmez + /ayarlar
// → erişim yok) ve BUG 1 (ilk-giriş şifre değişimi döngüsü kırıldı).
import { createClient } from '@supabase/supabase-js'
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'

const URL = process.env.VITE_SUPABASE_URL, ANON = process.env.VITE_SUPABASE_ANON_KEY
const A = { email: 'uisec.admin@tekstilas.com', password: 'AdminPass1!', id: '00000000-0000-0000-0000-0000000000eb' }
const SALES = { email: 'uisec.sales@tekstilas.com', password: 'SalesPass1!' }
const HIRE = { email: 'uisec.hire@tekstilas.com', password: 'HirePass1!' }
const PG = ['-h', process.env.PGHOST, '-p', '5432', '-U', process.env.PGUSER, '-d', 'postgres', '-tA']
const q = (s) => execFileSync('psql', [...PG, '-c', s], { encoding: 'utf8', env: process.env }).trim()
const clean = () => { const l = [A, SALES, HIRE].map((u) => `'${u.email}'`).join(','); q(`delete from public.users where email in (${l});`); q(`delete from auth.users where email in (${l});`) }
let pass = 0, fail = 0
const check = (n, ok, x = '') => { if (ok) { pass++; console.log(`PASS: ${n}`) } else { fail++; console.log(`FAIL: ${n} ${x}`) } }

async function main() {
  clean()
  q(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change) values('00000000-0000-0000-0000-000000000000','${A.id}','authenticated','authenticated','${A.email}',extensions.crypt('${A.password}',extensions.gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('full_name','UISec Admin','created_by_admin',true),'','','','');`)
  q(`insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at,last_sign_in_at) values(extensions.gen_random_uuid(),'${A.id}','${A.id}','email',jsonb_build_object('sub','${A.id}','email','${A.email}'),now(),now(),now());`)
  q(`update public.users set role_id=(select id from public.roles where key='admin'), must_change_password=false where email='${A.email}';`)
  const admin = createClient(URL, ANON, { auth: { persistSession: false } })
  await admin.auth.signInWithPassword({ email: A.email, password: A.password })
  const salesRole = (await admin.from('roles').select('id').eq('key', 'sales').single()).data.id
  await admin.functions.invoke('create-user', { body: { email: SALES.email, password: SALES.password, full_name: 'UISec Sales', role_id: salesRole } })
  await admin.functions.invoke('create-user', { body: { email: HIRE.email, password: HIRE.password, full_name: 'UISec Hire', role_id: salesRole } })
  await admin.auth.signOut()
  // BUG4 testi için Satış kullanıcısı uygulamaya girebilmeli (must_change=false).
  // HIRE ise BUG1 için must_change=true kalır.
  q(`update public.users set must_change_password=false where email='${SALES.email}';`)

  const b = await chromium.launch()
  const login = async (p, u) => {
    await p.goto('http://localhost:5173/giris', { waitUntil: 'networkidle' })
    await p.getByLabel('E-posta').fill(u.email)
    await p.getByLabel('Şifre').fill(u.password)
    await p.getByRole('button', { name: 'Giriş yap' }).click()
  }

  // BUG 4: Satış kullanıcısı
  const p1 = await b.newPage({ viewport: { width: 1280, height: 800 } })
  await login(p1, SALES)
  await p1.waitForURL('http://localhost:5173/', { timeout: 10000 }).catch(() => {})
  await p1.waitForTimeout(800)
  const ayarlarVisible = await p1.getByRole('link', { name: 'Ayarlar' }).count()
  check('BUG4: Satış kullanıcısı sidebar\'da Ayarlar GÖRMEZ', ayarlarVisible === 0, `(görülen ${ayarlarVisible})`)
  await p1.goto('http://localhost:5173/ayarlar/calisanlar', { waitUntil: 'networkidle' })
  await p1.waitForTimeout(600)
  const noAccess = await p1.getByText('Bu sayfaya erişiminiz yok').count()
  check('BUG4: /ayarlar elle yazılınca "erişim yok" ekranı', noAccess > 0)
  await p1.screenshot({ path: '/tmp/uisec-sales.png' })

  // BUG 1: ilk-giriş şifre değişimi döngüsü
  const p2 = await b.newPage({ viewport: { width: 1280, height: 800 } })
  await login(p2, HIRE)
  await p2.waitForURL('**/sifre-degistir', { timeout: 10000 }).catch(() => {})
  const onChange = p2.url().includes('/sifre-degistir')
  check('BUG1: ilk girişte şifre değiştirme ekranına yönlendi', onChange, `(url ${p2.url()})`)
  await p2.locator('input[type=password]').nth(0).fill('YepyeniSifre1!')
  await p2.locator('input[type=password]').nth(1).fill('YepyeniSifre1!')
  await p2.getByRole('button', { name: 'Şifreyi kaydet' }).click()
  // Döngü varsa buraya /sifre-degistir'e geri döner; kırıksa panele gider.
  let landed = false
  try { await p2.waitForURL('http://localhost:5173/', { timeout: 8000 }); landed = true } catch { /* */ }
  check('BUG1: şifre değişince PANELE girdi (döngü YOK)', landed, `(url ${p2.url()})`)
  await p2.screenshot({ path: '/tmp/uisec-dashboard.png' })

  await b.close()
  clean()
  console.log(`\n=== UI GÜVENLİK: ${pass} PASS, ${fail} FAIL ===`)
  process.exit(fail === 0 ? 0 : 1)
}
main().catch((e) => { console.error('hata:', e); try { clean() } catch { /* */ } process.exit(1) })
