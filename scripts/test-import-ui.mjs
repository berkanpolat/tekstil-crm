// İçe aktarma akışını ARAYÜZDEN test: dedup-atla + eşleme hatırlama + geçmiş + undo.
import { createClient } from '@supabase/supabase-js'
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const URL = process.env.VITE_SUPABASE_URL, ANON = process.env.VITE_SUPABASE_ANON_KEY
const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:5173'
const OUT = 'docs/assets/faz-1'
import { UI_TEST as TEST } from './lib/ui-test-user.mjs'
const PG = ['-h', process.env.PGHOST, '-p', process.env.PGPORT ?? '5432', '-U', process.env.PGUSER, '-d', 'postgres', '-tA']
const sql = (s) => execFileSync('psql', [...PG, '-c', s], { encoding: 'utf8', env: process.env }).trim()
mkdirSync(OUT, { recursive: true })

const CSV = '/tmp/imp-ui.csv'
writeFileSync(CSV, `Firma;Şehir;Telefon;E-posta;Vergi No
İçe Aktarma Test Bir A.Ş.;Bursa;0532 900 00 01;bir@imptest.com;7770001111
İçe Aktarma Test İki Ltd.;İzmir;0532 900 00 02;iki@imptest.com;7770002222
İçe Aktarma Test Üç A.Ş.;Adana;0532 900 00 03;;7770003333
`)

const clean = () => { sql(`delete from public.users where email='${TEST.email}';`); sql(`delete from auth.users where email='${TEST.email}';`) }
const cleanImport = () => {
  sql(`do $$ declare b bigint; begin
    for b in select id from public.import_batches where file_name='imp-ui.csv' loop
      delete from public.contact_points where entity_type='lead' and entity_id in (select id from public.leads where import_batch_id=b);
      delete from public.event_log where entity_type='lead' and entity_id in (select id::text from public.leads where import_batch_id=b);
      delete from public.leads where import_batch_id=b;
      delete from public.import_batches where id=b;
    end loop; end $$;`)
}
cleanImport(); clean()
sql(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change) values('00000000-0000-0000-0000-000000000000','${TEST.id}','authenticated','authenticated','${TEST.email}',extensions.crypt('${TEST.password}',extensions.gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('full_name','Demo Yönetici','created_by_admin',true),'','','','');`)
sql(`insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at,last_sign_in_at) values(extensions.gen_random_uuid(),'${TEST.id}','${TEST.id}','email',jsonb_build_object('sub','${TEST.id}','email','${TEST.email}'),now(),now(),now());`)
sql(`update public.users set role_id=(select id from public.roles where key='admin'), must_change_password=false where email='${TEST.email}';`)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1360, height: 900 } })
await page.goto(`${BASE}/giris`, { waitUntil: 'networkidle' })
await page.getByLabel('E-posta').fill(TEST.email); await page.getByLabel('Şifre').fill(TEST.password)
await page.getByRole('button', { name: 'Giriş yap' }).click()
await page.waitForURL(`${BASE}/`, { timeout: 15000 })

const importCsv = async () => {
  await page.goto(`${BASE}/potansiyeller`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'İçe aktar' }).click()
  await page.waitForTimeout(400)
  await page.setInputFiles('input[type=file]', CSV)
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /satırı içe aktar/ }).click()
  await page.waitForTimeout(1500)
}

// 1. içe aktarma → hepsi yeni
await importCsv()
await page.screenshot({ path: `${OUT}/import-first.png` })
console.log('shot: import-first (3 eklendi)')
await page.getByRole('button', { name: 'Kapat' }).click().catch(() => {})

// 2. içe aktarma (AYNI dosya) → hepsi atlandı (mükerrer) + eşleme hatırlandı
await importCsv()
await page.screenshot({ path: `${OUT}/import-second-skipped.png` })
console.log('shot: import-second-skipped (0 eklendi, 3 atlandı)')
await page.getByRole('button', { name: 'Kapat' }).click().catch(() => {})

// 3. Geçmiş ekranı + undo
await page.getByRole('button', { name: 'İçe aktar' }).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: 'Geçmiş' }).click()
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/import-history.png` })
console.log('shot: import-history')

await b.close()
console.log('== DB: partiler ==')
console.log(sql(`select id||' '||file_name||' eklendi='||inserted_rows from public.import_batches where file_name='imp-ui.csv' order by id`))
cleanImport(); clean()
console.log('done')
