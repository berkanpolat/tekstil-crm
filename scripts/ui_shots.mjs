// UI akış ekran görüntüleri: geçici owner kur + bir çalışan ekle (API),
// sonra tarayıcıdan giriş → çalışan listesi → ekleme diyaloğu yakala. Sonra temizle.
import { createClient } from '@supabase/supabase-js'
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'

const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SECRET = process.env.BOOTSTRAP_SECRET
const OWNER = { email: 'ui.owner@tekstilas.com', password: 'OwnerPass1!' }
const EMP = { email: 'ui.calisan@tekstilas.com', password: 'EmpPass1!' }
const PG = ['-h', process.env.PGHOST, '-p', '5432', '-U', process.env.PGUSER, '-d', 'postgres', '-tA']
const psql = (sql) => execFileSync('psql', [...PG, '-c', sql], { encoding: 'utf8', env: process.env }).trim()
const dbClean = () => {
  const list = `'${OWNER.email}','${EMP.email}'`
  psql(`delete from public.users where email in (${list});`)
  psql(`delete from auth.users where email in (${list});`)
}

dbClean()
// 1) owner
const r = await fetch(`${URL}/functions/v1/bootstrap-owner`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', 'X-Bootstrap-Secret': SECRET },
  body: JSON.stringify({ email: OWNER.email, password: OWNER.password, full_name: 'Sistem Sahibi' }),
})
console.log('bootstrap owner:', r.status)
// 2) owner ile giriş + bir çalışan ekle (liste dolu görünsün)
const supa = createClient(URL, ANON, { auth: { persistSession: false } })
const si = await supa.auth.signInWithPassword(OWNER)
const { data: adminRole } = await supa.from('roles').select('id').eq('key', 'admin').single()
const cu = await supa.functions.invoke('create-user', {
  body: { email: EMP.email, password: EMP.password, full_name: 'Ayşe Yılmaz', role_id: adminRole.id, phone: '5551112233' },
})
console.log('create employee:', cu.error ? cu.error.message : 'ok')
await supa.auth.signOut()

// 3) Tarayıcı akışı
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto('http://localhost:5173/giris', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.screenshot({ path: '/tmp/ui-login.png' })

await page.getByLabel('E-posta').fill(OWNER.email)
await page.getByLabel('Şifre').fill(OWNER.password)
await page.getByRole('button', { name: 'Giriş yap' }).click()
await page.waitForURL('http://localhost:5173/', { timeout: 10000 })
await page.waitForTimeout(600)
await page.screenshot({ path: '/tmp/ui-dashboard.png' })

await page.goto('http://localhost:5173/ayarlar/calisanlar', { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await page.screenshot({ path: '/tmp/ui-staff.png' })

await page.getByRole('button', { name: 'Çalışan ekle' }).first().click()
await page.waitForTimeout(600)
await page.screenshot({ path: '/tmp/ui-staff-form.png' })

await b.close()
dbClean()
console.log('ok, temizlendi')
