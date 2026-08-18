// =====================================================================
// Faz 1 ekran görüntüleri — docs/faz-1-ekranlar.md için biriktirilir.
// Kalıp: geçici admin'i (ui.test) doğrudan DB'ye kur (gerçek owner'a dokunma),
// Playwright ile login ol, ekranları yakala, sonra geçici admin'i sil.
// Seed leads (scripts/seed-fake-leads.sql) önceden yüklü olmalı.
// Çalıştırma (dev server açıkken):
//   PGHOST=... PGUSER=... PGPASSWORD=... node scripts/faz1_shots.mjs
// =====================================================================
import { createClient } from '@supabase/supabase-js'
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:5173'
const OUT = 'docs/assets/faz-1'
import { UI_TEST as TEST } from './lib/ui-test-user.mjs'
const PG = ['-h', process.env.PGHOST, '-p', process.env.PGPORT ?? '5432', '-U', process.env.PGUSER, '-d', 'postgres', '-tA']
const sql = (s) => execFileSync('psql', [...PG, '-c', s], { encoding: 'utf8', env: process.env })

mkdirSync(OUT, { recursive: true })

const clean = () => {
  sql(`delete from public.users where email = '${TEST.email}';`)
  sql(`delete from auth.users where email = '${TEST.email}';`)
}
clean()
// Geçici admin (tam auth.users + identity; app_metadata trigger'a görünmez → identity şart)
sql(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change)
 values('00000000-0000-0000-0000-000000000000','${TEST.id}','authenticated','authenticated','${TEST.email}',extensions.crypt('${TEST.password}',extensions.gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('full_name','Demo Yönetici','created_by_admin',true),'','','','');`)
sql(`insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at,last_sign_in_at) values(extensions.gen_random_uuid(),'${TEST.id}','${TEST.id}','email',jsonb_build_object('sub','${TEST.id}','email','${TEST.email}'),now(),now(),now());`)
sql(`update public.users set role_id=(select id from public.roles where key='admin'), must_change_password=false where email='${TEST.email}';`)

const supa = createClient(URL, ANON, { auth: { persistSession: false } })
const si = await supa.auth.signInWithPassword({ email: TEST.email, password: TEST.password })
console.log('login(api):', si.error ? si.error.message : 'ok')

// --- Yazma yolu duman-testi (gerçek oturum → RLS + ensureRows yolu) ---
// create → status_id vermeden (trigger varsayılanı) → update → soft delete.
const ins = await supa.from('leads').insert({ company_name: 'Duman Testi Tekstil A.Ş.', city: 'İzmir' }).select('id, status_id').single()
console.log('create:', ins.error ? ins.error.message : `ok id=${ins.data.id} status_id=${ins.data.status_id}(trigger)`)
if (ins.data) {
  const up = await supa.from('leads').update({ full_name: 'Ali Veli' }).eq('id', ins.data.id).select('id')
  console.log('update:', up.error ? up.error.message : `ok (${up.data.length} satır)`) // ensureRows: 1 satır
  const del = await supa.from('leads').update({ deleted_at: new Date().toISOString() }).eq('id', ins.data.id).select('id')
  console.log('soft-delete:', del.error ? del.error.message : `ok (${del.data.length} satır)`)
  // silinen artık aktif listede görünmemeli
  const gone = await supa.from('leads').select('id').eq('id', ins.data.id).is('deleted_at', null)
  console.log('listede-yok:', gone.error ? gone.error.message : (gone.data.length === 0 ? 'ok' : 'HATA görünüyor'))
  await supa.from('leads').delete().eq('id', ins.data.id) // test kaydını tamamen temizle
}

// --- Müşteri yazma yolu (kod trigger MUS + varsayılan durum + ensureRows) ---
const cins = await supa.from('customers').insert({ company_name: 'Müşteri Duman A.Ş.', city: 'İzmir', tax_number: '12 345 678 90' }).select('id, customer_code, status_id, tax_number_normalized').single()
console.log('c-create:', cins.error ? cins.error.message : `ok kod=${cins.data.customer_code} vergi=${cins.data.tax_number_normalized}`)
if (cins.data) {
  const cup = await supa.from('customers').update({ full_name: 'Veli Ali' }).eq('id', cins.data.id).select('id')
  console.log('c-update:', cup.error ? cup.error.message : `ok (${cup.data.length} satır)`)
  const cdel = await supa.from('customers').update({ deleted_at: new Date().toISOString() }).eq('id', cins.data.id).select('id')
  console.log('c-soft-delete:', cdel.error ? cdel.error.message : `ok (${cdel.data.length} satır)`)
  // Not: fiziksel silme RLS'te yok; test artığı (soft-deleted) psql ile temizlenir.
}

// P1.8 dönüşüm görselleri: tek seferlik lead → convert (RPC, oturum açıkken).
// RETURNING kullanma — psql komut etiketini de döndürür; marker + select ile al.
sql(`delete from public.leads where external_id='arch-demo-1' and converted_customer_id is null`)
sql(`insert into public.leads(company_name,city,source_id,external_source,external_id) values('Arşiv Demo Tekstil A.Ş.','Bursa',(select id from public.lead_sources where key='fuar'),'demo','arch-demo-1')`)
const archLead = sql(`select id from public.leads where external_id='arch-demo-1' order by id desc limit 1`).trim()
sql(`insert into public.interactions(entity_type,entity_id,channel_id,direction,summary,occurred_at) values
  ('lead',${archLead},(select id from public.interaction_channels where key='telefon'),'outbound','ARŞİV: İlk görüşme yapıldı.',now()-interval '4 days'),
  ('lead',${archLead},(select id from public.interaction_channels where key='eposta'),'inbound','ARŞİV: Teklif istedi.',now()-interval '2 days');`)
sql(`insert into public.notes(entity_type,entity_id,body) values('lead',${archLead},'ARŞİV: Pazarlık aşamasında.');`)
const conv = await supa.rpc('convert_lead_to_customer', {
  p_lead_id: Number(archLead),
  p_customer_type_id: Number(sql(`select id from public.customer_types where key='yurtici'`).trim()),
  p_tax_office: 'Bursa VD', p_tax_number: '9998887776',
})
const convCustId = conv.data
console.log('convert(rpc):', conv.error ? conv.error.message : `ok lead ${archLead} → customer ${convCustId}`)

await supa.auth.signOut()

// Demo etkileşimler (ilk aktif lead) — Etkileşimler/Zaman sekmesi görselleri için.
const demoLeadId = sql(`select id from public.leads where deleted_at is null order by id limit 1`).trim()
sql(`delete from public.interactions where entity_type='lead' and entity_id=${demoLeadId} and summary like 'DEMO:%';`)
sql(`insert into public.interactions (entity_type, entity_id, channel_id, direction, summary, occurred_at) values
  ('lead', ${demoLeadId}, (select id from public.interaction_channels where key='telefon'), 'outbound', 'DEMO: Fiyat listesi gönderildi (5 gün önceki görüşme, bugün kaydedildi).', now() - interval '5 days'),
  ('lead', ${demoLeadId}, (select id from public.interaction_channels where key='eposta'), 'inbound', 'DEMO: Numune talep etti, 3 renk.', now() - interval '1 day');`)
// durum değişikliği → lead.status_changed event (timeline zenginliği)
sql(`update public.leads set status_id=(select id from public.lead_statuses where key='ilgileniyor') where id=${demoLeadId} and status_id<>(select id from public.lead_statuses where key='ilgileniyor');`)
// demo not + etiket (note.added / tag.added event'leri + Notlar sekmesi görseli)
sql(`insert into public.notes(entity_type,entity_id,body) values('lead',${demoLeadId},'DEMO: Müşteri organik pamuk sertifikası istiyor. Fiyatlar hazırlanacak.');`)
sql(`insert into public.entity_tags(entity_type,entity_id,tag_id) select 'lead',${demoLeadId},id from public.tags where key='yuksek_potansiyel' on conflict do nothing;`)

const b = await chromium.launch()
const login = async (p) => {
  await p.goto(`${BASE}/giris`, { waitUntil: 'networkidle' })
  await p.getByLabel('E-posta').fill(TEST.email)
  await p.getByLabel('Şifre').fill(TEST.password)
  await p.getByRole('button', { name: 'Giriş yap' }).click()
  await p.waitForURL(`${BASE}/`, { timeout: 15000 })
}
const settle = (p) => p.waitForLoadState('networkidle').then(() => p.waitForTimeout(600))

// --- Masaüstü ---
const page = await b.newPage({ viewport: { width: 1360, height: 900 } })
await login(page)
await page.goto(`${BASE}/potansiyeller`, { waitUntil: 'networkidle' })
await settle(page)
await page.screenshot({ path: `${OUT}/leads-list-desktop.png` })
console.log('shot: leads-list-desktop')

// Arama: 'sik' (Türkçe/aksan duyarsız → Şık/Şıktaş firmaları)
await page.getByPlaceholder('Firma, kişi veya şehir ara…').fill('sik')
await settle(page)
await page.screenshot({ path: `${OUT}/leads-list-search.png` })
console.log('shot: leads-list-search')
await page.getByPlaceholder('Firma, kişi veya şehir ara…').fill('')
await settle(page)

// Toplu işlem çubuğu: ilk 3 satırı seç (checkbox), çubuğu yakala
const checks = page.locator('table tbody tr [role="checkbox"], table tbody tr input[type="checkbox"]')
for (let i = 0; i < 3; i++) await checks.nth(i).click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/leads-list-bulk.png` })
console.log('shot: leads-list-bulk')
// seçimi bırak
await page.getByRole('button', { name: 'Seçimi bırak' }).click().catch(() => {})

// Form dialog: "Potansiyel ekle"
await page.getByRole('button', { name: 'Potansiyel ekle' }).first().click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/leads-form.png` })
console.log('shot: leads-form')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// Kart sayfası: ilk satıra tıkla → /potansiyeller/:id
await page.locator('table tbody tr').first().click()
await page.waitForURL(/\/potansiyeller\/\d+/, { timeout: 10000 })
await settle(page)
await page.screenshot({ path: `${OUT}/leads-card.png` })
console.log('shot: leads-card')

// Demo lead kartı → Etkileşimler + Zaman Çizelgesi sekmeleri
await page.goto(`${BASE}/potansiyeller/${demoLeadId}`, { waitUntil: 'networkidle' })
await settle(page)
await page.getByRole('button', { name: 'Etkileşimler' }).click().catch(() => {})
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/lead-interactions.png` })
console.log('shot: lead-interactions')
await page.getByRole('button', { name: 'Notlar' }).click().catch(() => {})
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/lead-notes.png` })
console.log('shot: lead-notes')
await page.getByRole('button', { name: 'Zaman Çizelgesi' }).click().catch(() => {})
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/lead-timeline.png` })
console.log('shot: lead-timeline')

// P1.8: dönüşüm penceresi (demo lead, mutasyon yok — Vazgeç)
await page.getByRole('button', { name: 'Müşteriye dönüştür' }).click().catch(() => {})
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/lead-convert-dialog.png` })
console.log('shot: lead-convert-dialog')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// P1.8: dönüştürülmüş müşterinin zaman çizelgesi (taşınan geçmiş)
if (convCustId) {
  await page.goto(`${BASE}/musteriler/${convCustId}`, { waitUntil: 'networkidle' })
  await settle(page)
  await page.getByRole('button', { name: 'Zaman Çizelgesi' }).click().catch(() => {})
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/customer-timeline-converted.png` })
  console.log('shot: customer-timeline-converted')
}
// P1.8: arşivlenen lead (bant + müşteri linki)
await page.goto(`${BASE}/potansiyeller/${archLead}`, { waitUntil: 'networkidle' })
await settle(page)
await page.screenshot({ path: `${OUT}/lead-archived.png` })
console.log('shot: lead-archived')

// --- Müşteriler (aynı masaüstü oturumu) ---
await page.goto(`${BASE}/musteriler`, { waitUntil: 'networkidle' })
await settle(page)
await page.screenshot({ path: `${OUT}/customers-list-desktop.png` })
console.log('shot: customers-list-desktop')

await page.getByRole('button', { name: 'Müşteri ekle' }).first().click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/customers-form.png` })
console.log('shot: customers-form')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

await page.locator('table tbody tr').first().click()
await page.waitForURL(/\/musteriler\/\d+/, { timeout: 10000 })
await settle(page)
await page.screenshot({ path: `${OUT}/customers-card.png` })
console.log('shot: customers-card')

// Ayarlar > Sistem: kullanım dışı ayarlar toggle'ı açık
await page.goto(`${BASE}/ayarlar/sistem`, { waitUntil: 'networkidle' })
await settle(page)
await page.getByText(/Kullanım dışı ayarları göster/).click().catch(() => {})
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/settings-deprecated.png` })
console.log('shot: settings-deprecated')

// P1.9: global arama (topbar butonu → 'sik')
await page.goto(`${BASE}/potansiyeller`, { waitUntil: 'networkidle' })
await settle(page)
await page.getByRole('button', { name: /Ara/ }).click()
await page.waitForTimeout(300)
await page.getByPlaceholder(/Firma, kişi, telefon/).fill('sik')
await page.waitForTimeout(1000)
await page.screenshot({ path: `${OUT}/global-search.png` })
console.log('shot: global-search')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// P1.9: mükerrer uyarısı (müşteri formunda çok kayıtlı firma adı)
await page.goto(`${BASE}/musteriler`, { waitUntil: 'networkidle' })
await settle(page)
await page.getByRole('button', { name: 'Müşteri ekle' }).first().click()
await page.waitForTimeout(400)
await page.getByLabel('Firma adı').fill('Pamuk İplik Tekstil San. A.Ş.')
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/duplicate-warning.png` })
console.log('shot: duplicate-warning')
await page.keyboard.press('Escape')

// P1.10: içe aktarma (dosya → önizleme → içe aktar → sonuç → geri al)
await page.goto(`${BASE}/potansiyeller`, { waitUntil: 'networkidle' })
await settle(page)
await page.getByRole('button', { name: 'İçe aktar' }).click()
await page.waitForTimeout(400)
await page.setInputFiles('input[type=file]', '/tmp/sample-import.csv')
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/import-dialog.png` })
console.log('shot: import-dialog')
await page.getByRole('button', { name: /satırı içe aktar/ }).click().catch(() => {})
await page.waitForTimeout(1800)
await page.screenshot({ path: `${OUT}/import-result.png` })
console.log('shot: import-result')
await page.getByRole('button', { name: 'Partiyi geri al' }).click().catch(() => {})
await page.waitForTimeout(800)

// --- Mobil ---
const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true })
await login(m)
await m.goto(`${BASE}/potansiyeller`, { waitUntil: 'networkidle' })
await settle(m)
await m.screenshot({ path: `${OUT}/leads-list-mobile.png` })
console.log('shot: leads-list-mobile')
await m.goto(`${BASE}/musteriler`, { waitUntil: 'networkidle' })
await settle(m)
await m.screenshot({ path: `${OUT}/customers-list-mobile.png` })
console.log('shot: customers-list-mobile')

await b.close()
clean()
console.log('done')
