// =====================================================================
// LEADS → MÜŞTERİ İLETİŞİM TAMAMLAMA · KURU KOŞU (yalnız OKUMA).
// data/leads.csv kayıtlarını customers ile eşleştirir; SADECE BOŞ olan
// e-posta / şehir / telefon alanları için ne yazılacağını raporlar.
// HİÇBİR ŞEY YAZMAZ.  Çalıştır:  node scripts/leads-iletisim-kuru-kosu.mjs
// =====================================================================
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const CSV = 'data/leads.csv'
const PASS = process.env.PGPASSWORD ||
  readFileSync('.env','utf8').split('\n').find(l=>l.startsWith('SUPABASE_DB_PASSWORD='))?.split('=').slice(1).join('=').trim()
const ENV = { ...process.env, PGHOST:'aws-0-eu-west-1.pooler.supabase.com', PGPORT:'5432',
  PGUSER:'postgres.kkxvoxeqfsaqzklrtgrw', PGDATABASE:'postgres', PGPASSWORD:PASS }
const psql = (sql) => execFileSync('psql',['-tA','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',env:ENV})

// --- Türkçe ASCII-katlama (import-musteriler.mjs aynası) --------------
const FOLD = { 'İ':'i','I':'i','ı':'i','i':'i','Ş':'s','ş':'s','Ğ':'g','ğ':'g','Ü':'u','ü':'u','Ö':'o','ö':'o','Ç':'c','ç':'c' }
function normalizeTr(input){
  if (input==null) return null
  let s = String(input).replace(/ß/g,'ss').replace(/[İIıiŞşĞğÜüÖöÇç]/g, ch=>FOLD[ch]??ch).toLowerCase()
  s = s.replace(/[^a-z0-9]+/g,' ').trim()
  return s || null
}
// Telefonun son 10 hanesi (eşleştirme anahtarı). Baştaki ' ve +90/0 fark etmez.
const last10 = (raw) => { const d=String(raw??'').replace(/\D/g,''); return d.length>=10 ? d.slice(-10) : (d||null) }
const trimOrNull = s => { const t=(s??'').trim(); return t===''?null:t }

// --- Onaylı düzeltmeler (kullanıcı) ----------------------------------
const CORRECTIONS = new Map([
  ['altuga664@gmail.cım', 'altuga664@gmail.com'],   // .cım → .com (açık typo, onaylı)
  ['urashometr@gmail.con', 'urashometr@gmail.com'], // .con → .com (açık typo, onaylı)
])
const applyCorrection = e => e==null ? null : (CORRECTIONS.get(e.trim()) ?? e.trim())

// --- E-posta geçerlilik / typo taraması ------------------------------
// Yaygın sağlayıcılarda alan adı sabittir; sapma = şüpheli.
const PROVIDER_OK = { gmail:['com'], icloud:['com'], hotmail:['com','com.tr'],
  outlook:['com','com.tr'], yahoo:['com','com.tr'] }
const OK_TLD = new Set(['com','net','org','co','io','tr','biz','info','app','dev','store','online','shop','xyz','me'])
function validateEmail(raw){
  const s = String(raw??'').trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return 'biçim geçersiz'
  const [, domain] = s.split('@')
  if (/[^\x00-\x7f]/.test(domain)) return 'alan adında ASCII-dışı karakter'
  if (/\.\./.test(domain) || domain.startsWith('.') || domain.endsWith('.')) return 'alan adı nokta hatası'
  const labels = domain.toLowerCase().split('.')
  const tld = labels[labels.length-1]
  if (!/^[a-z]{2,}$/.test(tld)) return `geçersiz TLD ".${tld}"`
  // Yaygın sağlayıcı typo'su (gmail.co, gmail.con, hotmail.comm …)
  for (const [prov, oks] of Object.entries(PROVIDER_OK)){
    const idx = labels.indexOf(prov)
    if (idx !== -1){
      const rest = labels.slice(idx+1).join('.')
      if (!oks.includes(rest)) return `sağlayıcı alan adı şüpheli (${prov}.${rest})`
      return null  // bilinen sağlayıcı, doğru son ek
    }
  }
  // Özel alan adı: TLD makul mü?
  if (!OK_TLD.has(tld)) return `sıra dışı TLD ".${tld}"`
  return null
}

// --- CSV ayrıştırıcı (import-musteriler.mjs aynası) -------------------
function parseCSV(text){
  const rows=[]; let i=0, field='', row=[], inq=false
  while(i<text.length){ const c=text[i]
    if(inq){ if(c==='"'){ if(text[i+1]==='"'){field+='"';i+=2;continue} inq=false;i++;continue } field+=c;i++;continue }
    if(c==='"'){inq=true;i++;continue}
    if(c===','){row.push(field);field='';i++;continue}
    if(c==='\r'){i++;continue}
    if(c==='\n'){row.push(field);rows.push(row);row=[];field='';i++;continue}
    field+=c;i++
  }
  if(field.length||row.length){row.push(field);rows.push(row)}
  return rows
}

// --- Müşterileri iletişim bilgileriyle çek ---------------------------
const CUST_SQL = `select coalesce(json_agg(t order by t.id),'[]') from (
  select c.id, c.full_name, c.company_name, c.city,
    (select array_agg(cp.value_normalized) from contact_points cp
       where cp.entity_type='customer' and cp.entity_id=c.id and cp.type='phone') as phones,
    (select array_agg(cp.value) from contact_points cp
       where cp.entity_type='customer' and cp.entity_id=c.id and cp.type='email') as emails
  from customers c where c.deleted_at is null
) t;`
const customers = JSON.parse(psql(CUST_SQL).trim() || '[]')

// Eşleştirme indeksleri
const byPhone = new Map()   // last10 -> [customer]
const byName  = new Map()   // normalizeTr(full_name) -> [customer]
for (const c of customers){
  c.phoneKeys = (c.phones||[]).map(last10).filter(Boolean)
  for (const k of c.phoneKeys){ if(!byPhone.has(k)) byPhone.set(k,[]); byPhone.get(k).push(c) }
  const nk = normalizeTr(c.full_name)
  if (nk){ if(!byName.has(nk)) byName.set(nk,[]); byName.get(nk).push(c) }
}

// --- Leads oku -------------------------------------------------------
const all = parseCSV(readFileSync(CSV,'utf8').replace(/^﻿/,'')).filter(r=>r.length>1 && r.some(c=>c.trim()!==''))
const header = all[0]
const col = n => header.indexOf(n)
const C = { zaman:col('Zaman'), ad:col('Ad'), sehir:col('Sehir'), tel:col('Telefon'), email:col('E-posta') }
const leads = all.slice(1).map(r => ({
  zaman: trimOrNull(r[C.zaman]),
  ad:    trimOrNull(r[C.ad]),
  sehir: trimOrNull(r[C.sehir]),
  tel:   trimOrNull(r[C.tel]),
  email: trimOrNull(r[C.email]),
  telKey: last10(r[C.tel]),
  nameKey: normalizeTr(r[C.ad]),
}))

// --- Eşleştir: önce telefon, sonra isim ------------------------------
// Her müşteri için eşleşen leadlerden EN YENİSİ (zaman) alınır.
const matchByCust = new Map()  // custId -> { cust, lead, via, allLeads:[] }
const unmatched = []
for (const L of leads){
  let cust=null, via=null
  if (L.telKey && L.telKey.length===10 && byPhone.has(L.telKey)){
    const cands = byPhone.get(L.telKey); cust = cands[0]; via='phone'  // telefon benzersiz varsayımı
  } else if (L.nameKey && byName.has(L.nameKey)){
    const cands = byName.get(L.nameKey)
    if (cands.length===1){ cust = cands[0]; via='name' }
    else { L._ambiguous = cands.map(c=>c.id); unmatched.push({L, neden:`isim çok müşteriye uyuyor (#${cands.map(c=>c.id).join(', #')})`}); continue }
  }
  if (!cust){ unmatched.push({L, neden:'eşleşme yok'}); continue }
  if (!matchByCust.has(cust.id)) matchByCust.set(cust.id, { cust, lead:L, via, allLeads:[L] })
  else {
    const m = matchByCust.get(cust.id); m.allLeads.push(L)
    if ((L.zaman||'') > (m.lead.zaman||'')){ m.lead=L; m.via=via }  // ISO zaman → sözlüksel karşılaştırma
  }
}

// --- Ne yazılır / çelişkiler -----------------------------------------
const fillEmail=[], fillCity=[], fillPhone=[], conflicts=[]
let matchPhone=0, matchName=0
for (const {cust, lead, via, allLeads} of matchByCust.values()){
  via==='phone' ? matchPhone++ : matchName++
  const hasEmail = (cust.emails||[]).length>0
  const hasPhone = (cust.phoneKeys||[]).length>0
  const hasCity  = !!trimOrNull(cust.city)

  // Çelişki: aynı müşteriye eşleşen leadlerde farklı e-posta / şehir
  const emailSet = new Set(allLeads.map(l=>l.email && l.email.toLowerCase()).filter(Boolean))
  const citySet  = new Set(allLeads.map(l=>normalizeTr(l.sehir)).filter(Boolean))
  if (emailSet.size>1) conflicts.push({cust, alan:'e-posta', degerler:[...new Set(allLeads.map(l=>l.email).filter(Boolean))]})
  if (citySet.size>1)  conflicts.push({cust, alan:'şehir',   degerler:[...new Set(allLeads.map(l=>l.sehir).filter(Boolean))]})

  const custName = cust.company_name || cust.full_name || '—'
  // E-posta: yalnız boşsa (onaylı düzeltme uygulanır + geçerlilik taranır)
  if (!hasEmail && lead.email && emailSet.size<=1){
    const val = applyCorrection(lead.email)
    fillEmail.push({id:cust.id, name:custName, via, val, raw:lead.email,
      corrected: val!==lead.email, sorun: validateEmail(val)})
  }
  // Şehir: yalnız boşsa
  if (!hasCity && lead.sehir && citySet.size<=1) fillCity.push({id:cust.id, name:custName, via, val:lead.sehir})
  // Telefon: yalnız telefonu OLMAYAN (isimle eşleşen) müşteriye
  if (!hasPhone && lead.tel) fillPhone.push({id:cust.id, name:custName, via, val:lead.tel, key:lead.telKey})
}

// --- SQL ÜRET (--emit): guard'lı, tek BEGIN…COMMIT -------------------
if (process.argv.includes('--emit')){
  const OWNER = '5261d58d-52f5-4859-ba26-bcb0ace8f743'  // berkan@ (created_by)
  const sq = s => "'"+String(s).replace(/'/g,"''")+"'"  // literal kaçış
  const suspectStill = fillEmail.filter(x=>x.sorun)     // düzeltme sonrası hâlâ şüpheli
  if (suspectStill.length){
    console.error('DUR: hâlâ şüpheli e-posta var, emit iptal:', suspectStill.map(x=>x.val))
    process.exit(1)
  }
  const emailVals = fillEmail.map(x=>`(${x.id}, ${sq(x.val)})`)
  const phoneVals = fillPhone.map(x=>`(${x.id}, ${sq(x.val)})`)
  const cityVals  = fillCity.map(x=>`(${x.id}, ${sq(x.val)})`)
  const L = []
  L.push('-- Leads → müşteri iletişim tamamlama · TEK BEGIN…COMMIT · guard: yalnız BOŞ alan')
  L.push('begin;')
  L.push('')
  L.push(`-- 1) E-POSTA: ${emailVals.length} müşteri (yalnız e-postası OLMAYAN — mevcut 10 korunur)`)
  L.push(`insert into public.contact_points (entity_type, entity_id, type, value, is_primary, created_by)`)
  L.push(`select 'customer', v.id, 'email', v.val, true, '${OWNER}'::uuid`)
  L.push(`from (values\n  ${emailVals.join(',\n  ')}\n) as v(id, val)`)
  L.push(`where not exists (select 1 from public.contact_points cp`)
  L.push(`  where cp.entity_type='customer' and cp.entity_id=v.id and cp.type='email');`)
  L.push('')
  L.push(`-- 2) TELEFON: ${phoneVals.length} müşteri (yalnız telefonu OLMAYAN)`)
  L.push(`insert into public.contact_points (entity_type, entity_id, type, value, is_primary, created_by)`)
  L.push(`select 'customer', v.id, 'phone', v.val, true, '${OWNER}'::uuid`)
  L.push(`from (values\n  ${phoneVals.join(',\n  ')}\n) as v(id, val)`)
  L.push(`where not exists (select 1 from public.contact_points cp`)
  L.push(`  where cp.entity_type='customer' and cp.entity_id=v.id and cp.type='phone');`)
  L.push('')
  L.push(`-- 3) ŞEHİR: ${cityVals.length} müşteri (yalnız city IS NULL — mevcut 10 + çelişkili 3 korunur)`)
  L.push(`update public.customers c set city = v.val`)
  L.push(`from (values\n  ${cityVals.join(',\n  ')}\n) as v(id, val)`)
  L.push(`where c.id = v.id and c.city is null;`)
  L.push('')
  L.push('commit;')
  const { writeFileSync } = await import('node:fs')
  writeFileSync('scripts/.leads-iletisim.generated.sql', L.join('\n')+'\n')
  console.log(`SQL yazıldı → scripts/.leads-iletisim.generated.sql  (e-posta ${emailVals.length} · telefon ${phoneVals.length} · şehir ${cityVals.length})`)
  process.exit(0)
}

// --- RAPOR -----------------------------------------------------------
const p = (...a)=>console.log(...a)
p('\n════════ LEADS → İLETİŞİM TAMAMLAMA · KURU KOŞU (yazma YOK) ════════\n')
p(`CSV lead sayısı: ${leads.length}   ·   Müşteri sayısı: ${customers.length}`)
p(`Eşleşen müşteri: ${matchByCust.size}   (telefonla ${matchPhone} · isimle ${matchName})`)
p(`Eşleşmeyen lead: ${unmatched.length}\n`)

// E-posta geçerlilik özeti
const emailSuspect = fillEmail.filter(x=>x.sorun)
const emailFixed   = fillEmail.filter(x=>x.corrected)
p('── E-POSTA GEÇERLİLİK TARAMASI ────────────────────────────────────')
p(`  Yazılacak e-posta: ${fillEmail.length}  ·  Onaylı düzeltilen: ${emailFixed.length}  ·  ŞÜPHELİ: ${emailSuspect.length}`)
for (const x of emailFixed)   p(`  ✔ düzeltildi  #${x.id} ${x.name}: ${x.raw}  →  ${x.val}`)
for (const x of emailSuspect) p(`  ⚠ ŞÜPHELİ     #${x.id} ${x.name}: ${x.val}   [${x.sorun}]`)
p('')

p('── DOLDURULACAK ALANLAR (sadece boş olanlar) ──────────────────────')
p(`  E-posta : ${fillEmail.length}   Şehir : ${fillCity.length}   Telefon : ${fillPhone.length}\n`)

const dump = (title, arr, extra=()=>'') => {
  p(`── ${title} (${arr.length}) ${'─'.repeat(Math.max(0,44-title.length))}`)
  if (!arr.length){ p('  (yok)'); return }
  for (const x of arr) p(`  #${x.id} ${x.name}  [${x.via}]  →  ${x.val}${extra(x)}`)
  p('')
}
dump('E-POSTA yazılacak', fillEmail)
dump('ŞEHİR yazılacak', fillCity)
dump('TELEFON yazılacak (telefonsuz müşteri)', fillPhone, x=>`  (son10=${x.key})`)

p(`── ÇELİŞKİLER — DOKUNULMAYACAK (${conflicts.length}) ─────────────────────`)
if (!conflicts.length) p('  (yok)')
for (const c of conflicts) p(`  #${c.cust.id} ${c.cust.company_name||c.cust.full_name}  ${c.alan}: ${c.degerler.join('  ≠  ')}`)
p('')

p(`── EŞLEŞMEYEN LEADLER (${unmatched.length}) — ayrı iş, dokunulmuyor ──────`)
const nedenSay = {}
for (const u of unmatched) nedenSay[u.neden.split('(')[0].trim()] = (nedenSay[u.neden.split('(')[0].trim()]||0)+1
for (const [n,s] of Object.entries(nedenSay)) p(`  ${s.toString().padStart(3)} × ${n}`)
p('\n════════ KURU KOŞU BİTTİ · hiçbir şey yazılmadı ════════\n')
