// =====================================================================
// 1) TOPLA — dört kaynağı data/talep-geri-yukleme/ altına indirir (salt okuma)
//    node scripts/talep-geri-yukleme/topla.mjs [--dosyalar]
//    --dosyalar: leads_private/uploads/ altındaki görselleri de indirir (136 MB)
// =====================================================================
import { writeFileSync, existsSync, statSync } from 'node:fs'
import {
  CRM_REF, STUDIO_REF, BASLANGIC, veriKlasoru, sql, sbpToken, ftpIndir, ftpListe,
  legacyOturum, legacyTablo, jsonlOku,
} from './ortak.mjs'

const V = veriKlasoru()
const TOK = sbpToken()
const say = (ad, n) => console.log(`  ${ad.padEnd(28)} ${n}`)

// B — sunucu leads.jsonl (yerel sms/leads_private kopyası 3 günlük; kullanılmaz)
ftpIndir('leads_private/leads.jsonl', `${V}/leads.jsonl`)
const B = jsonlOku('leads.jsonl').filter((r) => r.ts >= BASLANGIC)
say('B leads.jsonl (1 Ağu+)', B.length)

// A — 16 Eyl 2026'da silinen CRM satırları (audit_log.old_values)
const A_ops = await sql(CRM_REF, `
  select old_values from audit_log
  where action='delete' and table_name='operations' and created_at::date='2026-09-16'
    and old_values->>'source'='web_sitesi' and (old_values->>'created_at')::date >= '${BASLANGIC}'`, TOK)
writeFileSync(`${V}/audit_ops.json`, JSON.stringify(A_ops.map((r) => r.old_values), null, 1))
say('A silinen web talepleri', A_ops.length)
const A_cust = await sql(CRM_REF, `
  select old_values from audit_log
  where action='delete' and table_name='customers' and created_at::date='2026-09-16'`, TOK)
writeFileSync(`${V}/audit_customers.json`, JSON.stringify(A_cust.map((r) => r.old_values), null, 1))
say('A silinen müşteriler', A_cust.length)

// C — Süreç Takip (durumlar)
const H = await legacyOturum()
const records = await legacyTablo(H, 'records', '*,customers(*)')
const history = await legacyTablo(H, 'record_history')
const profiles = await legacyTablo(H, 'profiles')
writeFileSync(`${V}/legacy_records.json`, JSON.stringify(records, null, 1))
writeFileSync(`${V}/legacy_history.json`, JSON.stringify(history, null, 1))
writeFileSync(`${V}/legacy_profiles.json`, JSON.stringify(profiles, null, 1))
say('C records (tümü)', records.length)
say('C record_history', history.length)

// D — Studio landing_leads (test kaynakları hariç) + quote_requests
const D = await sql(STUDIO_REF, `
  select full_name, phone, email, notes, source, created_at from landing_leads
  where created_at >= '${BASLANGIC}' and source in ('deneme-landing','yeni-lp','lp') order by created_at`, TOK)
writeFileSync(`${V}/studio_landing.json`, JSON.stringify(D, null, 1))
say('D Studio landing_leads', D.length)
const E = await sql(STUDIO_REF, `
  select quote_no, status, product_group_name, product_type_name, fabric_type_name, total_quantity,
         city, note, first_name, last_name, email, phone, brand_name, created_at
  from quote_requests where created_at >= '${BASLANGIC}' order by created_at`, TOK)
writeFileSync(`${V}/studio_quotes.json`, JSON.stringify(E, null, 1))
say('E Studio quote_requests', E.length)

// Görseller (isteğe bağlı) — yalnız B'de anılan dosyalar
if (process.argv.includes("--dosyalar")) { // ESKİ YOL: FTP ile yerel indirme; artık gerekmez (yaz.mjs sunucudan doğrudan yükler)
  const mevcut = new Set(ftpListe('leads_private/uploads'))
  let inen = 0, yok = 0
  for (const r of B) {
    if (!r.image) continue
    const hedef = `${V}/uploads/${r.image}`
    if (existsSync(hedef) && statSync(hedef).size > 0) continue
    if (!mevcut.has(r.image)) { yok++; continue }
    ftpIndir(`leads_private/uploads/${r.image}`, hedef)
    inen++
  }
  say('görsel indirildi', inen)
  say('görsel sunucuda yok', yok)
}

// Bütünlük damgası (dosya boyutları; tekrar toplanınca fark görülsün)
const damga = Object.fromEntries(
  ['leads.jsonl', 'audit_ops.json', 'legacy_records.json', 'studio_landing.json'].map((f) => [f, statSync(`${V}/${f}`).size]),
)
writeFileSync(`${V}/damga.json`, JSON.stringify({ zaman: new Date().toISOString(), boyutlar: damga }, null, 1))
console.log('\nBitti →', V)
