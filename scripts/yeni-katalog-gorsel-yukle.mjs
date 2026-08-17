#!/usr/bin/env node
// =====================================================================
// YENİ SEZON KATALOG — SIRA 6: görsel yükleme (2452 webp)
//   Kaynak: data/yeni-katalog-gorseller/<source_code>/*.webp (numerik sıralı)
//   Hedef : Storage documents/catalog/<YS-code>/<n>.webp + files + catalog_product_images
//   1.webp -> image_type='ana' (sort_order 0), diğerleri 'diger'
// İdempotent: yüklenmiş dosyayı atlar (files.storage_path + image satırı kontrolü).
// Devre kesici: art arda 5 hata -> DUR.  İlerleme: her 100 dosyada.
//   node scripts/yeni-katalog-gorsel-yukle.mjs
// Mevcut 726 görsele (catalog/ST-...) DOKUNMAZ.
// =====================================================================
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const IMG_DIR = join(ROOT, 'data', 'yeni-katalog-gorseller')
const CATALOG_NAME = 'Yeni Sezon Katalog'
const BUCKET = 'documents'

const env = Object.fromEntries(readFileSync(join(ROOT, '.env'), 'utf8').split('\n')
  .filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const supa = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const t0 = Date.now()
const el = () => { const s = Math.round((Date.now() - t0) / 1000); return `${Math.floor(s / 60)}dk${s % 60}sn` }
const log = (m) => console.log(`[${el()}] ${m}`)

// ── Katalog id ──
const { data: cat, error: catErr } = await supa.from('catalogs').select('id').eq('name', CATALOG_NAME).single()
if (catErr || !cat) { console.error('Katalog bulunamadı:', catErr?.message); process.exit(1) }
const catalogId = cat.id
log(`Katalog id=${catalogId}`)

// ── Ürünler (id, code=YS-, source_code=klasör adı) ──
const products = []
{
  let from = 0
  for (;;) {
    const { data, error } = await supa.from('catalog_products')
      .select('id, code, source_code').eq('catalog_id', catalogId).is('deleted_at', null)
      .order('sort_order').range(from, from + 999)
    if (error) { console.error('Ürün çekme hatası:', error.message); process.exit(1) }
    products.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
}
log(`Ürün: ${products.length}`)

// ── Mevcut durumu önyükle (idempotent hızlı devam) ──
const fileMap = new Map()   // storage_path -> file_id
{
  let from = 0
  for (;;) {
    const { data, error } = await supa.from('files')
      .select('id, storage_path').eq('entity_type', 'catalog_product').like('storage_path', 'catalog/YS-%')
      .range(from, from + 999)
    if (error) { console.error('files önyükleme hatası:', error.message); process.exit(1) }
    for (const f of data) fileMap.set(f.storage_path, f.id)
    if (data.length < 1000) break
    from += 1000
  }
}
const linkedFileIds = new Set()   // catalog_product_images'ta bağlı file_id'ler
{
  const pidList = products.map(p => p.id)
  for (let i = 0; i < pidList.length; i += 500) {
    const { data, error } = await supa.from('catalog_product_images')
      .select('file_id').in('product_id', pidList.slice(i, i + 500))
    if (error) { console.error('image önyükleme hatası:', error.message); process.exit(1) }
    for (const r of data) linkedFileIds.add(r.file_id)
  }
}
log(`Önyükleme: ${fileMap.size} mevcut YS- files, ${linkedFileIds.size} bağlı görsel`)

// ── Kaynak görsel envanteri ──
let totalSrc = 0
for (const p of products) {
  const dir = join(IMG_DIR, p.source_code)
  p._files = existsSync(dir)
    ? readdirSync(dir).filter(f => /\.webp$/i.test(f)).sort((a, b) => parseInt(a) - parseInt(b))
    : []
  totalSrc += p._files.length
}
log(`Kaynak görsel: ${totalSrc} dosya, ${products.filter(p => !p._files.length).length} klasörsüz ürün`)

// ── Yükleme döngüsü ──
let touched = 0, uploaded = 0, linked = 0, skipped = 0, consecErr = 0
const errors = []
const failStop = () => { consecErr++; return consecErr >= 5 }

for (const p of products) {
  for (let idx = 0; idx < p._files.length; idx++) {
    const srcAbs = join(IMG_DIR, p.source_code, p._files[idx])
    const n = idx + 1
    const storagePath = `catalog/${p.code}/${n}.webp`
    const originalName = `${p.code}-${n}.webp`
    const imageType = idx === 0 ? 'ana' : 'diger'
    try {
      let fid = fileMap.get(storagePath)
      if (fid && linkedFileIds.has(fid)) { skipped++; touched++; consecErr = 0; if (touched % 100 === 0) log(`İlerleme: ${touched}/${totalSrc} (%${(touched / totalSrc * 100).toFixed(1)}) — ↑${uploaded} +bağ${linked} atla${skipped}`); continue }

      if (!fid) {
        const buf = readFileSync(srcAbs)
        const up = await supa.storage.from(BUCKET).upload(storagePath, buf, { contentType: 'image/webp', upsert: true })
        if (up.error) throw new Error(`storage upload: ${up.error.message}`)
        const ins = await supa.from('files').insert({
          bucket: BUCKET, storage_path: storagePath, original_name: originalName,
          mime_type: 'image/webp', size_bytes: buf.length, category: 'image',
          entity_type: 'catalog_product', entity_id: String(p.id),
        }).select('id').single()
        if (ins.error) throw new Error(`files insert: ${ins.error.message}`)
        fid = ins.data.id
        fileMap.set(storagePath, fid)
        uploaded++
      }
      if (!linkedFileIds.has(fid)) {
        const li = await supa.from('catalog_product_images').insert({
          product_id: p.id, file_id: fid, image_type: imageType, sort_order: idx,
        })
        if (li.error) throw new Error(`image insert: ${li.error.message}`)
        linkedFileIds.add(fid)
        linked++
      }
      touched++; consecErr = 0
      if (touched % 100 === 0) log(`İlerleme: ${touched}/${totalSrc} (%${(touched / totalSrc * 100).toFixed(1)}) — ↑${uploaded} +bağ${linked} atla${skipped}`)
    } catch (e) {
      errors.push(`${storagePath}: ${e.message}`)
      log(`HATA ${storagePath}: ${e.message} (art arda ${consecErr + 1})`)
      if (failStop()) {
        log(`!!! DEVRE KESİCİ: art arda 5 hata. DURDU. Son hatalar:`)
        errors.slice(-5).forEach(x => console.error('   ' + x))
        console.log(`\nÖZET (kesildi): ${touched}/${totalSrc} işlendi, ${uploaded} yüklendi, ${linked} bağlandı, ${skipped} atlandı, ${errors.length} hata`)
        process.exit(2)
      }
    }
  }
}

log(`✓ BİTTİ: ${touched}/${totalSrc} işlendi — ${uploaded} yüklendi, ${linked} bağlandı, ${skipped} atlandı, ${errors.length} hata`)
if (errors.length) { console.log('Hatalar:'); errors.forEach(x => console.error('   ' + x)) }
