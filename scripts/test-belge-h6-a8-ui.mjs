// H6 + A8 — ARAYÜZDEN: teklif "Olumlu — Beklemede" (sebep+tarih zorunlu, hatırlatma) ·
// belge silme (fiyat teklifi silinince operasyon "Teklif Bekliyor"a döner).
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:5173'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
import { UI_TEST as TEST } from './lib/ui-test-user.mjs'
const sql = (s) => execFileSync('psql', [PGURL, '-qtAc', s], { encoding: 'utf8' }).trim()
const ok = (l, c) => console.log(`  ${c ? '✓' : '✗ HATA'} ${l}`)

const cust = sql(`select id from public.customers where deleted_at is null limit 1`)
const cat = sql(`select id from public.product_categories where key='cat_erkek_ust' or parent_id is null order by (key='cat_erkek_ust') desc limit 1`)
const typ = sql(`select id from public.product_categories where parent_id=${cat} limit 1`)
const opId = sql(`insert into public.operations (customer_id, category_id, type_id, channel_id, created_by)
  values (${cust}, ${cat}, ${typ}, (select id from public.request_channels where key='web_sitesi'), '${TEST.id}') returning id`)
const stKey = () => sql(`select key from public.request_statuses where id=(select request_status_id from public.operations where id=${opId})`)
console.log('operasyon:', opId, '· başlangıç durumu:', stKey())

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1480, height: 950 }, acceptDownloads: true })
await page.goto(`${BASE}/giris`, { waitUntil: 'networkidle' })
await page.getByLabel('E-posta').fill(TEST.email); await page.getByLabel('Şifre').fill(TEST.password)
await page.getByRole('button', { name: 'Giriş yap' }).click(); await page.waitForURL(`${BASE}/`, { timeout: 15000 })

// 1) Fiyat teklifi üret → durum teklif_iletildi
await page.goto(`${BASE}/talepler/${opId}`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Teklif', exact: true }).click(); await page.waitForTimeout(400)
await page.getByRole('button', { name: /Fiyat teklifi hazırla/ }).click()
await page.waitForURL('**/belgeler/yeni/fiyat_teklifi**', { timeout: 8000 })
await page.getByText('Fiyat Teklifi hazırla').waitFor({ timeout: 8000 }); await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Üret ve indir' }).click()
await page.waitForURL(`${BASE}/belgeler`, { timeout: 15000 }); await page.waitForTimeout(800)
ok('Fiyat teklifi üretildi → durum teklif_iletildi', stKey() === 'teklif_iletildi')

// 2) H6 — Teklif sekmesi → "Olumlu — bekliyor" → sebep + tarih zorunlu
await page.goto(`${BASE}/talepler/${opId}`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Teklif', exact: true }).click(); await page.waitForTimeout(500)
await page.getByRole('button', { name: /Olumlu — bekliyor/ }).click()
await page.getByText('Ne zaman tekrar bakılacak').waitFor({ timeout: 5000 })
// Kaydet başta pasif (sebep+tarih boş)
ok('Sebep/tarih boşken Kaydet pasif', await page.getByRole('button', { name: 'Kaydet' }).isDisabled())
await page.getByPlaceholder('Örn. bütçe onayı bekleniyor').fill('Bütçe onayı bekleniyor')
// Tarih seç (bugünden ileri bir gün)
await page.getByRole('button', { name: /Tarih seç/ }).click().catch(() => {})
await page.waitForTimeout(300)
// takvimde bugünü/uygun bir günü seç
const dayBtn = page.getByRole('gridcell').filter({ hasText: /^15$/ }).first()
await dayBtn.click({ timeout: 3000 }).catch(async () => { await page.getByRole('button', { name: '20' }).first().click().catch(() => {}) })
await page.waitForTimeout(300)
await page.getByRole('button', { name: 'Kaydet' }).click()
await page.waitForTimeout(1500)
const followRow = sql(`select (s.key='olumlu_beklemede')::text||'|'||(q.follow_up_at is not null)::text||'|'||coalesce(q.follow_up_reason,'')
  from public.quotes q join public.quote_statuses s on s.id=q.status_id
  where q.operation_id=${opId} and q.deleted_at is null order by q.id desc limit 1`)
ok('Teklif "olumlu_beklemede" + follow_up tarih + sebep kaydedildi', followRow === 'true|true|Bütçe onayı bekleniyor')

// 3) A8 — Belgeler'de fiyat teklifini sil → operasyon "teklif_bekliyor"a döner
await page.goto(`${BASE}/belgeler`, { waitUntil: 'networkidle' }); await page.waitForTimeout(500)
page.on('dialog', (d) => d.accept()) // confirm penceresini onayla
// bu operasyona ait fiyat teklifi satırının Sil düğmesi
const delBtn = page.getByRole('button', { name: 'Sil' }).first()
await delBtn.click(); await page.waitForTimeout(1800)
const afterDel = sql(`select (select count(*) from public.documents d join public.document_types t on t.id=d.document_type_id where d.operation_id=${opId} and t.key='fiyat_teklifi' and d.deleted_at is null)||'|'||(select key from public.request_statuses where id=(select request_status_id from public.operations where id=${opId}))`)
ok('Fiyat teklifi belgesi silindi + operasyon "teklif_bekliyor"a döndü', afterDel === '0|teklif_bekliyor')

// temizlik
sql(`delete from public.documents where operation_id=${opId}; delete from public.quotes where operation_id=${opId}; delete from public.files where entity_type='operation' and entity_id='${opId}'; delete from public.event_log where entity_type='operation' and entity_id='${opId}'; delete from public.operations where id=${opId};`)
await b.close()
console.log('bitti.')
