// =====================================================================
// EŞLEŞMEYEN LEAD'LER · KURU KOŞU (yalnız OKUMA, OFFLINE).
// data/leads.csv (225 kayıt) → hangi lead'ler hiçbir müşteriye bağlanmıyor?
// Canlı DB bu ortamdan erişilemez (NXDOMAIN) → eşleştirme 13 Ağu snapshot'ı
// data/musteriler.csv ile YAPILIR (PROXY; canlı değil — rapor bunu belirtir).
// Katalog eşleşmesi data/urunler.csv (ST- kodları) ile yapılır.
// HİÇBİR ŞEY YAZMAZ.  Çalıştır:  node scripts/leads-eslesmeyenler-kuru-kosu.mjs
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

// ── Müşteri snapshot (13 Ağu) ───────────────────────────────────────
const custRows = readCSV('data/musteriler.csv').filter(r=>r.length>1 && r.some(c=>c.trim()!==''))
const cH = custRows[0]; const cc = n => cH.indexOf(n)
const customers = custRows.slice(1).map(r=>({
  id: r[cc('musteri_id')], marka: trimOrNull(r[cc('musteri_marka')]),
  kontak: trimOrNull(r[cc('kontak_kisi')]), tel: trimOrNull(r[cc('telefon')]),
}))
const byPhone = new Map(), byName = new Map()
const addName = (k,c)=>{ if(!k) return; if(!byName.has(k)) byName.set(k,[]); byName.get(k).push(c) }
for (const c of customers){
  const k = last10(c.tel); if (k && k.length===10){ if(!byPhone.has(k)) byPhone.set(k,[]); byPhone.get(k).push(c) }
  addName(normalizeTr(c.marka), c); addName(normalizeTr(c.kontak), c)  // marka VE kontak kişi
}

// ── Katalog kodları (ST-) ───────────────────────────────────────────
const prodRows = readCSV('data/urunler.csv').filter(r=>r.length>1)
const pH = prodRows[0]; const pc = n => pH.indexOf(n)
const prodCodes = new Set(prodRows.slice(1).map(r=>trimOrNull(r[pc('Ürün Kodu')])).filter(Boolean))
const codeRe = /ST-26SS\d{6}/g

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

// ── Eşleştir: telefon → isim ────────────────────────────────────────
const matched = [], unmatched = []
for (const L of leads){
  let via=null
  if (L.telKey && L.telKey.length===10 && byPhone.has(L.telKey)) via='telefon'
  else if (L.nameKey && byName.has(L.nameKey)) via='isim'
  if (via){ L.via=via; matched.push(L) } else unmatched.push(L)
}

// Kişi anahtarı: telefon varsa son10, yoksa isim
const personKey = L => (L.telKey && L.telKey.length===10) ? 'tel:'+L.telKey : (L.nameKey ? 'ad:'+L.nameKey : 'satır:'+L.n)

// ── TEST/ÇÖP sınıflandırıcı (intake geliştirme kalıntısı) ───────────
// Ad/şehirde deneme|test|claude; ya da bariz sahte/tekrarlı telefon;
// ya da aynı telefon çok kez (≥3) gönderilmiş.
const JUNK_TXT = /(deneme|test|claude|xxxx|asdf|qwer)/i
const telCount = new Map()
for (const L of leads){ const k=L.telKey; if(k&&k.length===10) telCount.set(k,(telCount.get(k)||0)+1) }
function isJunkPhone(k){
  if (!k || k.length!==10) return false
  if (/^(\d)\1{9}$/.test(k)) return true                 // 5555555555
  if (/(\d)\1{2,}/.test(k) && /(1234|4447|6667|6789)/.test(k)) return true
  return false
}
const KNOWN_TEST_TEL = new Set(['5554447788','5556667788','5556905511','5555555555','5444198189'])
function isTest(L){
  if (JUNK_TXT.test(L.ad||'') || JUNK_TXT.test(L.sehir||'')) return true
  if (L.telKey && (isJunkPhone(L.telKey) || KNOWN_TEST_TEL.has(L.telKey))) return true
  if (L.telKey && telCount.get(L.telKey) >= 5) return true   // aynı no ≥5 gönderim = test
  return false
}

// ── Analizler ───────────────────────────────────────────────────────
const has = v => v!=null && v!==''
const uStats = {
  toplam: unmatched.length,
  upload: unmatched.filter(l=>l.mod==='upload').length,
  catalog: unmatched.filter(l=>l.mod==='catalog').length,
  digerMod: unmatched.filter(l=>l.mod && l.mod!=='upload' && l.mod!=='catalog').length,
  notlu: unmatched.filter(l=>has(l.not)).length,
  gorselli: unmatched.filter(l=>has(l.gorsel)).length,
  telefonlu: unmatched.filter(l=>l.telKey && l.telKey.length===10).length,
  emailli: unmatched.filter(l=>has(l.email)).length,
  sehirli: unmatched.filter(l=>has(l.sehir)).length,
  adli: unmatched.filter(l=>has(l.ad)).length,
}

// Q4 — katalog eşleşmesi (TÜM catalog-mod + eşleşmeyenler)
function catalogHit(L){
  const src = [L.urunler, L.gorsel].filter(Boolean).join(' ')  // kod bazen taşmış olabilir
  const codes = [...new Set((src.match(codeRe)||[]))]
  const known = codes.filter(c=>prodCodes.has(c))
  return { codes, known, freeText: codes.length===0 ? (L.urunler||'') : '' }
}
const catalogLeads = leads.filter(l=>l.mod==='catalog')
const catAll = catalogLeads.map(L=>({L, ...catalogHit(L)}))
const catUnmatched = unmatched.filter(l=>l.mod==='catalog').map(L=>({L, ...catalogHit(L)}))

// Q6 — mükerrer: eşleşmeyen kişi hem matched hem unmatched'te mi?
const matchedPersons = new Set(matched.map(personKey))
const crossDup = unmatched.filter(L=>matchedPersons.has(personKey(L)))   // aynı kişi zaten eşleşmiş
const unmatchedPersonCount = new Map()
for (const L of unmatched){ const k=personKey(L); unmatchedPersonCount.set(k,(unmatchedPersonCount.get(k)||0)+1) }
const repeatWithin = [...unmatchedPersonCount.entries()].filter(([,n])=>n>1)
const uniqueUnmatchedPeople = unmatchedPersonCount.size

// Q3 — görsel dosyaları yerelde var mı?
const gorselSamples = unmatched.filter(l=>has(l.gorsel)).slice(0,3).map(l=>l.gorsel)
const anyLocal = gorselSamples.some(g => existsSync('data/'+g) || existsSync(g))

// ── RAPOR ───────────────────────────────────────────────────────────
const p=(...a)=>console.log(...a)
p('\n════════ EŞLEŞMEYEN LEAD\'LER · KURU KOŞU (OFFLINE · yazma YOK) ════════\n')
p('⚠ Canlı DB bu ortamdan ERİŞİLEMİYOR (host NXDOMAIN).')
p('  Eşleştirme 13 Ağu snapshot\'ı data/musteriler.csv ile yapıldı (PROXY).')
p('  Kesin sayı için canlı customers/contact_points ile tekrar koşulmalı.\n')
const uTest = unmatched.filter(isTest), uReal = unmatched.filter(l=>!isTest(l))
const realPeople = new Set(uReal.map(personKey)).size
p(`Lead: ${leads.length}   ·   Snapshot müşteri: ${customers.length}`)
p(`Eşleşen lead: ${matched.length}   (telefonla ${matched.filter(l=>l.via==='telefon').length} · isimle ${matched.filter(l=>l.via==='isim').length})`)
p(`EŞLEŞMEYEN lead: ${unmatched.length}   ·   benzersiz kişi: ${uniqueUnmatchedPeople}`)
p(`  ├─ TEST/ÇÖP (alınmamalı): ${uTest.length}`)
p(`  └─ GERÇEK aday lead: ${uReal.length}   ·   benzersiz kişi: ${realPeople}\n`)

p('── (1) EŞLEŞMEYENLERİN PROFİLİ ────────────────────────────────────')
p(`  Mod:      upload ${uStats.upload}  ·  catalog ${uStats.catalog}  ·  diğer ${uStats.digerMod}`)
p(`  İçerik:   notlu ${uStats.notlu}  ·  görselli ${uStats.gorselli}`)
p(`  İletişim: telefonlu ${uStats.telefonlu}  ·  e-postalı ${uStats.emailli}  ·  şehirli ${uStats.sehirli}  ·  adlı ${uStats.adli}\n`)

p('── (3) GÖRSELLER ──────────────────────────────────────────────────')
p(`  Görsel adı olan eşleşmeyen: ${uStats.gorselli}`)
p(`  Örnek: ${gorselSamples.join(' · ')||'(yok)'}`)
p(`  Yerelde dosya var mı? → ${anyLocal ? 'EVET (bazıları bulundu)' : 'HAYIR — repoda yok'}`)
p('  (dosyalar landing/Storage tarafında olmalı; erişim kullanıcıdan doğrulanmalı)\n')

p('── (4) KATALOG-MOD ÜRÜN EŞLEŞMESİ ─────────────────────────────────')
const catKnown = catAll.filter(c=>c.known.length>0).length
const catFree  = catAll.filter(c=>c.codes.length===0).length
p(`  Toplam catalog-mod lead: ${catAll.length}  (eşleşmeyenlerden: ${catUnmatched.length})`)
p(`  Geçerli ST- kodu içeren: ${catKnown}  ·  koda çözülemeyen/serbest metin: ${catFree}`)
p('  Örnek (eşleşmeyen catalog-mod):')
for (const c of catUnmatched.slice(0,8)){
  const tag = c.known.length ? '✔ '+c.known.join(',') : (c.codes.length ? '≈ '+c.codes.join(',')+' (katalogda yok)' : '✗ serbest metin')
  p(`    satır ${c.L.n}: ${tag}   «${(c.L.urunler||'').slice(0,45)}»`)
}
p('')

p('── (5) NOTLARDAKİ TEKNİK DETAY (örnekler) ─────────────────────────')
for (const L of unmatched.filter(l=>has(l.not)).slice(0,5))
  p(`    satır ${L.n} [${L.ad||'—'}]: «${L.not.replace(/\n/g,' ⏎ ').slice(0,70)}»`)
p('')

p('── (6) MÜKERRER RİSKİ ─────────────────────────────────────────────')
p(`  Aynı kişi HEM eşleşen HEM eşleşmeyen listede: ${crossDup.length}`)
for (const L of crossDup.slice(0,10)) p(`    ⚠ satır ${L.n} [${L.ad||'—'} · ${L.tel||'—'}] → zaten eşleşmiş bir kişi (merge, yeni açma)`)
p(`  Eşleşmeyenler içinde tekrar eden kişi (çok gönderim): ${repeatWithin.length}`)
for (const [k,n] of repeatWithin.slice(0,10)) p(`    ${n}× ${k}`)
p('')

p(`── GERÇEK ADAY LEAD LİSTESİ (${uReal.length}) — TEST hariç ─────────────`)
for (const L of uReal)
  p(`  satır ${String(L.n).padStart(3)}: ${(L.ad||'—').padEnd(22).slice(0,22)} ${(L.sehir||'—').padEnd(12).slice(0,12)} ${(L.tel||'—').padEnd(14)} ${(L.mod||'—').padEnd(8)} ${has(L.not)?'not ':'    '}${has(L.gorsel)?'görsel':''}`)
p(`\n── TEST/ÇÖP (${uTest.length}) — ALINMAYACAK ───────────────────────────`)
for (const L of uTest)
  p(`  satır ${String(L.n).padStart(3)}: ${(L.ad||'—').padEnd(22).slice(0,22)} ${(L.tel||'—').padEnd(14)} ${(L.mod||'—')}`)
p('\n════════ KURU KOŞU BİTTİ · hiçbir şey yazılmadı ════════\n')
