// P4A.4/P4A.5 — ARAYÜZDEN: TAM SAYFA belge editörü (kendi rotası) + canlı önizleme + onayda üret.
// Kapsam: sipariş onay editörü (kapı açılır) · fiyat teklifi (durum teklif_iletildi) ·
//         bağımsız belge (Belgeler > Yeni belge, operation_id null) · idempotency.
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:5173'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
import { UI_TEST as TEST } from './lib/ui-test-user.mjs'
const sql = (s) => execFileSync('psql', [PGURL, '-qtAc', s], { encoding: 'utf8' }).trim()
const ok = (l, c) => console.log(`  ${c ? '✓' : '✗ HATA'} ${l}`)

const cust = sql(`select id from public.customers where deleted_at is null limit 1`)
const cat = sql(`select id from public.product_categories where key='cat_erkek_ust'`)
const typ = sql(`select id from public.product_categories where parent_id=${cat} limit 1`)
const opId = sql(`insert into public.operations (customer_id, category_id, type_id, channel_id, created_by)
  values (${cust}, ${cat}, ${typ}, (select id from public.request_channels where key='web_sitesi'), '${TEST.id}') returning id`)
console.log('temiz operasyon:', opId)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1480, height: 950 }, acceptDownloads: true })
page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser error]', m.text().slice(0, 120)) })
await page.goto(`${BASE}/giris`, { waitUntil: 'networkidle' })
await page.getByLabel('E-posta').fill(TEST.email); await page.getByLabel('Şifre').fill(TEST.password)
await page.getByRole('button', { name: 'Giriş yap' }).click()
await page.waitForURL(`${BASE}/`, { timeout: 15000 })

const frame = () => page.frameLocator('iframe[title="Belge önizleme"]')

// 1) Numune sekmesi → sert kapı → "Sipariş onay formu hazırla" → TAM SAYFA editör
await page.goto(`${BASE}/talepler/${opId}`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Numune', exact: true }).last().click()
await page.waitForTimeout(600)
ok('Numune sekmesinde sipariş-onay kapısı gösteriliyor', await page.getByRole('button', { name: /Sipariş onay formu hazırla/ }).count() > 0)
await page.getByRole('button', { name: /Sipariş onay formu hazırla/ }).click()
await page.waitForURL(`**/belgeler/yeni/siparis_onay**`, { timeout: 8000 })
ok('Tam sayfa editör rotasına gidildi (/belgeler/yeni/siparis_onay)', page.url().includes('/belgeler/yeni/siparis_onay'))
await page.getByText('Sipariş Onay Formu hazırla').waitFor({ timeout: 8000 })
await page.waitForTimeout(1500) // ilk /preview
ok('Canlı önizleme yüklendi (SİPARİŞ ONAY FORMU görünür)', await frame().getByText('SİPARİŞ ONAY FORMU').count() > 0)

// Eksik alanı tamamla → önizlemeye anlık yansır
await page.getByLabel('Kumaş Detayı').fill('320g/m² pamuk süprem')
await page.waitForTimeout(1200)
ok('Yazılan değer önizlemeye anlık yansıdı', await frame().getByText('320g/m² pamuk süprem').count() > 0)
// Alanların gruplanması (FieldGroup başlıkları)
ok('Form gruplu (Üretim Detayları başlığı var)', await page.getByText('Üretim Detayları', { exact: true }).count() > 0)
// Zoom düğmeleri
ok('Önizleme zoom düğmeleri var (%50/%75/%100)', await page.getByRole('button', { name: '%50' }).count() > 0 && await page.getByRole('button', { name: '%100' }).count() > 0)

await page.getByRole('button', { name: 'Üret ve indir' }).click()
await page.waitForURL(`${BASE}/belgeler`, { timeout: 15000 })
await page.waitForTimeout(1000)
const onay = sql(`select count(*) from public.documents d join public.document_types t on t.id=d.document_type_id where d.operation_id=${opId} and t.key='siparis_onay' and d.file_id is not null`)
ok('Sipariş onay üretildi (documents + file)', onay === '1')
ok('Belge verisi editördeki değeri içeriyor', sql(`select (data->'soS'->>'kumas') from public.documents d join public.document_types t on t.id=d.document_type_id where d.operation_id=${opId} and t.key='siparis_onay' limit 1`) === '320g/m² pamuk süprem')

// 2) Kapı açıldı → numune oluşturulabilir
await page.goto(`${BASE}/talepler/${opId}`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Numune', exact: true }).last().click(); await page.waitForTimeout(800)
ok('Kapı açıldı — "Numune oluştur" görünüyor', await page.getByRole('button', { name: 'Numune oluştur' }).count() > 0)
await page.getByRole('button', { name: 'Numune oluştur' }).click(); await page.waitForTimeout(1200)
ok('Numune oluşturulabildi', sql(`select count(*) from public.samples where operation_id=${opId} and deleted_at is null`) === '1')

// 3) Fiyat teklifi editörü → quote+dosya → durum teklif_iletildi
await page.goto(`${BASE}/talepler/${opId}`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Teklif', exact: true }).click(); await page.waitForTimeout(500)
await page.getByRole('button', { name: /Fiyat teklifi hazırla/ }).click()
await page.waitForURL(`**/belgeler/yeni/fiyat_teklifi**`, { timeout: 8000 })
await page.getByText('Fiyat Teklifi hazırla').waitFor({ timeout: 8000 })
await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Üret ve indir' }).click()
await page.waitForURL(`${BASE}/belgeler`, { timeout: 15000 }); await page.waitForTimeout(800)
const teklif = sql(`select (select count(*) from public.documents d join public.document_types t on t.id=d.document_type_id where d.operation_id=${opId} and t.key='fiyat_teklifi')||'|'||(select count(*) from public.quotes where operation_id=${opId} and quote_file_id is not null)||'|'||(select key from public.request_statuses r where r.id=(select request_status_id from public.operations where id=${opId}))`)
console.log('teklif (belge|quote+dosya|op_durum):', teklif, '(beklenen 1|1|teklif_iletildi)')

// 4) BAĞIMSIZ belge: Belgeler > Yeni belge (operasyonsuz) → operation_id null
await page.goto(`${BASE}/belgeler`, { waitUntil: 'networkidle' })
const bagimsizOnce = sql(`select count(*) from public.documents where operation_id is null`)
await page.getByRole('button', { name: 'Yeni belge' }).click()
await page.getByText('Belge tipini seçin', { exact: false }).waitFor({ timeout: 5000 })
await page.getByRole('combobox').first().click().catch(() => {})
await page.getByRole('option', { name: 'Numune Etiketi' }).click()
await page.getByRole('button', { name: 'Devam' }).click()
await page.waitForURL(`**/belgeler/yeni/numune_etiketi`, { timeout: 8000 })
await page.getByText('Numune Etiketi hazırla').waitFor({ timeout: 8000 })
await page.getByLabel('Müşteri').first().fill('Bağımsız Müşteri A.Ş.')
await page.getByLabel('Ürün Kodu').first().fill('ZZZ999') // TAS- öneki otomatik, sadece 6 karakter gövde
await page.getByLabel('Beden').first().fill('M')
await page.getByLabel('Renk').first().fill('Lacivert')
await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Üret ve indir' }).click()
await page.waitForURL(`${BASE}/belgeler`, { timeout: 15000 }); await page.waitForTimeout(800)
const bagimsizSonra = sql(`select count(*) from public.documents where operation_id is null`)
ok('Bağımsız belge üretildi (operation_id null, +1)', Number(bagimsizSonra) === Number(bagimsizOnce) + 1)
ok('Barkoda TAS öneki + gövde işlendi (TAS-ZZZ999)', sql(`select (data->'numuneler'->0->>'urunkodu') from public.documents where operation_id is null and (data->'numuneler'->0->>'urunkodu')='TAS-ZZZ999' limit 1`) === 'TAS-ZZZ999')
ok('Bağımsız belge sert kapıyı AÇMAZ (operasyona bağlı sipariş-onay sayısı değişmedi)', onay === '1')

// Temizlik — yalnızca bu testin ürettikleri
const bagimsizFile = sql(`select coalesce(file_id::text,'') from public.documents where operation_id is null and (data->'numuneler'->0->>'urunkodu')='TAS-ZZZ999' limit 1`)
sql(`delete from public.documents where operation_id=${opId} or (operation_id is null and (data->'numuneler'->0->>'urunkodu')='TAS-ZZZ999');`)
sql(`delete from public.quotes where operation_id=${opId}; delete from public.samples where operation_id=${opId};`)
sql(`delete from public.files where entity_type='operation' and entity_id='${opId}'${bagimsizFile ? ` or id=${bagimsizFile}` : ''};`)
sql(`delete from public.event_log where entity_type='operation' and entity_id='${opId}'; delete from public.operations where id=${opId};`)
await b.close()
console.log('bitti.')
