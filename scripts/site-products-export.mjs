#!/usr/bin/env node
/**
 * M1.4 — tekstilas.com `products.json` üreteci (tek kaynak: CRM).
 *
 * NEDEN
 *   products.json bugüne kadar ELLE bakılan bir dosyaydı; onu üreten hiçbir script yoktu
 *   (10 script yalnız okuyor). İki kataloğun elle birleşimiydi ve CRM'den kopabiliyordu.
 *   Bu script dosyayı CRM'den üretir → "ürünler tek yerden yönetilir" hedefi burada kapanır.
 *
 * CRM'İN SAHİPLENDİĞİ ALANLAR (her çalıştırmada yeniden yazılır)
 *   name  ← catalog_products.name
 *   slug  ← catalog_products.slug
 *   code  ← catalog_products.site_code   (müşteriye görünen kod; iç kod YS-… değil)
 *   cat   ← catalog_collections.code     (tesettur | premium | casual)
 *   type  ← product_categories.label via category_id (Elbise, Tunik …)
 *   fabric← fabric_types.label           (Pamuk Keten, Compact Penye …)
 *
 * SİTEDEN KORUNAN ALANLAR (CRM'de karşılığı yok — asla üretilmez)
 *   id                     Sitenin uuid5'leri; türetim girdisi bilinmiyor, KORUNUR.
 *   catalog_product_images Site kendi medyasını slug ile tutuyor (katalog-media/<slug>/N.webp);
 *                          CRM görselleri ayrı depoda (catalog/<kod>/N.webp). Karıştırılmaz.
 *   Yeni ürün için id üretilir (uuid5, slug'dan) ve görsel listesi boş gelir —
 *   görsel eklenene kadar rapor bunu "görselsiz" diye bildirir.
 *
 * KULLANIM
 *   node scripts/site-products-export.mjs                # kuru koşu: yalnız fark raporu
 *   node scripts/site-products-export.mjs --yaz          # products.json'ı güncelle
 *   node scripts/site-products-export.mjs --cikti /yol/products.json
 *
 * YETKİ
 *   Supabase Management API (SQL ucu). Token sırayla:
 *   $SUPABASE_ACCESS_TOKEN → macOS Anahtar Zinciri (Supabase CLI oturumu).
 *   Ayrı bir gizli anahtar gerekmez; DB şifresi hiç kullanılmaz.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const REF = process.env.SUPABASE_PROJECT_REF ?? 'kkxvoxeqfsaqzklrtgrw'
const HEDEF = arg('--cikti') ?? new URL('../../../uretim/products.json', import.meta.url).pathname
const YAZ = process.argv.includes('--yaz')

function arg(ad) { const i = process.argv.indexOf(ad); return i > -1 ? process.argv[i + 1] : null }

function token() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN
  try {
    const ham = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'], { encoding: 'utf8' }).trim()
    return ham.startsWith('go-keyring-base64:')
      ? Buffer.from(ham.slice('go-keyring-base64:'.length), 'base64').toString('utf8')
      : ham
  } catch {
    console.error('HATA: Supabase erişim anahtarı yok. `supabase login` çalıştır ya da SUPABASE_ACCESS_TOKEN ver.')
    process.exit(1)
  }
}

async function sorgu(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!r.ok) { console.error('HATA: Management API', r.status, await r.text()); process.exit(1) }
  return r.json()
}

/** uuid5 (RFC 4122, SHA-1) — yalnız YENİ ürünler için; mevcut id'ler korunur. */
function uuid5(ad, ns = '6ba7b810-9dad-11d1-80b4-00c04fd430c8') {
  const nsBuf = Buffer.from(ns.replace(/-/g, ''), 'hex')
  const h = createHash('sha1').update(Buffer.concat([nsBuf, Buffer.from(ad, 'utf8')])).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}

const rows = await sorgu(`
  select p.slug, p.name, p.site_code as code, col.code as cat,
         cat.label as type, ft.label as fabric
    from public.catalog_products p
    left join public.catalog_collections col on col.id = p.collection_id
    -- Tür etiketi category_id'de duruyor; type_id bu katalogda hiç kullanılmamış (0/672).
    left join public.product_categories  cat on cat.id = p.category_id
    left join public.fabric_types         ft on ft.id  = p.fabric_type_id
   where p.deleted_at is null and p.is_active and p.slug is not null
   order by p.catalog_id, p.sort_order, p.code`)

const oncekiler = existsSync(HEDEF) ? JSON.parse(readFileSync(HEDEF, 'utf8')) : []
const eski = new Map(oncekiler.map((p) => [p.slug, p]))

const cikti = []
const rapor = { yeni: [], degisen: [], gorselsiz: [], slugsuz: 0, kodsuz: [] }

for (const r of rows) {
  const o = eski.get(r.slug)
  if (!r.code) rapor.kodsuz.push(r.slug)
  const kayit = {
    id: o?.id ?? uuid5(r.slug),
    name: r.name,
    slug: r.slug,
    code: r.code ?? o?.code ?? null,
    cat: r.cat ?? null,
    type: r.type ?? null,
    fabric: r.fabric ?? null,
    product_types: r.type ? { name: r.type } : null,
    // Site medyası CRM'de yok → önceki dosyadan aynen taşınır.
    catalog_product_images: o?.catalog_product_images ?? [],
  }
  if (!o) rapor.yeni.push(r.slug)
  else {
    const fark = ['name', 'code', 'cat', 'type', 'fabric']
      .filter((k) => (o[k] ?? null) !== (kayit[k] ?? null))
      .map((k) => `${k}: ${JSON.stringify(o[k] ?? null)} → ${JSON.stringify(kayit[k] ?? null)}`)
    if (fark.length) rapor.degisen.push({ slug: r.slug, fark })
  }
  if (!kayit.catalog_product_images.length) rapor.gorselsiz.push(r.slug)
  cikti.push(kayit)
}

const dusen = oncekiler.filter((p) => !rows.some((r) => r.slug === p.slug))

console.log(`── CRM'den ${rows.length} ürün · önceki dosyada ${oncekiler.length}`)
console.log(`   yeni      : ${rapor.yeni.length}${rapor.yeni.length ? '  ' + rapor.yeni.slice(0, 5).join(', ') : ''}`)
console.log(`   değişen   : ${rapor.degisen.length}`)
for (const d of rapor.degisen.slice(0, 10)) console.log(`     ${d.slug}\n       ${d.fark.join('\n       ')}`)
if (rapor.degisen.length > 10) console.log(`     … ve ${rapor.degisen.length - 10} tane daha`)
console.log(`   DÜŞEN     : ${dusen.length}${dusen.length ? '  ⚠️  ' + dusen.slice(0, 5).map((p) => p.slug).join(', ') : ''}`)
console.log(`   görselsiz : ${rapor.gorselsiz.length}`)
if (rapor.kodsuz.length) console.log(`   ⚠️  site_code'u boş: ${rapor.kodsuz.length}`)

// Güvenlik freni: ürünlerin %5'inden fazlası düşüyorsa bir şey yanlıştır.
if (dusen.length > Math.max(5, oncekiler.length * 0.05)) {
  console.error(`\nDURDU: ${dusen.length} ürün listeden düşüyor (eşik ${Math.max(5, Math.floor(oncekiler.length * 0.05))}).`)
  console.error('Ürünler pasife alındıysa beklenen olabilir; --zorla ile geçilebilir.')
  if (!process.argv.includes('--zorla')) process.exit(1)
}

if (!YAZ) { console.log('\n(kuru koşu — dosya yazılmadı; yazmak için --yaz)'); process.exit(0) }
writeFileSync(HEDEF, JSON.stringify(cikti, null, 1) + '\n', 'utf8')
console.log(`\n✅ ${cikti.length} ürün yazıldı → ${HEDEF}`)
