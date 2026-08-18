// P3.3 Talepler — ARAYÜZDEN uçtan uca test: oluştur → kart → ürün ekle → dosya sekmesi.
// Kanıt kuralı: kriter yalnızca arayüzden doğrulanırsa "kanıtlı".
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'

const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:5173'
const OUT = 'docs/assets/faz-3'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
import { UI_TEST as TEST } from './lib/ui-test-user.mjs'
const sql = (s) => execFileSync('psql', [PGURL, '-tAc', s], { encoding: 'utf8' }).trim()
mkdirSync(OUT, { recursive: true })

// Test yöneticisi (idempotent)
sql(`delete from public.users where email='${TEST.email}'; delete from auth.users where email='${TEST.email}';`)
sql(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change) values('00000000-0000-0000-0000-000000000000','${TEST.id}','authenticated','authenticated','${TEST.email}',extensions.crypt('${TEST.password}',extensions.gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('full_name','Demo Yönetici','created_by_admin',true),'','','','');`)
sql(`insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at,last_sign_in_at) values(extensions.gen_random_uuid(),'${TEST.id}','${TEST.id}','email',jsonb_build_object('sub','${TEST.id}','email','${TEST.email}'),now(),now(),now());`)
sql(`update public.users set role_id=(select id from public.roles where key='admin'), must_change_password=false where email='${TEST.email}';`)

const cust = sql(`select id||'|'||company_name from public.customers where deleted_at is null order by id limit 1`).split('|')
const custId = cust[0], custName = cust[1]
const opsBefore = Number(sql(`select count(*) from public.operations`))
console.log('müşteri:', custId, custName, '| başlangıç op sayısı:', opsBefore)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1360, height: 900 } })
page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser error]', m.text()) })

await page.goto(`${BASE}/giris`, { waitUntil: 'networkidle' })
await page.getByLabel('E-posta').fill(TEST.email)
await page.getByLabel('Şifre').fill(TEST.password)
await page.getByRole('button', { name: 'Giriş yap' }).click()
await page.waitForURL(`${BASE}/`, { timeout: 15000 })

// 1) Talepler listesi açılıyor mu
await page.goto(`${BASE}/talepler`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/talepler-liste.png` })
console.log('shot: talepler-liste')

// 2) Talep oluştur
await page.getByRole('button', { name: 'Talep oluştur' }).first().click()
await page.waitForTimeout(500)
const title = `UI Test Talep ${opsBefore + 1}`
const dialog = page.getByRole('dialog')
// Müşteri seç (SearchableSelect: combobox trigger → CommandInput "Ara…" → option)
await dialog.getByRole('combobox').first().click()
await page.waitForTimeout(400)
await page.getByPlaceholder('Ara…', { exact: true }).fill(custName.slice(0, 6))
await page.waitForTimeout(500)
await page.getByRole('option').first().click()
await page.getByLabel('Proje başlığı').fill(title)
await page.getByLabel('Açıklama').fill('Arayüz testinden oluşturulan talep.')
await page.screenshot({ path: `${OUT}/talep-form.png` })
await page.getByRole('button', { name: 'Oluştur' }).click()
await page.waitForURL(/\/talepler\/\d+/, { timeout: 15000 })
const opId = page.url().match(/\/talepler\/(\d+)/)[1]
await page.waitForTimeout(1000)
await page.screenshot({ path: `${OUT}/talep-kart-genel.png` })
console.log('shot: talep-kart-genel | yeni op id:', opId)

// DB doğrulaması: kod TAS-, default aşama talep, durum + öncelik atanmış
const row = sql(`select o.code, st.key, rs.key, pr.key, o.customer_id from public.operations o
  left join public.operation_stages st on st.id=o.stage_id
  left join public.request_statuses rs on rs.id=o.request_status_id
  left join public.priorities pr on pr.id=o.priority_id
  where o.id=${opId}`)
console.log('DB op:', row, '(beklenen: TAS-*, talep, <ilk durum>, normal, müşteri=' + custId + ')')

// 3) Ürünler sekmesi → ürün ekle
await page.getByRole('button', { name: 'Ürünler' }).click()
await page.waitForTimeout(400)
await page.getByPlaceholder('Ürün adı *').fill('Oversize T-Shirt')
await page.getByPlaceholder('Adet').fill('500')
await page.getByPlaceholder('Kumaş').fill('%100 Pamuk Süprem')
await page.getByRole('button', { name: 'Ekle' }).click()
await page.waitForTimeout(1000)
await page.screenshot({ path: `${OUT}/talep-kart-urunler.png` })
const items = sql(`select count(*)||'|'||coalesce(max(name),'-')||'|'||coalesce(max(quantity)::text,'-') from public.operation_items where operation_id=${opId} and deleted_at is null`)
console.log('DB ürün:', items, '(beklenen: 1|Oversize T-Shirt|500)')

// 4) Dosyalar sekmesi görünüyor mu
await page.getByRole('button', { name: 'Dosyalar' }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/talep-kart-dosyalar.png` })
console.log('shot: talep-kart-dosyalar')

// 5) Listeye dön → yeni talep listede
await page.goto(`${BASE}/talepler`, { waitUntil: 'networkidle' })
await page.getByPlaceholder(/Kod, eski kod/).fill(row.split('|')[0])
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/talepler-liste-arama.png` })
const listVisible = await page.getByText(title).count()
console.log('listede arama sonucu görünür mü:', listVisible > 0 ? 'EVET' : 'HAYIR')

const opsAfter = Number(sql(`select count(*) from public.operations`))
console.log(`\nSONUÇ: op ${opsBefore} → ${opsAfter} | kod=${row.split('|')[0]} | ürün eklendi=${items.startsWith('1|')} | listede=${listVisible > 0}`)

await b.close()
