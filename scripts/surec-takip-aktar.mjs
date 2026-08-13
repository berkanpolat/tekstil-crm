// =====================================================================
// SÜREÇ TAKİP SİSTEMİ → CRM AKTARIMI
// Sıra: kullanıcılar → müşteriler → talepler → durum geçmişi → notlar
//
// VARSAYILAN: KURU KOŞU (hiçbir şey yazmaz, yalnız okur ve planı raporlar).
// Yazmak için:  node scripts/surec-takip-aktar.mjs --apply
// Tek adım:     node scripts/surec-takip-aktar.mjs --apply --only=users,customers
//
// Idempotent: tekrar çalıştırınca mükerrer üretmez
//   users       → email
//   customers   → external_source='surec-takip' + external_id=musteri_id
//   operations  → legacy_code=kayit_id
//   event_log   → payload->>'import_key' = kayit_id:sıra
//   interactions→ (entity_id, occurred_at, summary) üçlüsü
//
// created_at / requested_at / occurred_at KAYNAK tarihten yazılır.
// Geçici şifreler .secrets/surec-takip-users.txt'ye yazılır (sohbete DEĞİL).
// =====================================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

// ---- CLI bayrakları -------------------------------------------------
const APPLY = process.argv.includes('--apply')
const onlyArg = process.argv.find((a) => a.startsWith('--only='))
const ONLY = onlyArg ? onlyArg.slice('--only='.length).split(',') : null
const want = (step) => !ONLY || ONLY.includes(step)
const MODE = APPLY ? 'YAZMA (--apply)' : 'KURU KOŞU (yalnız okuma)'

// ---- Ortam ----------------------------------------------------------
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const URL = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) throw new Error('VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY bulunamadı (.env).')
const sb = createClient(URL, KEY, { auth: { persistSession: false } })

// ---- Küçük CSV ayrıştırıcı (tırnaklı virgül + CRLF + "" kaçış) -------
function parseCsv(text) {
  text = text.replace(/^﻿/, '') // BOM
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

// ---- Yardımcılar ----------------------------------------------------
const nz = (v) => (v && v.trim() ? v.trim() : null)
function newCounter() { return { ins: 0, skip: 0 } }

// ---- normalize_tr — DB fonksiyonunun BİREBİR JS karşılığı -----------
const _FROM = 'İIıŞşĞğÜüÖöÇç' + 'äÄëËïÏéÉèÈêÊàÀáÁâÂñÑåÅøØíÍóÓúÚýÝ'
const _TO   = 'iiissgguuoocc' + 'aaeeiieeeeeeaaaaaannaaooiioouuyy'
const _TR = Object.fromEntries([..._FROM].map((c, i) => [c, _TO[i]]))
function normTr(input) {
  if (input == null) return null
  const mapped = [...String(input).replace(/ß/g, 'ss')].map((c) => _TR[c] ?? c).join('').toLowerCase()
  const out = mapped.replace(/[^a-z0-9]+/g, ' ').trim()
  return out === '' ? null : out
}
// ---- telefon normalize: sadece rakamlar, son 10 hane (0/90/+90 düşer) --
function normPhone(v) {
  if (!v) return null
  const d = String(v).replace(/\D+/g, '')
  if (!d) return null
  return d.length > 10 ? d.slice(-10) : d
}

// KARAR TABLOSU: kaynak durum → CRM stage anahtarı (+ iptal/onay işaretleri)
const STAGE_MAP = {
  'Teklif bekliyor': { stage: 'teklif_bekliyor' },
  'Teklif iletildi': { stage: 'teklif_iletildi' },
  'Teklif onaylandı': { stage: 'numune', noteTag: '[Teklif onaylandı, numune başlamadı]' },
  'Teklif reddedildi': { stage: 'iptal', cancel: true },
  'Numune yapılıyor': { stage: 'numune' },
  'Numune teslim edildi': { stage: 'numune' },
  'Sipariş aşamasında': { stage: 'siparis' },
  'Teslim edildi': { stage: 'tamamlandi' },
}

// ---- Referans id'lerini çek ----------------------------------------
async function refs() {
  const one = async (table, col, val, extra = '') => {
    const q = sb.from(table).select('id,' + col).eq(col, val)
    const { data, error } = await q.limit(1)
    if (error) throw error
    return data?.[0]?.id ?? null
  }
  const map = async (table) => {
    const { data, error } = await sb.from(table).select('id,key')
    if (error) throw error
    return Object.fromEntries(data.map((r) => [r.key, r.id]))
  }
  const stages = await map('operation_stages')
  const channels = await map('interaction_channels')
  const reasons = await map('cancellation_reasons')
  const { data: st } = await sb.from('customer_statuses').select('id').eq('is_default', true).limit(1)
  const { data: role } = await sb.from('roles').select('id').eq('key', 'sales').limit(1)
  return {
    stages, channels, reasons,
    customerStatusId: st?.[0]?.id,
    salesRoleId: role?.[0]?.id,
    phoneChannelId: channels['telefon'],
    rejectReasonId: reasons['teklif_reddedildi'], // özel eklenen sebep (id=6)
  }
}

// =====================================================================
// 1) KULLANICILAR
// =====================================================================
// takip_eden/degiştiren adları → CRM kullanıcıları.
// polat.cetiner MEVCUT hesaba eşlenir (oluşturulmaz), diğer 3'ü oluşturulur.
const CREATE_USERS = [
  { uname: 'affan.ergul', full: 'Affan Ergül' },
  { uname: 'ayse.duzgun', full: 'Ayşe Düzgün' },
  { uname: 'hakan.akgun', full: 'Hakan Akgün' },
]
const EXISTING_MATCH = { 'polat.cetiner': 'polat.cetiner' } // email local-part ile eşleşir

async function findAuthUserByEmail(email) {
  // admin.listUsers sayfalı; küçük hesap sayısı için ilk sayfalar yeterli
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase())
    if (hit) return hit
    if (data.users.length < 200) break
  }
  return null
}

async function stepUsers(userMap) {
  const c = newCounter()
  const secrets = []
  // Mevcut hesabı eşle (polat.cetiner)
  for (const [uname] of Object.entries(EXISTING_MATCH)) {
    const { data } = await sb.from('users').select('id,email').ilike('email', uname + '@%').limit(1)
    if (data?.[0]) { userMap[uname] = data[0].id; console.log(`   • ${uname} → mevcut hesap ${data[0].email}`) }
    else console.log(`   ! ${uname} mevcut hesap bulunamadı (owner boş kalacak)`)
  }
  // Yeni kullanıcılar
  for (const u of CREATE_USERS) {
    const email = `${u.uname}@tekstilas.com`
    const existingPub = await sb.from('users').select('id').eq('email', email).limit(1)
    if (existingPub.data?.[0]) { userMap[u.uname] = existingPub.data[0].id; c.skip++; console.log(`   • ${email} zaten var (atla)`); continue }
    if (!APPLY) { c.ins++; console.log(`   + [kuru] oluşturulacak: ${email} (rol: Satış, ilk girişte şifre değiştir)`); continue }

    let auth = await findAuthUserByEmail(email)
    let created = false
    if (!auth) {
      const pass = randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '') + 'A1!'
      // CANLI handle_new_user: created_by_admin'i USER_metadata'dan okur (app_metadata değil),
      // public.users köprüsünü role_id=NULL + must_change_password=true ile O oluşturur;
      // rol insert SONRASI UPDATE ile yazılır (aşağıda).
      const { data, error } = await sb.auth.admin.createUser({
        email, password: pass, email_confirm: true,
        user_metadata: { full_name: u.full, created_by_admin: true },
      })
      if (error) throw error
      auth = data.user
      created = true
      secrets.push(`${email}\t${pass}`)
    }
    // Rolü yaz: trigger köprüyü role_id=NULL açar → Satış rolünü burada set et (idempotent).
    const pub = await sb.from('users').select('id,role_id').eq('id', auth.id).limit(1)
    if (!pub.data?.[0]) {
      const { error: pe } = await sb.from('users').insert({
        id: auth.id, email, full_name: u.full,
        role_id: userMap.__salesRoleId, is_active: true, must_change_password: true,
      })
      if (pe && pe.code !== '23505') throw pe
    } else if (pub.data[0].role_id !== userMap.__salesRoleId) {
      const { error: ue } = await sb.from('users').update({ role_id: userMap.__salesRoleId, full_name: u.full }).eq('id', auth.id)
      if (ue) throw ue
    }
    userMap[u.uname] = auth.id
    c.ins++; console.log(`   + ${created ? 'oluşturuldu' : 'auth vardı → rol güncellendi'}: ${email}`)
  }
  if (APPLY && secrets.length) {
    mkdirSync('.secrets', { recursive: true })
    writeFileSync('.secrets/surec-takip-users.txt', 'email\tgecici_sifre\n' + secrets.join('\n') + '\n')
    console.log(`   → geçici şifreler .secrets/surec-takip-users.txt'ye yazıldı (${secrets.length})`)
  }
  return c
}

// =====================================================================
// 2) MÜŞTERİLER  (hepsi customers; lead ayrımı yok)
// =====================================================================
const SRC = 'Süreç Takip Sistemi' // customers.external_source: hem insan-okur kaynak hem idempotency namespace
async function stepCustomers(R, custMap) {
  const c = newCounter()
  const rows = load('musteriler.csv')
  for (const m of rows) {
    const key = m.musteri_id
    const ex = await sb.from('customers').select('id').eq('external_source', SRC).eq('external_id', key).limit(1)
    if (ex.data?.[0]) { custMap[key] = ex.data[0].id; c.skip++; continue }
    if (!APPLY) { c.ins++; continue }

    const createdAt = m.ilk_kayit_tarihi ? `${m.ilk_kayit_tarihi}T00:00:00+03:00` : undefined
    const marka = nz(m.musteri_marka)
    const kontak = nz(m.kontak_kisi)
    const { data, error } = await sb.from('customers').insert({
      company_name: marka,
      full_name: kontak || marka, // kontak yoksa markayı ad yap → hiç boş kalmaz
      status_id: R.customerStatusId,
      external_source: SRC, external_id: key,
      ...(createdAt ? { created_at: createdAt, updated_at: createdAt } : {}),
    }).select('id').single()
    if (error) throw error
    custMap[key] = data.id
    // Telefon → contact_points
    if (nz(m.telefon)) {
      await sb.from('contact_points').insert({
        entity_type: 'customer', entity_id: data.id, type: 'phone',
        value: m.telefon.trim(), label: 'iş', is_primary: true,
      })
    }
    c.ins++
  }
  return c
}

// =====================================================================
// 3) TALEPLER (operations)
// =====================================================================
async function stepOperations(R, userMap, opMap, matchCustomer) {
  const c = newCounter()
  const rows = load('kayitlar.csv')
  for (const k of rows) {
    const ex = await sb.from('operations').select('id,owner_id').eq('legacy_code', k.kayit_id).limit(1)
    if (ex.data?.[0]) {
      opMap[k.kayit_id] = ex.data[0].id
      // owner geriye-doldurma: ilk aktarımda userMap boşsa sahip null kalmış olabilir → düzelt
      const owner = userMap[nz(k.takip_eden)] || null
      if (APPLY && owner && ex.data[0].owner_id !== owner) {
        const { error } = await sb.from('operations').update({ owner_id: owner }).eq('id', ex.data[0].id)
        if (error) throw error
      }
      c.skip++; continue
    }

    // müşteri: iki kademeli (telefon-önce, sonra marka)
    const custId = matchCustomer(k)
    if (!custId) { console.log(`   ! müşteri eşleşmedi, talep atlandı: ${k.kayit_id} (${k.musteri_marka})`); c.skip++; continue }

    const map = STAGE_MAP[k.durum] || STAGE_MAP['Teklif bekliyor']
    const stageId = R.stages[map.stage]
    const owner = userMap[nz(k.takip_eden)] || null
    const descParts = [
      k.urun_kategorisi && `Kategori: ${k.urun_kategorisi}`,
      k.urun_turu && `Ürün: ${k.urun_turu}`,
      k.adet && `Adet: ${k.adet}`,
      k.birim_fiyat && `Birim fiyat: ${k.birim_fiyat}`,
      map.noteTag,
    ].filter(Boolean)
    const created = nz(k.olusturulma)
    const updated = nz(k.son_guncelleme) || created
    const requested = k.tarih ? `${k.tarih}T00:00:00+03:00` : created

    if (!APPLY) { c.ins++; continue }
    const rec = {
      customer_id: custId,
      title: nz(k.urun_turu) || nz(k.urun_kategorisi) || 'Talep',
      description: descParts.join(' · ') || null,
      stage_id: stageId,
      owner_id: owner,
      source: 'diger', // source CHECK: manuel|web_sitesi|telefon|whatsapp|diger; provenance legacy_code+müşteri.external_source'ta
      legacy_code: k.kayit_id,
      requested_at: requested,
      ...(created ? { created_at: created } : {}),
      ...(updated ? { updated_at: updated } : {}),
    }
    if (map.cancel) {
      rec.cancelled_at = updated
      rec.cancellation_reason_id = R.rejectReasonId
      rec.cancellation_note = 'Teklif reddedildi (Süreç Takip aktarımı)'
    }
    const { data, error } = await sb.from('operations').insert(rec).select('id').single()
    if (error) throw error
    opMap[k.kayit_id] = data.id
    c.ins++
  }
  return c
}

// =====================================================================
// 4) DURUM GEÇMİŞİ → event_log (operation.stage_changed)
// =====================================================================
async function stepHistory(R, opMap, userMap) {
  const c = newCounter()
  const rows = load('durum_gecmisi.csv')
  // kayit_id başına sıra numarası ver (idempotent anahtar)
  const seq = {}
  for (const h of rows) {
    const opId = opMap[h.kayit_id]
    seq[h.kayit_id] = (seq[h.kayit_id] || 0) + 1
    const idx = seq[h.kayit_id]
    if (!opId) { c.skip++; continue }
    const importKey = `${h.kayit_id}:${idx}`
    const ex = await sb.from('event_log').select('id')
      .eq('event_type', 'operation.stage_changed').eq('entity_id', String(opId))
      .filter('payload->>import_key', 'eq', importKey).limit(1)
    if (ex.data?.[0]) { c.skip++; continue }
    if (!APPLY) { c.ins++; continue }

    const map = STAGE_MAP[h.durum] || {}
    const actor = userMap[nz(h.degistiren)] || null
    const occurred = nz(h.degisim_tarihi)
    const { error } = await sb.from('event_log').insert({
      event_type: 'operation.stage_changed',
      entity_type: 'operation', entity_id: String(opId),
      actor_id: actor,
      payload: { to: map.stage || null, source_status: h.durum, import_key: importKey, src: 'surec-takip' },
      occurred_at: occurred, created_at: occurred,
    })
    if (error) throw error
    c.ins++
  }
  return c
}

// =====================================================================
// 5) NOTLAR → interactions (tek kayıt, bölme yok)
// =====================================================================
const NOTE_TAG = '[Süreç Takip aktarımı]' // ithal kaydı işaretler; sistemde girilen etkileşimle karışmasın
async function stepNotes(R, matchCustomer, opMap) {
  const c = newCounter()
  const rows = load('kayitlar.csv')
  for (const k of rows) {
    const note = nz(k.not)
    if (!note) { c.skip++; continue }

    // [Ürün: X] otomatik etiketi = gerçek görüşme değil → interactions'a YAZMA,
    // ama bilgi kaybolmasın: ilgili operasyonun description'ına ekle (yoksa).
    if (note.startsWith('[Ürün:')) {
      const opId = opMap[k.kayit_id]
      if (APPLY && opId) {
        const { data } = await sb.from('operations').select('description').eq('id', opId).limit(1)
        const cur = data?.[0]?.description || ''
        if (!cur.includes(note)) {
          const { error } = await sb.from('operations').update({ description: cur ? `${cur} · ${note}` : note }).eq('id', opId)
          if (error) throw error
        }
      }
      c.skip++; continue
    }

    const custId = matchCustomer(k)
    if (!custId) { c.skip++; continue }
    const occurred = nz(k.son_guncelleme) || nz(k.olusturulma)
    const summary = `${NOTE_TAG} ${note}` // kaynak etiketi başa
    const ex = await sb.from('interactions').select('id')
      .eq('entity_type', 'customer').eq('entity_id', custId)
      .eq('occurred_at', occurred).eq('summary', summary).limit(1)
    if (ex.data?.[0]) { c.skip++; continue }
    if (!APPLY) { c.ins++; continue }
    const { error } = await sb.from('interactions').insert({
      entity_type: 'customer', entity_id: custId,
      channel_id: R.phoneChannelId, direction: 'outbound',
      occurred_at: occurred, summary, created_at: occurred,
    })
    if (error) throw error
    c.ins++
  }
  return c
}

// =====================================================================
// ÇALIŞTIR
// =====================================================================
;(async () => {
  console.log(`\n=== SÜREÇ TAKİP → CRM AKTARIMI · ${MODE} ===`)
  if (ONLY) console.log(`   (yalnız adımlar: ${ONLY.join(', ')})`)
  const R = await refs()
  console.log(`   ref: stage=${Object.keys(R.stages).length} kanal=${Object.keys(R.channels).length} custStatus=${R.customerStatusId} salesRole=${R.salesRoleId}`)

  const userMap = { __salesRoleId: R.salesRoleId }
  const custMap = {}, opMap = {}

  // takip_eden/degiştiren → CRM kullanıcı id (email ile DB'den). Her adım için gerekli,
  // --only=operations/history tek başına çalışsa da owner/actor dolu olsun diye ayrı kurulur.
  const buildUserMap = async () => {
    for (const n of ['affan.ergul', 'ayse.duzgun', 'hakan.akgun', 'polat.cetiner']) {
      const { data } = await sb.from('users').select('id').eq('email', `${n}@tekstilas.com`).limit(1)
      if (data?.[0]) userMap[n] = data[0].id
    }
  }
  await buildUserMap()

  // opMap'i DB'den önceden kur (legacy_code→id). --only=history tek başına çalışsa da
  // durum geçmişi doğru operasyona bağlansın (stepOperations çalışmamış olabilir).
  const buildOpMap = async () => {
    const { data } = await sb.from('operations').select('id,legacy_code').not('legacy_code', 'is', null)
    for (const r of data || []) if (r.legacy_code) opMap[r.legacy_code] = r.id
  }
  await buildOpMap()

  // İKİ KADEMELİ eşleştirici (telefon-önce, sonra marka) — önizleme ile aynı mantık.
  // musteriler.csv → normalize indeks → musteri_id; sonra DB'deki external_id ile db id.
  const buildMatcher = async () => {
    const byPhone = new Map(), byBrand = new Map()
    for (const m of load('musteriler.csv')) {
      const p = normPhone(m.telefon)
      if (p) { if (!byPhone.has(p)) byPhone.set(p, new Set()); byPhone.get(p).add(m.musteri_id) }
      const b = normTr(m.musteri_marka)
      if (b) { if (!byBrand.has(b)) byBrand.set(b, new Set()); byBrand.get(b).add(m.musteri_id) }
    }
    const extToDb = {}
    const { data } = await sb.from('customers').select('id,external_id').eq('external_source', SRC)
    for (const r of data || []) if (r.external_id) extToDb[r.external_id] = r.id
    // kayit → db müşteri id (telefon önce, yoksa/eşleşmezse marka)
    return (kayit) => {
      const p = normPhone(kayit.telefon)
      let ids = p && byPhone.get(p)
      if (!ids || ids.size === 0) { const b = normTr(kayit.musteri_marka); ids = b && byBrand.get(b) }
      if (!ids || ids.size === 0) return null
      for (const mid of ids) if (extToDb[mid]) return extToDb[mid] // ilk yazılmış eşleşme
      return null
    }
  }

  if (want('users')) { console.log('\n[1] KULLANICILAR'); const c = await stepUsers(userMap); console.log(`   → +${c.ins} / atla ${c.skip}`) }
  if (want('customers')) { console.log('\n[2] MÜŞTERİLER'); const c = await stepCustomers(R, custMap); console.log(`   → +${c.ins} / atla ${c.skip}`) }

  const matchCustomer = await buildMatcher()
  // talep/not adımları müşterilerin YAZILMIŞ olmasına bağlı (external_id→db id).
  // kuru koşuda henüz müşteri yoksa eşleşme boş çıkar → uyar.
  const { count: custCount } = await sb.from('customers').select('id', { count: 'exact', head: true }).eq('external_source', SRC)
  if ((custCount || 0) === 0 && (want('operations') || want('history') || want('notes')))
    console.log('   (not: DB\'de aktarılmış müşteri yok — önce --only=customers apply edilmeli; talep/not eşleşmesi 0 çıkacak)')

  if (want('operations')) { console.log('\n[3] TALEPLER'); const c = await stepOperations(R, userMap, opMap, matchCustomer); console.log(`   → +${c.ins} / atla ${c.skip}`) }
  if (want('history')) { console.log('\n[4] DURUM GEÇMİŞİ → event_log'); const c = await stepHistory(R, opMap, userMap); console.log(`   → +${c.ins} / atla ${c.skip}`) }
  if (want('notes')) { console.log('\n[5] NOTLAR → interactions'); const c = await stepNotes(R, matchCustomer, opMap); console.log(`   → +${c.ins} / atla ${c.skip}`) }

  console.log(`\n=== BİTTİ (${MODE}) ===`)
  if (!APPLY) console.log('Yazmak için: node scripts/surec-takip-aktar.mjs --apply\n')
})().catch((e) => {
  console.error('HATA:', e?.message || e?.error_description || e?.msg || JSON.stringify(e, Object.getOwnPropertyNames(e || {})))
  if (e?.status) console.error('  status:', e.status, e?.code || '')
  process.exit(1)
})
