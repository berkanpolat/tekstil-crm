// =====================================================================
// TEK-SEFERLİK GERÇEK MÜŞTERİ İÇE AKTARMA — data/musteriler.csv (90 kayıt)
// ---------------------------------------------------------------------
// ÜRETİM MODU: Varsayılan KURU KOŞU. Hiçbir şey yazmaz, yalnız önizler.
//   Gerçek yazma için AÇIK bayrak gerekir:  node scripts/import-musteriler.mjs --write
//
// Kurallar (kullanıcı onaylı):
//  * Firma "-"/boş → NULL. Durum: "Altif"→Aktif, boş→Aktif(default).
//  * Şehir/İlçe boş kalır (uydurulmaz).
//  * Ülke "Dubai" → country="Birleşik Arap Emirlikleri", city="Dubai".
//  * Tür: Yurtiçi→yurtici, Yurtdışı→ihracat. (Türkçe İ/ı için normalizeTr:
//    ASCII'ye katla SONRA lower — upper()/toLowerCase() KULLANILMAZ.)
//  * created_at: gg.aa.yyyy → timestamptz (+03). 8 boş → bugün (TODAY).
//  * Telefon: TR normalize; 6 ULUSLARARASI (ülke≠Türkiye) numaraya '+' eklenip
//    E.164 verilir (trigger'ın deterministik + dalı). 3 boş → boş.
//  * Ezgi Çelik "0312 666 7 666 (2683)" → tel 03126667666, dahili 2683 → iç not.
//  * MÜKERRER: engelleme YOK; hepsi girer + iç not ile işaretlenir
//    (dosya-içi aynı telefon / aynı e-posta).
//  * MUS kodu: customers_before_insert trigger'ı otomatik üretir.
//  * created_at AÇIKÇA yazılır (trigger ezmiyor — doğrulandı).
//
// Yazma atomiktir: tüm satırlar tek BEGIN..COMMIT içinde psql ile uygulanır.
// =====================================================================
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const WRITE = process.argv.includes('--write')
const CSV = 'data/musteriler.csv'
const OWNER = '5261d58d-52f5-4859-ba26-bcb0ace8f743' // berkan@ (created_by)
const TODAY = '2026-07-30'                            // boş created_at → bugün
const SQL_OUT = 'scripts/.import-musteriler.generated.sql'

// --- DB bağlantısı (referans okuma + yazma) ---------------------------
const PASS = process.env.PGPASSWORD ||
  readFileSync('.env','utf8').split('\n').find(l=>l.startsWith('SUPABASE_DB_PASSWORD='))?.split('=').slice(1).join('=').trim()
const ENV = { ...process.env, PGHOST:'aws-0-eu-west-1.pooler.supabase.com', PGPORT:'5432',
  PGUSER:'postgres.kkxvoxeqfsaqzklrtgrw', PGDATABASE:'postgres', PGPASSWORD:PASS }
const psql = (args, input) => execFileSync('psql', args, { encoding:'utf8', env:ENV, input })

// --- Türkçe/Avrupa ASCII-katlama (normalizeTr aynası) -----------------
const FOLD = { 'İ':'i','I':'i','ı':'i','i':'i','Ş':'s','ş':'s','Ğ':'g','ğ':'g','Ü':'u','ü':'u','Ö':'o','ö':'o','Ç':'c','ç':'c' }
function normalizeTr(input){
  if (input==null) return null
  let s = String(input).replace(/ß/g,'ss').replace(/[İIıiŞşĞğÜüÖöÇç]/g, ch=>FOLD[ch]??ch).toLowerCase()
  s = s.replace(/[^a-z0-9]+/g,' ').trim()
  return s || null
}

// --- Telefon → E.164 (normalize_contact_value aynası + intl '+') ------
function toE164(raw, intl){
  if (raw==null) return null
  const s = String(raw).trim()
  if (s==='') return null
  const digits = s.replace(/\D/g,'')
  if (digits==='') return null
  if (s.startsWith('+')) return '+'+digits
  if (intl) return '+'+digits                                   // uluslararası: + ekle
  if (digits.startsWith('00')) return '+'+digits.slice(2)
  if (digits.length===12 && digits.startsWith('90')) return '+'+digits
  if (digits.length===11 && digits.startsWith('0'))  return '+90'+digits.slice(1)
  if (digits.length===10) return '+90'+digits
  if (digits.length>=8 && digits.length<=15) return '+'+digits
  return null
}

// --- Minimal RFC4180 CSV ayrıştırıcı ----------------------------------
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
const esc = s => s==null ? 'null' : "'"+String(s).replace(/'/g,"''")+"'"
const trimOrNull = s => { const t=(s??'').trim(); return t===''?null:t }

// --- Referans id'leri canlı çek ---------------------------------------
const statusRows = psql(['-tA','-F','|','-c','select id,key,label from customer_statuses'])
  .trim().split('\n').map(l=>l.split('|'))
const typeRows = psql(['-tA','-F','|','-c','select id,key,label from customer_types'])
  .trim().split('\n').map(l=>l.split('|'))
const statusByKey = new Map(), typeByKey = new Map()
for (const [id,key,label] of statusRows){ statusByKey.set(key, +id); statusByKey.set(normalizeTr(label), +id) }
for (const [id,key,label] of typeRows){ typeByKey.set(key, +id); typeByKey.set(normalizeTr(label), +id) }

function statusId(durum){
  const n = normalizeTr(durum)
  if (n==null || n==='altif' || n==='aktif') return statusByKey.get('aktif')  // boş + "Altif" typo → Aktif
  return statusByKey.get(n) ?? statusByKey.get('aktif')
}
function typeId(tur){
  const n = normalizeTr(tur)
  if (n==='yurtici') return typeByKey.get('yurtici')
  if (n==='yurtdisi') return typeByKey.get('ihracat')          // Yurtdışı → İhracat(2)
  return typeByKey.get(n) ?? null
}
function parseDate(s){
  const t=(s??'').trim()
  if (t==='') return `${TODAY}T00:00:00+03:00`
  const m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return { error:`Tarih biçimi tanınmadı: "${t}"` }
  const [,gg,aa,yyyy]=m
  return `${yyyy}-${aa.padStart(2,'0')}-${gg.padStart(2,'0')}T00:00:00+03:00`
}

// --- CSV oku ----------------------------------------------------------
const all = parseCSV(readFileSync(CSV,'utf8')).filter(r=>r.length>1 && r.some(c=>c.trim()!==''))
const header = all[0]
const data = all.slice(1)
const col = name => header.indexOf(name)
const C = { ad:col('Kişi Adı'), firma:col('Firma Adı'), durum:col('Durum'), sehir:col('Şehir'),
  ilce:col('İlçe'), tel:col('Telefon'), email:col('E-posta'), ulke:col('Ülke'), tur:col('Tür'), olus:col('Oluşturulma') }

// --- Dosya-içi mükerrer grupları --------------------------------------
const byPhone = new Map(), byEmail = new Map()
data.forEach((r,idx)=>{
  const d=(r[C.tel]||'').replace(/\D/g,''); if(d) (byPhone.get(d)??byPhone.set(d,[]).get(d)).push(idx)
  const e=(r[C.email]||'').trim().toLowerCase(); if(e) (byEmail.get(e)??byEmail.set(e,[]).get(e)).push(idx)
})
const dupNoteFor = (idx)=>{
  const notes=[]
  for(const [d,list] of byPhone) if(list.length>1 && list.includes(idx))
    notes.push(`Mükerrer (aynı telefon): ${list.map(i=>data[i][C.ad].trim()).join(', ')}`)
  for(const [e,list] of byEmail) if(list.length>1 && list.includes(idx))
    notes.push(`Mükerrer (aynı e-posta): ${list.map(i=>data[i][C.ad].trim()).join(', ')}`)
  return notes
}

// --- Her satır için PLAN ----------------------------------------------
const plan = []
data.forEach((r, idx)=>{
  const name = trimOrNull(r[C.ad])
  let company = trimOrNull(r[C.firma]); if (company==='-') company=null
  let country = trimOrNull(r[C.ulke])
  let city = trimOrNull(r[C.sehir])
  const district = trimOrNull(r[C.ilce])
  // Dubai düzeltmesi
  if (country==='Dubai'){ country='Birleşik Arap Emirlikleri'; city='Dubai' }
  const intl = country!=null && normalizeTr(country)!=='turkiye'   // uluslararası mı?
  const sId = statusId(r[C.durum])
  const tId = typeId(r[C.tur])
  const created = parseDate(r[C.olus])

  // Telefon + Ezgi dahili
  let telRaw = trimOrNull(r[C.tel]); let dahili=null
  if (telRaw){ const m = telRaw.match(/\((\d+)\)\s*$/); if(m){ dahili=m[1]; telRaw = telRaw.replace(/\(\d+\)\s*$/,'').trim() } }
  const phoneE164 = toE164(telRaw, intl)
  const email = (()=>{ const e=trimOrNull(r[C.email]); return e? e.toLowerCase() : null })()

  // İç notlar
  const notes = dupNoteFor(idx)
  if (dahili) notes.push(`Dahili hat: ${dahili}`)

  const errors=[]
  if (!name && !company) errors.push('Kişi adı veya firma adından en az biri gerekli')
  if (telRaw && !phoneE164) errors.push(`Telefon normalize edilemedi: "${telRaw}"`)
  if (created?.error) errors.push(created.error)
  if (sId==null) errors.push(`Durum eşleşmedi: "${r[C.durum]}"`)
  if (r[C.tur] && tId==null) errors.push(`Tür eşleşmedi: "${r[C.tur]}"`)

  plan.push({ row:idx+2, name, company, sId, sLabel:statusRows.find(s=>+s[0]===sId)?.[2],
    tId, tLabel:typeRows.find(t=>+t[0]===tId)?.[2], country, city, district,
    phoneE164, email, created: created?.error?null:created, intl, dahili, notes, errors })
})

// --- ÖNİZLEME ---------------------------------------------------------
console.log(`\n=== İÇE AKTARMA ${WRITE?'(⚠️ YAZMA MODU)':'(KURU KOŞU — yazma yok)'} ===`)
console.log(`Dosya: ${CSV} · İşlenen satır: ${plan.length} (90 bekleniyor)\n`)
for (const p of plan){
  const flags = [p.intl?'🌍intl':'', p.dahili?`☎dahili:${p.dahili}`:'', p.notes.some(n=>n.startsWith('Mükerrer'))?'♻︎dup':''].filter(Boolean).join(' ')
  console.log(`#${String(p.row).padStart(2)} ${(p.name||'(firma)').padEnd(22)} | firma:${(p.company||'-').padEnd(14)} | ${String(p.sLabel).padEnd(6)} | ${String(p.tLabel).padEnd(8)} | ${(p.country||'-')}/${p.city||'-'} | tel:${p.phoneE164||'(boş)'} | ${p.email||'(boş e-posta)'} | ${p.created?.slice(0,10)} ${flags}`)
  if (p.errors.length) console.log(`      ❌ ${p.errors.join(' · ')}`)
}

// --- ÖZET -------------------------------------------------------------
const withErr = plan.filter(p=>p.errors.length)
const firms = plan.filter(p=>p.company)
const intls = plan.filter(p=>p.intl && p.phoneE164)
const dups = plan.filter(p=>p.notes.some(n=>n.startsWith('Mükerrer')))
const ezgi = plan.find(p=>p.dahili)
console.log(`\n=== ÖZET ===`)
console.log(`  Toplam plan: ${plan.length} · Hatalı: ${withErr.length} · Firma dolu: ${firms.length} · Uluslararası tel: ${intls.length} · Mükerrer işaretli: ${dups.length}`)
console.log(`  Durum dağılımı: ` + JSON.stringify(plan.reduce((a,p)=>{a[p.sLabel]=(a[p.sLabel]||0)+1;return a},{})))
console.log(`  Tür dağılımı:   ` + JSON.stringify(plan.reduce((a,p)=>{a[p.tLabel]=(a[p.tLabel]||0)+1;return a},{})))
console.log(`  created_at aralığı: ${plan.map(p=>p.created?.slice(0,10)).sort()[0]} … ${plan.map(p=>p.created?.slice(0,10)).sort().at(-1)}`)
console.log(`\n  🌍 Uluslararası (E.164):`); intls.forEach(p=>console.log(`     ${p.name.padEnd(20)} ${p.phoneE164}`))
console.log(`\n  ♻︎ Mükerrer işaretli (${dups.length}):`); dups.forEach(p=>console.log(`     ${p.name.padEnd(20)} → ${p.notes.filter(n=>n.startsWith('Mükerrer')).join(' | ')}`))
if (ezgi) console.log(`\n  ☎ Ezgi: tel ${ezgi.phoneE164} · not "${ezgi.notes.find(n=>n.startsWith('Dahili'))}"`)
if (withErr.length){ console.log(`\n  ❌ HATALI SATIRLAR:`); withErr.forEach(p=>console.log(`     #${p.row} ${p.name}: ${p.errors.join(', ')}`)) }

// --- SQL üret (atomik tek transaction) --------------------------------
let sql = `-- OTOMATİK ÜRETİLDİ — import-musteriler.mjs\n\\set ON_ERROR_STOP on\nBEGIN;\n`
for (const p of plan){
  if (p.errors.length){ sql += `-- #${p.row} ATLANDI (hata): ${p.errors.join('; ')}\n`; continue }
  sql += `do $$ declare cid bigint; begin\n`
  sql += `  insert into customers (full_name, company_name, city, district, country, status_id, customer_type_id, created_at, created_by)\n`
  sql += `  values (${esc(p.name)}, ${esc(p.company)}, ${esc(p.city)}, ${esc(p.district)}, ${esc(p.country)}, ${p.sId}, ${p.tId??'null'}, ${esc(p.created)}, ${esc(OWNER)}) returning id into cid;\n`
  if (p.phoneE164) sql += `  insert into contact_points (entity_type, entity_id, type, value, is_primary, created_by) values ('customer', cid, 'phone', ${esc(p.phoneE164)}, true, ${esc(OWNER)});\n`
  if (p.email)     sql += `  insert into contact_points (entity_type, entity_id, type, value, is_primary, created_by) values ('customer', cid, 'email', ${esc(p.email)}, true, ${esc(OWNER)});\n`
  for (const n of p.notes) sql += `  insert into notes (entity_type, entity_id, body, is_internal, created_by) values ('customer', cid, ${esc(n)}, true, ${esc(OWNER)});\n`
  sql += `end $$;\n`
}
sql += `COMMIT;\n`
writeFileSync(SQL_OUT, sql)
console.log(`\n=== SQL üretildi: ${SQL_OUT} (${sql.split('\n').length} satır) ===`)

// --- YAZMA (yalnız --write) -------------------------------------------
if (!WRITE){
  console.log(`\n🔒 KURU KOŞU — hiçbir şey yazılmadı. Gerçek yazma için: node scripts/import-musteriler.mjs --write`)
  process.exit(withErr.length?1:0)
}
console.log(`\n⚠️  YAZMA MODU — ${SQL_OUT} psql ile uygulanıyor (tek transaction)...`)
const out = psql(['-f', SQL_OUT])
console.log(out)
console.log(`✅ Yazma bitti. Doğrulama ayrı adımda (ADIM 3).`)
