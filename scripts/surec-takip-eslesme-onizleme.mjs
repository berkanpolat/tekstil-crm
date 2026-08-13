// =====================================================================
// SÜREÇ TAKİP — TALEP↔MÜŞTERİ EŞLEŞME ÖNİZLEMESİ  (CSV↔CSV, DB'ye YAZMAZ)
//
// İki kademeli eşleşme:
//   1) TELEFON (sadece rakamlar, son 10 hane) — öncelikli
//   2) telefon yok/eşleşmezse MARKA (normalize_tr ile, DB'deki fonksiyonla aynı)
//   3) ikisi de tutmazsa "eşleşmedi"
//
// Çalıştır:  node scripts/surec-takip-eslesme-onizleme.mjs
// =====================================================================
import { readFileSync } from 'node:fs'

// ---- CSV ayrıştırıcı (aktarım scriptindekiyle aynı) -----------------
function parseCsv(text) {
  text = text.replace(/^﻿/, '')
  const rows = []
  let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c === '\r') { /* yut */ }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  const head = rows.shift()
  return rows
    .filter((r) => r.length > 1 || (r[0] && r[0].trim()))
    .map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}
const load = (f) => parseCsv(readFileSync(`data/${f}`, 'utf8'))

// ---- normalize_tr — DB fonksiyonunun BİREBİR JS karşılığı -----------
const FROM = 'İIıŞşĞğÜüÖöÇç' + 'äÄëËïÏéÉèÈêÊàÀáÁâÂñÑåÅøØíÍóÓúÚýÝ'
const TO   = 'iiissgguuoocc' + 'aaeeiieeeeeeaaaaaannaaooiioouuyy'
const TR = Object.fromEntries([...FROM].map((c, i) => [c, TO[i]]))
function normTr(input) {
  if (input == null) return null
  const t = String(input).replace(/ß/g, 'ss')
  const mapped = [...t].map((c) => TR[c] ?? c).join('').toLowerCase()
  const out = mapped.replace(/[^a-z0-9]+/g, ' ').trim()
  return out === '' ? null : out
}

// ---- telefon normalize: sadece rakamlar, son 10 hane ----------------
// 0/90/+90 önekleri düşer; 10 haneden kısa ham haliyle kalır.
function normPhone(v) {
  if (!v) return null
  const d = String(v).replace(/\D+/g, '')
  if (!d) return null
  return d.length > 10 ? d.slice(-10) : d
}

// =====================================================================
const musteriler = load('musteriler.csv')
const kayitlar = load('kayitlar.csv')

// İndeksler: normalize → Set<musteri_id>
const byPhone = new Map()
const byBrand = new Map()
const custById = new Map()
for (const m of musteriler) {
  custById.set(m.musteri_id, m)
  const p = normPhone(m.telefon)
  if (p) { if (!byPhone.has(p)) byPhone.set(p, new Set()); byPhone.get(p).add(m.musteri_id) }
  const b = normTr(m.musteri_marka)
  if (b) { if (!byBrand.has(b)) byBrand.set(b, new Set()); byBrand.get(b).add(m.musteri_id) }
}

let matchedPhone = 0, matchedBrand = 0
const unmatched = []
const conflicts = []
let kayitWithPhone = 0

for (const k of kayitlar) {
  const p = normPhone(k.telefon)
  if (p) kayitWithPhone++
  const phoneHit = p ? byPhone.get(p) : null
  const brandHit = normTr(k.musteri_marka) ? byBrand.get(normTr(k.musteri_marka)) : null

  const phoneIds = phoneHit ? [...phoneHit] : []
  const brandIds = brandHit ? [...brandHit] : []

  // Çelişki: telefon bir müşteriye, marka BAŞKA müşteriye işaret ediyor
  if (phoneIds.length && brandIds.length) {
    const overlap = phoneIds.some((id) => brandIds.includes(id))
    if (!overlap) {
      conflicts.push({
        kayit_id: k.kayit_id, marka: k.musteri_marka, tel: k.telefon,
        telefon_musteri: phoneIds.map((id) => `${custById.get(id)?.musteri_marka}#${id.slice(0, 8)}`).join(', '),
        marka_musteri: brandIds.map((id) => `${custById.get(id)?.musteri_marka}#${id.slice(0, 8)}`).join(', '),
      })
    }
  }

  // İki kademeli karar
  if (phoneIds.length) matchedPhone++
  else if (brandIds.length) matchedBrand++
  else unmatched.push({ kayit_id: k.kayit_id, marka: k.musteri_marka || '(boş)', tel: k.telefon || '(boş)' })
}

// Aynı marka → birden fazla farklı müşteri kaydı
const dupBrands = [...byBrand.entries()]
  .filter(([, ids]) => ids.size > 1)
  .map(([b, ids]) => ({ brand: b, ids: [...ids].map((id) => `${custById.get(id)?.musteri_marka}#${id.slice(0, 8)}`) }))

// ---- RAPOR ----------------------------------------------------------
console.log('\n=== TALEP↔MÜŞTERİ EŞLEŞME ÖNİZLEMESİ (DB\'ye yazılmadı) ===')
console.log(`Müşteri (musteriler.csv): ${musteriler.length}`)
console.log(`Talep   (kayitlar.csv)  : ${kayitlar.length}  (telefon dolu: ${kayitWithPhone})`)
console.log('')
console.log(`✓ Telefonla eşleşen talep : ${matchedPhone}`)
console.log(`✓ Markayla eşleşen talep  : ${matchedBrand}  (telefon yok/eşleşmedi)`)
console.log(`✗ Hiç eşleşmeyen talep    : ${unmatched.length}`)
console.log(`⚠ Çelişki (tel≠marka)     : ${conflicts.length}`)
console.log(`⚠ Aynı marka çok müşteri  : ${dupBrands.length}`)

if (unmatched.length) {
  console.log(`\n--- HİÇ EŞLEŞMEYEN (${unmatched.length}) [kayit_id | marka | telefon] ---`)
  for (const u of unmatched) console.log(`  ${u.kayit_id}  |  ${u.marka}  |  ${u.tel}`)
}

if (conflicts.length) {
  console.log(`\n--- ⚠ ÇELİŞKİLER (${conflicts.length}) — EN TEHLİKELİ ---`)
  for (const c of conflicts) {
    console.log(`  ${c.kayit_id}  marka="${c.marka}" tel="${c.tel}"`)
    console.log(`     telefon→ ${c.telefon_musteri}`)
    console.log(`     marka  → ${c.marka_musteri}`)
  }
}

if (dupBrands.length) {
  console.log(`\n--- ⚠ AYNI MARKA BİRDEN FAZLA MÜŞTERİ (${dupBrands.length}) ---`)
  for (const d of dupBrands) console.log(`  "${d.brand}" → ${d.ids.join(' | ')}`)
}

console.log('\n=== BİTTİ (yalnız okuma) ===\n')
