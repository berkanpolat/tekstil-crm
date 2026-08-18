// Öncelik 3+4 ARAYÜZDEN test: toplam sayaç, dışa aktar, toplu etiket, dönüştürülenleri
// göster, telefon araması, müşteri Faz-3 placeholder sekmeleri.
import { createClient } from '@supabase/supabase-js'
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const URL = process.env.VITE_SUPABASE_URL, ANON = process.env.VITE_SUPABASE_ANON_KEY
const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:5173'
const OUT = 'docs/assets/faz-1'
import { UI_TEST as TEST } from './lib/ui-test-user.mjs'
const PG = ['-h', process.env.PGHOST, '-p', process.env.PGPORT ?? '5432', '-U', process.env.PGUSER, '-d', 'postgres', '-tA']
const sql = (s) => execFileSync('psql', [...PG, '-c', s], { encoding: 'utf8', env: process.env }).trim()
mkdirSync(OUT, { recursive: true })
const clean = () => { sql(`delete from public.users where email='${TEST.email}';`); sql(`delete from auth.users where email='${TEST.email}';`) }
clean()
sql(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change) values('00000000-0000-0000-0000-000000000000','${TEST.id}','authenticated','authenticated','${TEST.email}',extensions.crypt('${TEST.password}',extensions.gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('full_name','Demo Yönetici','created_by_admin',true),'','','','');`)
sql(`insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at,last_sign_in_at) values(extensions.gen_random_uuid(),'${TEST.id}','${TEST.id}','email',jsonb_build_object('sub','${TEST.id}','email','${TEST.email}'),now(),now(),now());`)
sql(`update public.users set role_id=(select id from public.roles where key='admin'), must_change_password=false where email='${TEST.email}';`)

const leadPhone = sql(`select cp.value from public.contact_points cp join public.leads l on l.id=cp.entity_id and l.external_source='seed' where cp.entity_type='lead' and cp.type='phone' limit 1`)
const custId = sql(`select id from public.customers where external_source='seed' and deleted_at is null limit 1`)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1360, height: 900 } })
await page.goto(`${BASE}/giris`, { waitUntil: 'networkidle' })
await page.getByLabel('E-posta').fill(TEST.email); await page.getByLabel('Şifre').fill(TEST.password)
await page.getByRole('button', { name: 'Giriş yap' }).click()
await page.waitForURL(`${BASE}/`, { timeout: 15000 })

// Liste: toplam sayaç + dışa aktar + dönüştürülenleri göster + toplu bar
await page.goto(`${BASE}/potansiyeller`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
// ilk 3 satırı seç → toplu bar (etiket + dışa aktar)
const checks = page.locator('table tbody tr [role="checkbox"], table tbody tr input[type="checkbox"]')
for (let i = 0; i < 3; i++) await checks.nth(i).click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/leads-bulk-full.png` })
console.log('shot: leads-bulk-full (etiket+dışa aktar+toplam sayaç)')
await page.getByRole('button', { name: 'Seçimi bırak' }).click().catch(() => {})

// Telefon araması
await page.getByPlaceholder(/Firma, kişi veya şehir ara/).fill(leadPhone)
await page.waitForTimeout(1000)
await page.screenshot({ path: `${OUT}/leads-phone-search.png` })
console.log('shot: leads-phone-search')

// Müşteri kartı: Talepler placeholder sekmesi
await page.goto(`${BASE}/musteriler/${custId}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.getByRole('button', { name: 'Talepler' }).click().catch(() => {})
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/customer-phase3-tabs.png` })
console.log('shot: customer-phase3-tabs')

await b.close()
clean()
console.log('done; leadPhone=', leadPhone)
