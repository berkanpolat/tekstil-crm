// =====================================================================
// EŞLEŞMEYEN LEAD'LER · CANLI KURU KOŞU (yalnız OKUMA).
// data/leads.csv → CANLI customers + leads (potansiyel) + contact_points
// ile eşleştirir (offline snapshot DEĞİL). Katalog kodları canlı
// catalog_products.code ile doğrulanır. HİÇBİR ŞEY YAZMAZ.
//
// Canlı match verisi /tmp/leads-canli/*.json içine psql ile önceden
// export edilir (phones/customers/leads/codes). Bu script onları okur.
// =====================================================================
import { readFileSync, existsSync } from 'node:fs'

const FOLD = { 'İ':'i','I':'i','ı':'i','i':'i','Ş':'s','ş':'s','Ğ':'g','ğ':'g','Ü':'u','ü':'u','Ö':'o','ö':'o','Ç':'c','ç':'c' }
function normalizeTr(input){
  if (input==null) return null
  let s = String(input).replace(/ß/g,'ss').replace(/[İIıiŞşĞğÜüÖöÇç]/g, ch=>FOLD[ch]??ch).toLowerCase()
  s = s.replace(/[^a-z0-9]+/g,' ').trim()
  return s || null
}
const last10 = (raw) => { const d=String(raw??'').replace(/\D/g,''); return d.length>=10 ? d.slice(-10) : (d||null) }
const trimOrNull = s => { const t=(s??'').trim(); return t===''?null:t }

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
const readCSV = (path) => parseCSV(readFileSync(path,'utf8').replace(/^﻿/,''))
const J = (name) => JSON.parse(readFileSync('/tmp/leads-canli/'+name+'.json','utf8'))

// ── CANLI eşleştirme setleri ────────────────────────────────────────
const livePhones = J('phones')   // {et,eid,v}
const liveCust   = J('customers')// {id,name,comp}
const liveLeads  = J('leads')    // {id,name,comp}
const liveCodes  = new Set(J('codes'))

const byPhone = new Map()  // last10 → [{et,eid}]
for (const p of livePhones){ const k=last10(p.v); if(k&&k.length===10){ if(!byPhone.has(k)) byPhone.set(k,[]); byPhone.get(k).push({et:p.et,eid:p.eid}) } }
const byName = new Map()   // normalized name → [{et,id}]
const addName=(k,rec)=>{ if(!k) return; if(!byName.has(k)) byName.set(k,[]); byName.get(k).push(rec) }
for (const c of liveCust){ addName(normalizeTr(c.name),{et:'customer',id:c.id}); addName(normalizeTr(c.comp),{et:'customer',id:c.id}) }
for (const l of liveLeads){ addName(normalizeTr(l.name),{et:'lead',id:l.id}); addName(normalizeTr(l.comp),{et:'lead',id:l.id}) }

// ── Lead'ler ────────────────────────────────────────────────────────
const all = readCSV('data/leads.csv').filter(r=>r.length>1 && r.some(c=>c.trim()!==''))
const H = all[0]; const h = n => H.indexOf(n)
const leads = all.slice(1).map((r,idx)=>({
  n: idx+2, zaman: trimOrNull(r[h('Zaman')]), ad: trimOrNull(r[h('Ad')]),
  sehir: trimOrNull(r[h('Sehir')]), tel: trimOrNull(r[h('Telefon')]),
  email: trimOrNull(r[h('E-posta')]), mod: trimOrNull(r[h('Mod')]),
  not: trimOrNull(r[h('Not')]), urunler: trimOrNull(r[h('Urunler')]),
  gorsel: trimOrNull(r[h('Gorsel')]),
  telKey: last10(r[h('Telefon')]), nameKey: normalizeTr(r[h('Ad')]),
}))

// ── Eşleştir (CANLI): telefon → isim, hangi entity? ─────────────────
const matched=[], unmatched=[]
for (const L of leads){
  let via=null, hits=[]
  if (L.telKey && L.telKey.length===10 && byPhone.has(L.telKey)){ via='telefon'; hits=byPhone.get(L.telKey) }
  else if (L.nameKey && byName.has(L.nameKey)){ via='isim'; hits=byName.get(L.nameKey) }
  if (via){ L.via=via; L.hits=hits; matched.push(L) } else unmatched.push(L)
}
const matchedToLead = matched.filter(L=>L.hits.some(x=>x.et==='lead'))
const matchedToCust = matched.filter(L=>L.hits.some(x=>x.et==='customer'))

// ── TEST/ÇÖP sınıflandırıcı (offline ile aynı) ──────────────────────
const JUNK_TXT = /(deneme|test|claude|xxxx|asdf|qwer)/i
const telCount = new Map()
for (const L of leads){ const k=L.telKey; if(k&&k.length===10) telCount.set(k,(telCount.get(k)||0)+1) }
function isJunkPhone(k){
  if (!k || k.length!==10) return false
  if (/^(\d)\1{9}$/.test(k)) return true
  if (/(\d)\1{2,}/.test(k) && /(1234|4447|6667|6789)/.test(k)) return true
  return false
}
const KNOWN_TEST_TEL = new Set(['5554447788','5556667788','5556905511','5555555555','5444198189'])
function isTest(L){
  if (JUNK_TXT.test(L.ad||'') || JUNK_TXT.test(L.sehir||'')) return true
  if (L.telKey && (isJunkPhone(L.telKey) || KNOWN_TEST_TEL.has(L.telKey))) return true
  if (L.telKey && telCount.get(L.telKey) >= 5) return true
  return false
}

const has = v => v!=null && v!==''
const personKey = L => (L.telKey && L.telKey.length===10) ? 'tel:'+L.telKey : (L.nameKey ? 'ad:'+L.nameKey : 'satır:'+L.n)

const uTest = unmatched.filter(isTest)
const uReal = unmatched.filter(l=>!isTest(l))
const realPersonMap = new Map()
for (const L of uReal){ const k=personKey(L); if(!realPersonMap.has(k)) realPersonMap.set(k,[]); realPersonMap.get(k).push(L) }

// ── Katalog kod kontrolü (CANLI codes) ──────────────────────────────
const codeRe = /ST-26SS\d{6}/g
function codesOf(L){
  const src=[L.urunler,L.gorsel].filter(Boolean).join(' ')
  return [...new Set(src.match(codeRe)||[])]
}
const allCodesReal = new Set(); const missingCodes=new Set()
for (const L of uReal){ for(const c of codesOf(L)){ allCodesReal.add(c); if(!liveCodes.has(c)) missingCodes.add(c) } }

// ── RAPOR ───────────────────────────────────────────────────────────
const p=(...a)=>console.log(...a)
p('\n════════ EŞLEŞMEYEN LEAD\'LER · CANLI KURU KOŞU (yazma YOK) ════════\n')
p(`CANLI setler: müşteri ${liveCust.length} · potansiyel ${liveLeads.length} · telefon ${livePhones.length} · katalog ST-26SS kod ${liveCodes.size}`)
p(`Lead kaynağı (data/leads.csv): ${leads.length}`)
p(`Eşleşen: ${matched.length}  (telefon ${matched.filter(l=>l.via==='telefon').length} · isim ${matched.filter(l=>l.via==='isim').length})`)
p(`  ├─ mevcut MÜŞTERİYE eşleşen: ${matchedToCust.length}`)
p(`  └─ mevcut POTANSİYELE eşleşen: ${matchedToLead.length}`)
p(`EŞLEŞMEYEN: ${unmatched.length}`)
p(`  ├─ TEST/ÇÖP (atlanacak): ${uTest.length}`)
p(`  └─ GERÇEK aday: ${uReal.length}  ·  benzersiz kişi (POTANSİYEL): ${realPersonMap.size}\n`)

p('── (1) CANLI EŞLEŞMEYEN — offline snapshot ile fark ────────────────')
p(`  Offline (13 Ağu): 69 eşleşmeyen / 23 test / 46 gerçek / 42 kişi`)
p(`  CANLI (bugün):    ${unmatched.length} eşleşmeyen / ${uTest.length} test / ${uReal.length} gerçek / ${realPersonMap.size} kişi`)
if (matchedToLead.length) { p(`  ⚠ Aradan POTANSİYEL olarak eklenmiş ${matchedToLead.length} gönderim:`)
  for (const L of matchedToLead.slice(0,20)) p(`     satır ${L.n}: ${L.ad||'—'} (${L.tel||'—'}) → lead#${L.hits.filter(x=>x.et==='lead').map(x=>x.id).join(',')}`) }

p('\n── (2) YAZILACAK: POTANSİYEL vs TALEP ─────────────────────────────')
p(`  POTANSİYEL (benzersiz kişi): ${realPersonMap.size}`)
p(`  TALEP (gönderim = satır):    ${uReal.length}`)
const multi=[...realPersonMap.entries()].filter(([,v])=>v.length>1)
p(`  Çok gönderimli kişi (1 potansiyel, N talep): ${multi.length}`)
for (const [k,v] of multi) p(`     ${v.length}× ${k}  [${v.map(x=>'satır'+x.n).join(', ')}]  → ${v[0].ad||'—'}`)

p('\n── (3) KATALOG KODU EŞLEŞMESİ (CANLI) ─────────────────────────────')
p(`  Gerçek adaylarda geçen benzersiz ST- kodu: ${allCodesReal.size}`)
p(`  Canlı katalogda BULUNMAYAN kod: ${missingCodes.size}`)
if (missingCodes.size) for (const c of missingCodes) {
  const owners=uReal.filter(L=>codesOf(L).includes(c)).map(L=>'satır'+L.n)
  p(`     ✗ ${c}   [${owners.join(', ')}]`)
}

p('\n── (4) ATLANACAK TEST/ÇÖP KAYITLAR ────────────────────────────────')
p(`  Toplam: ${uTest.length}`)
for (const L of uTest){
  const sebep=[]
  if (JUNK_TXT.test(L.ad||'')||JUNK_TXT.test(L.sehir||'')) sebep.push('isim/şehir metni')
  if (L.telKey && KNOWN_TEST_TEL.has(L.telKey)) sebep.push('bilinen test-tel')
  if (L.telKey && isJunkPhone(L.telKey)) sebep.push('sahte-tel')
  if (L.telKey && telCount.get(L.telKey)>=5) sebep.push(`aynı tel ${telCount.get(L.telKey)}×`)
  p(`  satır ${String(L.n).padStart(3)}: ${(L.ad||'—').padEnd(20).slice(0,20)} ${(L.tel||'—').padEnd(14)} ${(L.mod||'—').padEnd(8)} → ${sebep.join(', ')}`)
}

p('\n── (5) GÖRSELLER ──────────────────────────────────────────────────')
const gorselli=uReal.filter(l=>has(l.gorsel))
p(`  Görsel adı olan gerçek aday: ${gorselli.length}`)
const localHit=gorselli.slice(0,5).some(g=>existsSync('data/'+g.gorsel)||existsSync(g.gorsel))
p(`  Yerelde dosya? → ${localHit?'EVET':'HAYIR (yalnız dosya adı kaydedilecek)'}`)

p('\n── GERÇEK ADAY LİSTESİ (kişi bazında) ─────────────────────────────')
for (const [k,v] of realPersonMap){
  const L=v[0]
  p(`  ${(L.ad||'—').padEnd(22).slice(0,22)} ${(L.sehir||'—').padEnd(11).slice(0,11)} ${(L.tel||'—').padEnd(14)} ${v.length} talep  ${v.some(x=>has(x.gorsel))?'görsel':''} ${v.some(x=>has(x.not))?'not':''}`)
}
p('\n════════ CANLI KURU KOŞU BİTTİ · hiçbir şey yazılmadı ════════\n')
