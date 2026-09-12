#!/usr/bin/env node
// tekstilas.com `sk2627` sezonunu CRM'e aktarır.
//
// KOMUTLAR
//   node scripts/katalog-ice-aktar.mjs rapor    # SALT OKUMA — eşleştirme raporu
//   node scripts/katalog-ice-aktar.mjs yaz      # ürünleri ekler (idempotent)
//   node scripts/katalog-ice-aktar.mjs gorsel   # görselleri R2'ye taşır
//
// `rapor` canlıya HİÇBİR ŞEY YAZMAZ. `yaz` yalnız rapor okunduktan sonra
// çalıştırılmalıdır; çıktısı .ice-aktarma-rapor.json dosyasına yazılır.
//
// ORTAM (.env.deploy): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                      DOSYA_SERVIS_URL, DOSYA_SERVIS_SIRRI
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { KOLEKSIYON, icKodUret, esitle, raporOzeti } from './katalog-ice-aktar-esleme.mjs'

const SEZON = 'sk2627'
const KATALOG_ADI = 'Sonbahar/Kış 26-27'
const RAPOR = '.ice-aktarma-rapor.json'
const SITE = 'https://tekstilas.com/products.json'

function ortam() {
  const g = (k) => {
    const v = process.env[k]
    if (!v) throw new Error(`${k} tanımlı değil (.env.deploy okundu mu?)`)
    return v
  }
  return { url: g('SUPABASE_URL'), anahtar: g('SUPABASE_SERVICE_ROLE_KEY') }
}

/**
 * PostgREST'e satır yazar.
 *
 * NEDEN HAM SQL DEĞİL: ürün adlarında tırnak ve Türkçe karakter var; SQL
 * dizesi kurmak kaçış hatasına açık. PostgREST kaçışı kendi yapar.
 * `exec_sql` diye bir RPC bu projede YOKTUR (2026-09-12'de doğrulandı).
 *
 * @param don true ise eklenen satırlar geri döner (id almak için).
 */
async function yazSatir(o, tablo, satirlar, don = false) {
  const dizi = Array.isArray(satirlar) ? satirlar : [satirlar]
  if (!dizi.length) return []
  const r = await fetch(`${o.url}/rest/v1/${tablo}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${o.anahtar}`, apikey: o.anahtar,
      'content-type': 'application/json',
      prefer: don ? 'return=representation' : 'return=minimal',
    },
    body: JSON.stringify(dizi),
  })
  if (!r.ok) throw new Error(`Yazma başarısız (${r.status}) ${tablo}: ${(await r.text()).slice(0, 200)}`)
  return don ? r.json() : []
}

/** PostgREST üzerinden tablo okuma. */
async function oku(o, yol) {
  const r = await fetch(`${o.url}/rest/v1/${yol}`, {
    headers: { authorization: `Bearer ${o.anahtar}`, apikey: o.anahtar },
  })
  if (!r.ok) throw new Error(`Okuma başarısız (${r.status}): ${yol}`)
  return r.json()
}

async function siteUrunleri() {
  const r = await fetch(SITE, { cache: 'no-cache' })
  if (!r.ok) throw new Error(`products.json alınamadı (${r.status})`)
  const d = await r.json()
  const hepsi = Array.isArray(d) ? d : Object.values(d)[0]
  return hepsi.filter((p) => p.season === SEZON)
}

/** Etiket → id listesi. Çift kayıtlı etiketler birden fazla id taşır. */
function sozlukKur(satirlar, alan = 'label') {
  const m = new Map()
  for (const s of satirlar) {
    const k = s[alan]
    if (!k) continue
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(s.id)
  }
  return m
}

async function rapor() {
  const o = ortam()
  const urunler = await siteUrunleri()
  const sozluk = {
    turler: sozlukKur(await oku(o, 'product_categories?select=id,label')),
    kumaslar: sozlukKur(await oku(o, 'fabric_types?select=id,label')),
  }
  const mevcut = new Set((await oku(o, 'catalog_products?select=site_code')).map((r) => r.site_code))

  const sonuclar = urunler.map((u) => ({ ...esitle(u, sozluk), slug: u.slug, site_code: u.code, zatenVar: mevcut.has(u.code) }))
  const ozet = raporOzeti(sonuclar)
  const zatenVar = sonuclar.filter((s) => s.zatenVar).length

  const eksikKumaslar = [...new Set(sonuclar.flatMap((s) => (s.eksik ?? []).filter((e) => e.alan === 'kumas' && !e.adaylar).map((e) => e.deger)))]
  const belirsizTurler = [...new Set(sonuclar.flatMap((s) => (s.eksik ?? []).filter((e) => e.alan === 'tur' && e.adaylar).map((e) => `${e.deger} → ${e.adaylar.join('|')}`)))]

  writeFileSync(RAPOR, JSON.stringify({ ozet, zatenVar, eksikKumaslar, belirsizTurler, sonuclar }, null, 2))

  console.log(`── ${SEZON}: ${ozet.toplam} ürün`)
  console.log(`   hazır          : ${ozet.hazir}`)
  console.log(`   zaten CRM'de   : ${zatenVar}`)
  console.log(`   eksik kumaş    : ${eksikKumaslar.length} farklı değer`)
  for (const k of eksikKumaslar.slice(0, 10)) console.log(`     · ${k}`)
  if (eksikKumaslar.length > 10) console.log(`     … ve ${eksikKumaslar.length - 10} tane daha`)
  console.log(`   belirsiz tür   : ${belirsizTurler.length}`)
  for (const t of belirsizTurler) console.log(`     · ${t}`)
  console.log(`\nRapor: ${RAPOR}`)
  console.log('Bu komut canlıya HİÇBİR ŞEY YAZMADI.')
}

const komutlar = { rapor }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const k = process.argv[2]
  if (!komutlar[k]) {
    console.error('Kullanım: node scripts/katalog-ice-aktar.mjs <rapor|yaz|gorsel>')
    process.exit(1)
  }
  await komutlar[k]()
}
