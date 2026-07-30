// Mükerrer tespitini ARAYÜZDEN test — 3 senaryo + görsel.
import { createClient } from '@supabase/supabase-js'
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const URL = process.env.VITE_SUPABASE_URL, ANON = process.env.VITE_SUPABASE_ANON_KEY
const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:5173'
const OUT = 'docs/assets/faz-1'
const TEST = { email: 'ui.test@tekstilas.com', password: 'TestPass1!', id: '00000000-0000-0000-0000-0000000000f9' }
const PG = ['-h', process.env.PGHOST, '-p', process.env.PGPORT ?? '5432', '-U', process.env.PGUSER, '-d', 'postgres', '-tA']
const sql = (s) => execFileSync('psql', [...PG, '-c', s], { encoding: 'utf8', env: process.env }).trim()
mkdirSync(OUT, { recursive: true })

const clean = () => { sql(`delete from public.users where email='${TEST.email}';`); sql(`delete from auth.users where email='${TEST.email}';`) }
clean()
sql(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change) values('00000000-0000-0000-0000-000000000000','${TEST.id}','authenticated','authenticated','${TEST.email}',extensions.crypt('${TEST.password}',extensions.gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('full_name','Demo Yönetici','created_by_admin',true),'','','','');`)
sql(`insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at,last_sign_in_at) values(extensions.gen_random_uuid(),'${TEST.id}','${TEST.id}','email',jsonb_build_object('sub','${TEST.id}','email','${TEST.email}'),now(),now(),now());`)
sql(`update public.users set role_id=(select id from public.roles where key='admin'), must_change_password=false where email='${TEST.email}';`)

// Benzersiz bir seed müşteri telefonu (gerçekçi: tam 1 eşleşme çıkmalı)
const custPhone = sql(`select cp.value from public.contact_points cp join public.customers c on c.id=cp.entity_id and c.external_source='seed' where cp.entity_type='customer' and cp.type='phone' limit 1`)
// Gerçekten tekrar eden bir firma adı (2-3 kayıt) — anlamlı mükerrer
const dupCompany = sql(`select company_name from public.leads where company_name_normalized=(select company_name_normalized from public.leads where external_source='seed' group by company_name_normalized having count(*)>=2 limit 1) limit 1`)
// Şirketi başka kayıtta da geçen bir müşteri (kart bandı için)
const dupCustId = sql(`select c.id from public.customers c where c.external_source='seed' and c.deleted_at is null and (select count(*) from public.customers c2 where c2.company_name_normalized=c.company_name_normalized) >= 2 limit 1`)
console.log('mükerrer firma:', dupCompany)
console.log('müşteri telefonu:', custPhone, '| dup müşteri id:', dupCustId)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1360, height: 900 } })
await page.goto(`${BASE}/giris`, { waitUntil: 'networkidle' })
await page.getByLabel('E-posta').fill(TEST.email)
await page.getByLabel('Şifre').fill(TEST.password)
await page.getByRole('button', { name: 'Giriş yap' }).click()
await page.waitForURL(`${BASE}/`, { timeout: 15000 })

// Senaryo A + B: yeni potansiyel formu → benzer firma + müşteri telefonu
await page.goto(`${BASE}/potansiyeller`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Potansiyel ekle' }).click()
await page.waitForTimeout(400)
await page.getByLabel('Firma adı').fill(dupCompany)
await page.getByLabel('Telefon').fill(custPhone)
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/dedup-form.png` })
console.log('shot: dedup-form (benzer firma + aynı telefon/müşteri)')
// Uyarıya RAĞMEN oluştur → dedup.overridden event'i tetiklenmeli (eşik izleme)
await page.getByLabel('Kişi adı').fill('Dedup Override Test')
await page.getByRole('button', { name: 'Oluştur' }).click()
await page.waitForURL(/\/potansiyeller\/\d+/, { timeout: 15000 })
const newLeadId = page.url().match(/\/potansiyeller\/(\d+)/)[1]
await page.waitForTimeout(800)

// Senaryo C: müşteri kartında mükerrer bandı
await page.goto(`${BASE}/musteriler/${dupCustId}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/dedup-card-band.png` })
console.log('shot: dedup-card-band')

await b.close()

// dedup.overridden event yazıldı mı (arayüzden oluşturma sonrası)?
const ev = sql(`select count(*) from public.event_log where event_type='dedup.overridden' and entity_id='${newLeadId}'`)
console.log(`dedup.overridden event (lead ${newLeadId}):`, ev, ev === '1' ? 'YAZILDI ✓' : 'YOK ✗')
// test lead + event + contact temizle
sql(`delete from public.contact_points where entity_type='lead' and entity_id=${newLeadId};`)
sql(`delete from public.event_log where entity_id='${newLeadId}' and entity_type='lead';`)
sql(`delete from public.leads where id=${newLeadId};`)

clean()
console.log('done')
