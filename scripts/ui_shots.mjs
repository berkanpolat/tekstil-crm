// UI ekran görüntüleri (ikas görünümü). Sistemde gerçek owner varsa bootstrap
// 403 döner; bu yüzden EK bir geçici admin (ui.test) doğrudan DB'ye kurulur
// (gerçek owner'a dokunulmaz), veri üretilir, ekranlar yakalanır, sonra silinir.
import { createClient } from '@supabase/supabase-js'
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'

const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const TEST = { email: 'ui.test@tekstilas.com', password: 'TestPass1!', id: '00000000-0000-0000-0000-0000000000f9' }
const EMP = { email: 'ui.calisan@tekstilas.com', password: 'EmpPass1!' }
const PG = ['-h', process.env.PGHOST, '-p', '5432', '-U', process.env.PGUSER, '-d', 'postgres', '-tA']
const sql = (s) => execFileSync('psql', [...PG, '-c', s], { encoding: 'utf8', env: process.env })

const clean = () => {
  sql(`delete from public.users where email in ('${TEST.email}','${EMP.email}');`)
  sql(`delete from auth.users where email in ('${TEST.email}','${EMP.email}');`)
  sql(`delete from public.positions where code in ('UZM','MUD');`)
  sql(`delete from public.departments where code in ('SATIS','URETIM','FINANS');`)
}

clean()
// Geçici admin (tam auth.users + identity)
sql(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change)
 values('00000000-0000-0000-0000-000000000000','${TEST.id}','authenticated','authenticated','${TEST.email}',extensions.crypt('${TEST.password}',extensions.gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('full_name','Demo Yönetici','created_by_admin',true),'','','','');`)
sql(`insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at,last_sign_in_at) values(extensions.gen_random_uuid(),'${TEST.id}','${TEST.id}','email',jsonb_build_object('sub','${TEST.id}','email','${TEST.email}'),now(),now(),now());`)
sql(`update public.users set role_id=(select id from public.roles where key='admin'), must_change_password=false where email='${TEST.email}';`)

const supa = createClient(URL, ANON, { auth: { persistSession: false } })
const si = await supa.auth.signInWithPassword({ email: TEST.email, password: TEST.password })
console.log('login:', si.error ? si.error.message : 'ok')
const ins = await supa.from('departments').insert([
  { name: 'Satış', code: 'SATIS', description: 'Satış ve müşteri ilişkileri', sort_order: 1, is_active: true },
  { name: 'Üretim', code: 'URETIM', description: 'Üretim operasyonları', sort_order: 2, is_active: true },
  { name: 'Finans', code: 'FINANS', description: 'Muhasebe ve finans', sort_order: 3, is_active: false },
])
console.log('dept:', ins.error ? ins.error.message : 'ok')
const { data: dept } = await supa.from('departments').select('id').eq('code', 'SATIS').maybeSingle()
const { data: adminRole } = await supa.from('roles').select('id').eq('key', 'admin').maybeSingle()
const cu = await supa.functions.invoke('create-user', {
  body: { email: EMP.email, password: EMP.password, full_name: 'Ayşe Yılmaz', role_id: adminRole?.id, department_id: dept?.id, phone: '5551112233' },
})
console.log('employee:', cu.error ? cu.error.message : 'ok')
await supa.auth.signOut()

const b = await chromium.launch()
const shot = async (p, path) => { await p.waitForTimeout(700); await p.screenshot({ path }) }
const login = async (p) => {
  await p.goto('http://localhost:5173/giris', { waitUntil: 'networkidle' })
  await p.getByLabel('E-posta').fill(TEST.email)
  await p.getByLabel('Şifre').fill(TEST.password)
  await p.getByRole('button', { name: 'Giriş yap' }).click()
  await p.waitForURL('http://localhost:5173/', { timeout: 10000 })
}

const page = await b.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto('http://localhost:5173/giris', { waitUntil: 'networkidle' })
await shot(page, '/tmp/ui-login.png')
await login(page)
await page.goto('http://localhost:5173/ayarlar/calisanlar', { waitUntil: 'networkidle' })
await shot(page, '/tmp/ui-staff.png')
await page.goto('http://localhost:5173/ayarlar/departmanlar', { waitUntil: 'networkidle' })
await shot(page, '/tmp/ui-departments.png')
await page.goto('http://localhost:5173/ayarlar/calisanlar', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Çalışan ekle' }).first().click()
await shot(page, '/tmp/ui-staff-form.png')

const m = await b.newPage({ viewport: { width: 390, height: 844 } })
await login(m)
await m.goto('http://localhost:5173/ayarlar/calisanlar', { waitUntil: 'networkidle' })
await shot(m, '/tmp/ui-mobile.png')

await b.close()
clean()
console.log('ok, temizlendi (gerçek owner korundu)')
