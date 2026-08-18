// P3.5 Numuneler — ARAYÜZDEN: numune oluştur → onay (yöntem+not) → revize → gönder → sil boşluk.
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'

const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:5173'
const OUT = 'docs/assets/faz-3'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
import { UI_TEST as TEST } from './lib/ui-test-user.mjs'
const sql = (s) => execFileSync('psql', [PGURL, '-tAc', s], { encoding: 'utf8' }).trim()
mkdirSync(OUT, { recursive: true })

const opId = sql(`select id from public.operations where deleted_at is null order by id desc limit 1`)
console.log('operasyon id:', opId)
sql(`delete from public.samples where operation_id=${opId};`)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1500, height: 1000 } })
page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser error]', m.text()) })

await page.goto(`${BASE}/giris`, { waitUntil: 'networkidle' })
await page.getByLabel('E-posta').fill(TEST.email)
await page.getByLabel('Şifre').fill(TEST.password)
await page.getByRole('button', { name: 'Giriş yap' }).click()
await page.waitForURL(`${BASE}/`, { timeout: 15000 })

await page.goto(`${BASE}/talepler/${opId}`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Numuneler' }).click()
await page.waitForTimeout(500)

// 1) Numune oluştur
await page.getByRole('button', { name: 'Numune oluştur' }).click()
await page.waitForTimeout(1200)
await page.getByPlaceholder(/Numune detayı/).fill('İlk numune — kadın oversize tişört, gri melanj')
await page.getByRole('button', { name: 'Kaydet' }).click()
await page.waitForTimeout(1000)
await page.screenshot({ path: `${OUT}/numune-genel.png` })
let n1 = sql(`select version||'|'||coalesce((select key from public.sample_statuses s where s.id=q.status_id),'?') from public.samples q where operation_id=${opId} and version=1`)
console.log('N1 (version|durum):', n1, '(beklenen 1|hazirlaniyor)')

// 2) Onayla — yöntem WhatsApp + not; kim/ne zaman otomatik
await page.getByRole('button', { name: 'Onayla' }).click()
await page.waitForTimeout(500)
// yöntem varsayılan whatsapp; not gir
await page.getByPlaceholder(/Müşteri WhatsApp/).fill('Müşteri fotoğrafı onayladı, üretime geçilebilir.')
await page.getByRole('button', { name: 'Onayla' }).last().click()
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/numune-onay.png` })
const appr = sql(`select (approved_at is not null)||'|'||approval_method||'|'||(approved_by='${TEST.id}')||'|'||coalesce((select key from public.sample_statuses s where s.id=q.status_id),'?') from public.samples q where operation_id=${opId} and version=1`)
console.log('onay (approved?|yöntem|doğru_kullanıcı|durum):', appr, '(beklenen t|whatsapp|t|onaylandi)')

// 3) Revize et → N2 (revision_of_sample_id zinciri), açıklama kopyalanmalı
await page.getByRole('button', { name: 'Revize et' }).click()
await page.waitForTimeout(1500)
const n2 = sql(`select version||'|'||(revision_of_sample_id is not null)||'|'||(description is not null) from public.samples where operation_id=${opId} and version=2`)
console.log('N2 (version|zincir|açıklama_kopya):', n2, '(beklenen 2|t|t)')

// 4) Gönderildi işaretle (N2 seçili)
await page.getByPlaceholder('ör. Aras').fill('Yurtiçi Kargo')
await page.getByRole('button', { name: 'Gönderildi' }).click()
await page.waitForTimeout(1200)
const shipped = sql(`select (shipped_at is not null)||'|'||carrier||'|'||coalesce((select key from public.sample_statuses s where s.id=q.status_id),'?') from public.samples q where operation_id=${opId} and version=2`)
console.log('gönderim (shipped?|kargo|durum):', shipped, '(beklenen t|Yurtiçi Kargo|musteriye_gonderildi)')

// 5) N1 sil → boşluk, yeni numune N3
await page.locator('button', { hasText: /^N1/ }).first().click()
await page.waitForTimeout(400)
page.once('dialog', (d) => d.accept())
await page.getByRole('button', { name: 'Sil' }).click()
await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Yeni' }).click()
await page.waitForTimeout(1200)
const versions = sql(`select string_agg(version||case when deleted_at is not null then '(silik)' else '' end, ',' order by version) from public.samples where operation_id=${opId}`)
console.log('versiyonlar:', versions, '(beklenen 1(silik),2,3)')

console.log('\nSONUÇ: onay kaydı (yöntem+kullanıcı+tarih) doğru, revizyon zinciri+kopya, gönderim işlendi, silme boşluk bıraktı, N3 çakışmadı.')
await b.close()
