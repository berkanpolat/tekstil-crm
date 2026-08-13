// =====================================================================
// DÜZELTME 1 — SÜREÇ TAKİP: quotes kayıtları üret (önkoşul)
//
// Aşaması teklif_iletildi/numune/siparis/tamamlandi/iptal olan İTHAL
// operasyonlar için bir quote üretir (bu aşamalara gelmiş = teklif verilmiş).
// teklif_bekliyor (gerçekten bekleyenler) İÇİN quote ÜRETİLMEZ.
//
// Status eşlemesi (stage → quote_status):
//   teklif_iletildi → gonderildi
//   numune/siparis/tamamlandi → kabul_edildi
//   iptal → gonderildi (D2'de reddedildi'ye çevrilecek + rejection alanları)
// sent_at = 'Teklif iletildi' durum-değişim tarihi (event_log), yoksa created_at.
// Tutar/para YOK (uydurma yok). quote_file_id yok → stage değişmez.
//
// VARSAYILAN KURU KOŞU. Yazmak için: node scripts/surec-takip-quotes.mjs --apply
// Idempotent: operasyonun zaten bir quote'u varsa atlar.
// =====================================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const APPLY = process.argv.includes('--apply')
const MODE = APPLY ? 'YAZMA (--apply)' : 'KURU KOŞU (yalnız okuma)'
const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const STAGE_TO_QSTATUS = {
  teklif_iletildi: 'gonderildi',
  numune: 'kabul_edildi',
  siparis: 'kabul_edildi',
  tamamlandi: 'kabul_edildi',
  iptal: 'gonderildi', // D2: reddedildi
}

;(async () => {
  console.log(`\n=== DÜZELTME 1 · quote üretimi · ${MODE} ===`)
  // referanslar
  const { data: qs } = await sb.from('quote_statuses').select('id,key')
  const qsId = Object.fromEntries(qs.map((r) => [r.key, r.id]))
  const { data: st } = await sb.from('operation_stages').select('id,key')
  const stageKey = Object.fromEntries(st.map((r) => [r.id, r.key]))

  // hedef operasyonlar (ithal + hedef aşamalar)
  const { data: ops } = await sb.from('operations')
    .select('id,stage_id,created_at,cancelled_at')
    .not('legacy_code', 'is', null)
  const targets = ops.filter((o) => STAGE_TO_QSTATUS[stageKey[o.stage_id]])

  // event_log'dan 'Teklif iletildi' anları (min occurred_at) — bulk
  const ids = targets.map((o) => String(o.id))
  const sentByOp = {}
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { data: ev } = await sb.from('event_log')
      .select('entity_id,occurred_at')
      .eq('event_type', 'operation.stage_changed')
      .in('entity_id', chunk)
      .filter('payload->>source_status', 'eq', 'Teklif iletildi')
    for (const e of ev || []) {
      const k = e.entity_id
      if (!sentByOp[k] || e.occurred_at < sentByOp[k]) sentByOp[k] = e.occurred_at
    }
  }

  const byStatus = {}, sentSrc = { event_log: 0, created_at: 0 }
  let toCreate = 0, skip = 0
  for (const o of targets) {
    // idempotency: zaten quote var mı
    const { data: ex } = await sb.from('quotes').select('id').eq('operation_id', o.id).limit(1)
    if (ex?.[0]) { skip++; continue }
    const qkey = STAGE_TO_QSTATUS[stageKey[o.stage_id]]
    const sent = sentByOp[String(o.id)] || o.created_at
    sentByOp[String(o.id)] ? sentSrc.event_log++ : sentSrc.created_at++
    byStatus[qkey] = (byStatus[qkey] || 0) + 1
    toCreate++
    if (APPLY) {
      const { error } = await sb.from('quotes').insert({
        operation_id: o.id,
        status_id: qsId[qkey],
        sent_at: sent,
        created_at: o.created_at,
      })
      if (error) throw error
    }
  }

  console.log(`hedef operasyon (ithal, quote'lanacak aşamalar): ${targets.length}`)
  console.log(`üretilecek: ${toCreate}   atlanacak (zaten quote var): ${skip}`)
  console.log('status dağılımı:', JSON.stringify(byStatus))
  console.log(`sent_at kaynağı → event_log: ${sentSrc.event_log}   created_at (yedek): ${sentSrc.created_at}`)
  console.log('NOT: iptal-olmayan ops.request_status_id trigger ile "teklif_bekliyor"a çekilir (kozmetik; stage/pending etkilenmez).')
  console.log(`\n=== BİTTİ (${MODE}) ===`)
  if (!APPLY) console.log('Yazmak için: node scripts/surec-takip-quotes.mjs --apply\n')
})().catch((e) => { console.error('HATA:', e?.message || JSON.stringify(e, Object.getOwnPropertyNames(e || {}))); process.exit(1) })
