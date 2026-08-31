#!/usr/bin/env node
/**
 * M2 — Site → CRM talep boru hattı sağlık kontrolü.
 *
 * NE KONTROL EDER
 *   1. Son 24 saat / 7 gün içinde CRM'e kaç web talebi düştü
 *   2. Eşleşemeyen (ürüne bağlanmayan) talep kalemi var mı
 *   3. Sunucudaki crm_failed.log büyüdü mü (başarısız iletim)
 *   4. Studio'ya hâlâ gönderim yapılıyor mu (supabase_response.log büyüyor mu)
 *
 * KULLANIM
 *   node scripts/m2-intake-saglik.mjs            # CRM tarafı (Management API)
 *   node scripts/m2-intake-saglik.mjs --sunucu   # + FTP log kontrolü (.env.deploy gerekir)
 *
 * NEDEN GEREKLİ
 *   lead.php üç şey yapar: leads.jsonl'e yazar, e-posta atar, CRM'e iletir. İlk ikisi
 *   emniyet ağıdır ve CRM'den bağımsızdır — CRM iletimi sessizce bozulsa bile talep
 *   kaybolmaz ama CRM'e DÜŞMEZ. Bu script o sessiz bozulmayı görünür kılar.
 *   (18 Ağu'da tam bu oldu: bir DNS hatası tek talebi CRM'den düşürdü, leads.jsonl'den
 *    kurtarıldı — bkz. CHANGELOG v1.27.0.)
 */
import { execFileSync } from 'node:child_process'

const REF = process.env.SUPABASE_PROJECT_REF ?? 'kkxvoxeqfsaqzklrtgrw'

function token() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN
  const ham = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'], { encoding: 'utf8' }).trim()
  return ham.startsWith('go-keyring-base64:')
    ? Buffer.from(ham.slice('go-keyring-base64:'.length), 'base64').toString('utf8') : ham
}

async function sorgu(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!r.ok) { console.error('Management API hatası:', r.status, await r.text()); process.exit(1) }
  return r.json()
}

const [akis] = await sorgu(`
  select count(*) filter (where created_at > now() - interval '24 hours') son_24s,
         count(*) filter (where created_at > now() - interval '7 days')  son_7g,
         count(*)                                                        toplam,
         max(created_at)                                                 son_talep
    from public.operations where client_reference is not null`)

const [kalem] = await sorgu(`
  select count(*) toplam, count(catalog_product_id) baglanan,
         count(*) - count(catalog_product_id) bagsiz
    from public.operation_catalog_items`)

console.log('── CRM tarafı')
console.log(`   web talebi   : son 24s ${akis.son_24s} · son 7g ${akis.son_7g} · toplam ${akis.toplam}`)
console.log(`   son talep    : ${akis.son_talep}`)
console.log(`   ürün kalemi  : ${kalem.baglanan}/${kalem.toplam} bağlı, ${kalem.bagsiz} bağsız`)

const yas = (Date.now() - new Date(akis.son_talep + 'Z').getTime()) / 36e5
if (yas > 72) console.log(`   ⚠️  Son talep ${Math.round(yas)} saat önce — boru hattı sessiz olabilir, sunucu loglarına bak.`)
if (Number(kalem.bagsiz) > 5) console.log(`   ⚠️  ${kalem.bagsiz} kalem hiçbir ürüne bağlı değil — kod eşleştirmesini gözden geçir.`)

if (!process.argv.includes('--sunucu')) process.exit(0)

// ---- Sunucu logları (FTP) -------------------------------------------------
const { readFileSync, existsSync } = await import('node:fs')
const yol = new URL('../.env.deploy', import.meta.url).pathname
if (!existsSync(yol)) { console.error('\n.env.deploy yok — sunucu kontrolü atlandı.'); process.exit(0) }
const env = Object.fromEntries(readFileSync(yol, 'utf8').split('\n')
  .map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]))

const url = `ftp://${env.FTP_USER}:${env.FTP_PASS}@${env.FTP_HOST}`
const cikti = execFileSync('lftp', ['-e',
  'set ftp:ssl-allow no; cls -l /public_html/crm_response.log /public_html/crm_failed.log /leads_private/supabase_response.log; bye',
  url], { encoding: 'utf8' })

console.log('\n── Sunucu logları')
// lftp `cls -l` çıktısı: izinler sahip grup BOYUT ay gün saat /yol
for (const satir of cikti.trim().split('\n')) {
  const m = /^(\S+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(.+?)\s+(\/\S+)$/.exec(satir.trim())
  if (!m) { console.log('   ' + satir.trim()); continue }
  const [, , , , boyut, tarih, yol] = m
  const ad = yol.split('/').pop()
  const etiket = { 'crm_response.log': 'CRM iletimi (başarılı)', 'crm_failed.log': 'CRM iletimi (HATA)',
                   'supabase_response.log': 'Studio iletimi (KAPALI olmalı)' }[ad] ?? ad
  console.log(`   ${etiket.padEnd(32)} ${String(boyut).padStart(8)} byte   ${tarih}`)
}
console.log('\n   Not: Studio logu 31 Ağu 18:15 sonrası BÜYÜMEMELİ (çift gönderim kapatıldı).')
