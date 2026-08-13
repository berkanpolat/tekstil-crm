// =====================================================================
// DÜZELTME 3 — İthal etkileşimleri operasyona bağla (interactions.operation_id)
//
// Import etkileşimleri entity_type='customer' + entity_id=müşteri yazdı ama
// operation_id'yi NULL bıraktı → operasyon ekranında görünmüyorlar.
// Kaynakta her not bir talebe (kayit_id) aitti → doğru operasyon: legacy_code=kayit_id.
// Bu script yalnız operation_id'yi doldurur; entity_type/entity_id AYNEN kalır
// (müşteri kartında durmaya devam eder, operasyon ekranında da çıkar).
//
// Eşleme kayit_id bazında. Yalnız '[Süreç Takip aktarımı]' etiketli etkileşimler.
// Idempotent: operation_id zaten doluysa atla.
// Trigger gürültüsü: yalnız audit_log satırı + updated_at (bildirim/timeline YOK).
//
// VARSAYILAN KURU KOŞU. Yazmak için: node scripts/surec-takip-etkilesim-operasyon-backfill.mjs --apply
// =====================================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const APPLY = process.argv.includes('--apply')
const MODE = APPLY ? 'YAZMA (--apply)' : 'KURU KOŞU (yalnız okuma)'
const TAG = '[Süreç Takip aktarımı]'
const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

function parseCsv(text) {
  text = text.replace(/^﻿/, '')
  const rows = []; let row = [], f = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(f); f = '' }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = '' }
    else if (c === '\r') { /* yut */ }
    else f += c
  }
  if (f.length || row.length) { row.push(f); rows.push(row) }
  const head = rows.shift()
  return rows.filter((r) => r.length > 1 || (r[0] && r[0].trim())).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}
const nz = (v) => (v && v.trim() ? v.trim() : null)
const epoch = (v) => (v ? new Date(v).getTime() : 0)

;(async () => {
  console.log(`\n=== DÜZELTME 3 · etkileşim→operasyon backfill · ${MODE} ===`)

  // operasyon haritası: kayit_id (legacy_code) → {id, customer_id}
  const opMap = {}
  {
    const { data } = await sb.from('operations').select('id,legacy_code,customer_id').not('legacy_code', 'is', null)
    for (const o of data || []) opMap[o.legacy_code] = { id: o.id, customer_id: o.customer_id }
  }

  // ithal etkileşimler → intKey (entity_id|occurredEpoch|summary) → {id, operation_id}
  const intIndex = new Map()
  {
    const { data } = await sb.from('interactions')
      .select('id,entity_id,occurred_at,summary,operation_id')
      .eq('entity_type', 'customer').like('summary', TAG + '%').is('deleted_at', null)
    for (const it of data || []) intIndex.set(`${it.entity_id}|${epoch(it.occurred_at)}|${it.summary}`, it)
    console.log(`ithal etkileşim (DB): ${data?.length ?? 0}`)
  }

  // kayitlar.csv gerçek notları → anahtar başına operasyon(lar)
  const rows = parseCsv(readFileSync('data/kayitlar.csv', 'utf8'))
  const keyInfo = new Map() // key → {ops:Set, kayitIds:[], reason?}
  const unmatched = []
  for (const k of rows) {
    const note = nz(k.not)
    if (!note || note.startsWith('[Ürün:')) continue
    const op = opMap[k.kayit_id]
    if (!op) { unmatched.push({ kayit_id: k.kayit_id, reason: 'operasyon yok (legacy_code eşleşmedi)' }); continue }
    const occurred = nz(k.son_guncelleme) || nz(k.olusturulma)
    const summary = `${TAG} ${note}`
    const key = `${op.customer_id}|${epoch(occurred)}|${summary}`
    if (!keyInfo.has(key)) keyInfo.set(key, { ops: new Set(), kayitIds: [] })
    const e = keyInfo.get(key); e.ops.add(op.id); e.kayitIds.push(k.kayit_id)
  }

  // karar: doldur / zaten dolu / etkileşim yok / belirsiz
  const toFill = [], ambiguous = []
  let skipAlready = 0
  for (const [key, e] of keyInfo) {
    const it = intIndex.get(key)
    if (!it) { unmatched.push({ kayit_id: e.kayitIds.join(','), reason: 'etkileşim bulunamadı (anahtar eşleşmedi)' }); continue }
    if (it.operation_id != null) { skipAlready++; continue }
    if (e.ops.size > 1) { ambiguous.push({ interactionId: it.id, kayitIds: e.kayitIds, ops: [...e.ops] }); continue }
    toFill.push({ interactionId: it.id, opId: [...e.ops][0] })
  }

  if (APPLY) {
    for (const f of toFill) {
      const { error } = await sb.from('interactions').update({ operation_id: f.opId }).eq('id', f.interactionId)
      if (error) throw error
    }
  }

  // rapor
  console.log(`gerçek not (kaynak): ${[...keyInfo.values()].reduce((s, e) => s + e.kayitIds.length, 0)}   benzersiz etkileşim anahtarı: ${keyInfo.size}`)
  console.log(`✓ operation_id doldurulacak: ${toFill.length}`)
  console.log(`• zaten dolu (atla): ${skipAlready}`)
  console.log(`✗ eşleşmeyen: ${unmatched.length}`)
  console.log(`⚠ belirsiz (aynı müşteri+not+tarih birden fazla operasyon): ${ambiguous.length}`)
  if (unmatched.length) {
    console.log('--- EŞLEŞMEYENLER ---')
    for (const u of unmatched) console.log(`  ${u.kayit_id}  →  ${u.reason}`)
  }
  if (ambiguous.length) {
    console.log('--- BELİRSİZLER (elle karar) ---')
    for (const a of ambiguous) console.log(`  etkileşim#${a.interactionId}  kayitlar=[${a.kayitIds.join(', ')}]  ops=[${a.ops.join(', ')}]`)
  }
  console.log('NOT: trigger etkisi yalnız audit_log satırı + updated_at (bildirim/timeline YOK).')
  console.log(`\n=== BİTTİ (${MODE}) ===`)
  if (!APPLY) console.log('Yazmak için: node scripts/surec-takip-etkilesim-operasyon-backfill.mjs --apply\n')
})().catch((e) => { console.error('HATA:', e?.message || JSON.stringify(e, Object.getOwnPropertyNames(e || {}))); process.exit(1) })
