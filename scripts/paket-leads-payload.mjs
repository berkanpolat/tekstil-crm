// =====================================================================
// EŞLEŞMEYEN LEAD'LER · PAYLOAD ÜRETİCİ (yalnız OKUMA; JSON üretir).
// data/leads.csv → CANLI eşleştirme (/tmp/leads-canli/*.json) → 34 kişi.
// Düzeltilmiş sınıflandırıcı: Ad/Şehir + NOT/ÜRÜNLER junk kontrolü.
// Kişi = telefon son10 (1 potansiyel, N talep). İl + katalog kodu çözülür.
// Çıktı: /tmp/leads-canli/payload.json  (yazma faz-2 scripti bunu okur)
// =====================================================================
import { readFileSync, writeFileSync } from 'node:fs'

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
const livePhones=J('phones'), liveCust=J('customers'), liveLeads=J('leads')
const provinces=J('provinces'), catmap=J('catmap')
const byPhone=new Map()
for (const p of livePhones){ const k=last10(p.v); if(k&&k.length===10){ if(!byPhone.has(k)) byPhone.set(k,[]); byPhone.get(k).push({et:p.et,eid:p.eid}) } }
const byName=new Map(); const addName=(k,r)=>{ if(!k) return; if(!byName.has(k)) byName.set(k,[]); byName.get(k).push(r) }
for (const c of liveCust){ addName(normalizeTr(c.name),1); addName(normalizeTr(c.comp),1) }
for (const l of liveLeads){ addName(normalizeTr(l.name),1); addName(normalizeTr(l.comp),1) }
const provById=new Map(provinces.map(p=>[normalizeTr(p.name), p.id]))
// İlçe/yazım-hatası → il alias (payload'da province_id doğru dolsun)
const CITY_ALIAS={ 'esenyurt':'istanbul', 'pendik':'istanbul', 'muglq':'mugla', 'aydin kusadasi':'aydin', 'kusadasi':'aydin' }
const resolveProv=(cityNorm)=>{ if(!cityNorm) return null; return provById.get(cityNorm) ?? (CITY_ALIAS[cityNorm]?provById.get(CITY_ALIAS[cityNorm]):null) ?? null }
const codeToProd=new Map(catmap.map(c=>[c.code,{id:c.id,name:c.name}]))

// ── Lead'ler ────────────────────────────────────────────────────────
const all = readCSV('data/leads.csv').filter(r=>r.length>1 && r.some(c=>c.trim()!==''))
const H=all[0]; const h=n=>H.indexOf(n)
const leads = all.slice(1).map((r,idx)=>({
  n:idx+2, zaman:trimOrNull(r[h('Zaman')]), ad:trimOrNull(r[h('Ad')]), sehir:trimOrNull(r[h('Sehir')]),
  tel:trimOrNull(r[h('Telefon')]), email:trimOrNull(r[h('E-posta')]), mod:trimOrNull(r[h('Mod')]),
  not:trimOrNull(r[h('Not')]), urunler:trimOrNull(r[h('Urunler')]), gorsel:trimOrNull(r[h('Gorsel')]),
  telKey:last10(r[h('Telefon')]), nameKey:normalizeTr(r[h('Ad')]),
}))

// ── Eşleştir (CANLI) ────────────────────────────────────────────────
const unmatched=[]
for (const L of leads){
  let m=false
  if (L.telKey && L.telKey.length===10 && byPhone.has(L.telKey)) m=true
  else if (L.nameKey && byName.has(L.nameKey)) m=true
  if (!m) unmatched.push(L)
}

// ── TEST/ÇÖP sınıflandırıcı — NOT/ÜRÜNLER junk kontrolü EKLENDİ ──────
const JUNK_TXT=/(deneme|test|claude|xxxx|asdf|qwer)/i
const telCount=new Map()
for (const L of leads){ const k=L.telKey; if(k&&k.length===10) telCount.set(k,(telCount.get(k)||0)+1) }
function isJunkPhone(k){ if(!k||k.length!==10) return false
  if(/^(\d)\1{9}$/.test(k)) return true
  if(/(\d)\1{2,}/.test(k)&&/(1234|4447|6667|6789)/.test(k)) return true
  return false }
const KNOWN_TEST_TEL=new Set(['5554447788','5556667788','5556905511','5555555555','5444198189'])
function isTest(L){
  if (JUNK_TXT.test(L.ad||'')||JUNK_TXT.test(L.sehir||'')) return true
  if (JUNK_TXT.test(L.not||'')||JUNK_TXT.test(L.urunler||'')) return true   // ← YENİ: Not/Ürünler
  if (L.telKey && (isJunkPhone(L.telKey)||KNOWN_TEST_TEL.has(L.telKey))) return true
  if (L.telKey && telCount.get(L.telKey)>=5) return true
  return false
}
const uReal = unmatched.filter(l=>!isTest(l))

// ── Zaman damgası ayrıştır (Google Form: "14.08.2026 01:19:59" vb.) ─
function parseTs(s){
  if(!s) return null
  let m=s.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if(m){ const [_,d,mo,y,hh,mm,ss]=m; return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}T${hh.padStart(2,'0')}:${mm}:${ss||'00'}+03:00` }
  m=s.match(/(\d{4})-(\d{2})-(\d{2})[ T]+(\d{2}):(\d{2})(?::(\d{2}))?/)
  if(m){ const [_,y,mo,d,hh,mm,ss]=m; return `${y}-${mo}-${d}T${hh}:${mm}:${ss||'00'}+03:00` }
  return null
}
const codeRe=/ST-26SS\d{6}/g
function codesOf(L){ const src=[L.urunler,L.gorsel].filter(Boolean).join(' '); return [...new Set(src.match(codeRe)||[])] }
function gorselOf(L){ return L.gorsel ? [L.gorsel.trim()] : [] }

// ── Kişi bazında grupla (telefon son10) ─────────────────────────────
const persons=new Map()
for (const L of uReal){
  const key = (L.telKey&&L.telKey.length===10) ? L.telKey : 'ad:'+L.nameKey
  if(!persons.has(key)) persons.set(key,{ phone10: (L.telKey&&L.telKey.length===10)?L.telKey:null, rows:[] })
  persons.get(key).rows.push(L)
}

const payload=[]; let missingProv=[], missingCode=[]
for (const [key,P] of persons){
  const first=P.rows[0]
  const cityNorm=normalizeTr(first.sehir)
  const provId=resolveProv(cityNorm)
  if(first.sehir && !provId) missingProv.push(first.sehir)
  const phoneE164 = P.phone10 ? '+90'+P.phone10 : null
  const subs=P.rows.map(L=>{
    const codes=codesOf(L).map(c=>{ const p=codeToProd.get(c); if(!p) missingCode.push(c); return {code:c, id:p?.id??null, name:p?.name??null} })
    return { ts: parseTs(L.zaman), note: L.not??null, mode: L.mod??null,
             product_source: L.mod==='catalog'?'katalogdan_secim':'gorsel_yukleme',
             codes, gorsel: gorselOf(L), src_row: L.n }
  })
  const tsList=subs.map(s=>s.ts).filter(Boolean).sort()
  payload.push({
    person_key: key, full_name: first.ad, city: first.sehir, province_id: provId,
    phone_e164: phoneE164, email: first.email??null,
    lead_ts: tsList[0]||null, submissions: subs,
  })
}

writeFileSync('/tmp/leads-canli/payload.json', JSON.stringify(payload))
// NDJSON (psql \copy için: her satır bir kişi)
writeFileSync('/tmp/leads-canli/payload.ndjson', payload.map(p=>JSON.stringify(p)).join('\n')+'\n')

// ── Özet ────────────────────────────────────────────────────────────
const totalSubs=payload.reduce((a,p)=>a+p.submissions.length,0)
const totalCodes=payload.reduce((a,p)=>a+p.submissions.reduce((b,s)=>b+s.codes.length,0),0)
const opsWithCat=payload.reduce((a,p)=>a+p.submissions.filter(s=>s.codes.length>0).length,0)
const opsWithImg=payload.reduce((a,p)=>a+p.submissions.filter(s=>s.gorsel.length>0).length,0)
const noTs=payload.flatMap(p=>p.submissions).filter(s=>!s.ts).length
console.log('POTANSİYEL (kişi):', payload.length)
console.log('TALEP (gönderim) :', totalSubs)
console.log('Katalog bağı olan talep:', opsWithCat, '· toplam kod:', totalCodes)
console.log('Görselli talep:', opsWithImg)
console.log('Zaman damgası çözülemeyen gönderim:', noTs)
console.log('İl eşleşmeyen şehir:', [...new Set(missingProv)].join(', ')||'(yok)')
console.log('Katalogda bulunmayan kod:', [...new Set(missingCode)].join(', ')||'(yok)')
console.log('\nKişi listesi:')
for (const p of payload) console.log('  '+(p.full_name||'—').padEnd(22).slice(0,22), (p.city||'—').padEnd(11).slice(0,11), 'il='+(p.province_id??'∅'), p.phone_e164||'—', p.submissions.length+' talep', 'lead_ts='+(p.lead_ts||'YOK'))
