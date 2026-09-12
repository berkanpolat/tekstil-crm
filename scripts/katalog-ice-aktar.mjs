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

// Yeni Sezon tür dalı. product_categories bir ağaçtır ve aynı etiket farklı
// dallarda tekrar eder ("Sweatshirt" 12 satır). Mevcut 672 ürünün TAMAMI bu
// dalı kullanıyor ve dal içinde etiketler TEKİL — eşleştirme burada yapılır.
const TUR_DALI = 358

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

/**
 * PostgREST üzerinden tablo okuma — SAYFALAMALI.
 *
 * PostgREST tek istekte varsayılan olarak en çok 1000 satır döndürür ve
 * fazlasını SESSİZCE kırpar. catalog_products içe aktarmadan sonra 1291
 * satıra çıkıyor; kırpılmış bir liste mükerrer denetimini bozar ve ikinci
 * çalıştırmada KOPYA ürün yaratır.
 */
export async function oku(o, yol) {
  const SAYFA = 1000
  const hepsi = []
  for (let bas = 0; ; bas += SAYFA) {
    const ayrac = yol.includes('?') ? '&' : '?'
    const r = await fetch(`${o.url}/rest/v1/${yol}${ayrac}limit=${SAYFA}&offset=${bas}`, {
      headers: { authorization: `Bearer ${o.anahtar}`, apikey: o.anahtar },
    })
    if (!r.ok) throw new Error(`Okuma başarısız (${r.status}): ${yol}`)
    const parca = await r.json()
    hepsi.push(...parca)
    if (parca.length < SAYFA) return hepsi
  }
}

async function siteUrunleri() {
  const r = await fetch(SITE, { cache: 'no-cache' })
  if (!r.ok) throw new Error(`products.json alınamadı (${r.status})`)
  const d = await r.json()
  const hepsi = Array.isArray(d) ? d : Object.values(d)[0]
  return hepsi.filter((p) => p.season === SEZON)
}

/**
 * Türkçe etiketten `key` üretir: küçük harf, Türkçe karakterler sadeleştirilmiş,
 * boşluk/ayraç `_`. `fabric_types` ve `product_categories` kayıtları TEK bu
 * fonksiyonla anahtarlanır — iki ayrı yerde kopyalanmaz.
 */
function anahtarla(s) {
  return s.toLocaleLowerCase('tr')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

/**
 * Çift kayıtlı etiketleri mevcut KULLANIMA bakarak teke indirir.
 *
 * Aynı etiket birden çok satırda olabiliyor (Polyester 4, Saten 3…).
 * Satırlardan TAM OLARAK BİRİ mevcut ürünlerce kullanılıyorsa onu seçeriz —
 * bu tahmin değil, mevcut veriyle tutarlılıktır. Hiçbiri ya da birden fazlası
 * kullanımdaysa etiket belirsiz kalır (liste olduğu gibi bırakılır).
 */
function kullanimaGoreTekille(sozluk, kullanilanIdler) {
  const cozulen = new Map()
  for (const [etiket, idler] of sozluk) {
    if (idler.length === 1) { cozulen.set(etiket, idler); continue }
    const kullanilan = idler.filter((id) => kullanilanIdler.has(id))
    cozulen.set(etiket, kullanilan.length === 1 ? kullanilan : idler)
  }
  return cozulen
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
    turler: sozlukKur(await oku(o, `product_categories?select=id,label&parent_id=eq.${TUR_DALI}`)),
    kumaslar: sozlukKur(await oku(o, 'fabric_types?select=id,label')),
  }
  const mevcut = new Set((await oku(o, 'catalog_products?select=site_code')).map((r) => r.site_code))

  const sonuclar = urunler.map((u) => ({ ...esitle(u, sozluk), slug: u.slug, site_code: u.code, zatenVar: mevcut.has(u.code) }))
  const ozet = raporOzeti(sonuclar)
  const zatenVar = sonuclar.filter((s) => s.zatenVar).length

  const eksikKumaslar = [...new Set(sonuclar.flatMap((s) => (s.eksik ?? []).filter((e) => e.alan === 'kumas' && !e.adaylar).map((e) => e.deger)))]
  const belirsizTurler = [...new Set(sonuclar.flatMap((s) => (s.eksik ?? []).filter((e) => e.alan === 'tur' && e.adaylar).map((e) => `${e.deger} → ${e.adaylar.join('|')}`)))]
  // TUR_DALI'nda hiç karşılığı olmayan etiketler — belirsiz değil, tamamen YOK.
  // `yaz` komutunda yeni product_categories satırı olarak açılacak (Görev 3).
  const eksikTurler = [...new Set(sonuclar.flatMap((s) => (s.eksik ?? []).filter((e) => e.alan === 'tur' && !e.adaylar).map((e) => e.deger)))]

  writeFileSync(RAPOR, JSON.stringify({ ozet, zatenVar, eksikKumaslar, belirsizTurler, eksikTurler, sonuclar }, null, 2))

  console.log(`── ${SEZON}: ${ozet.toplam} ürün`)
  console.log(`   hazır          : ${ozet.hazir}`)
  console.log(`   zaten CRM'de   : ${zatenVar}`)
  console.log(`   eksik kumaş    : ${eksikKumaslar.length} farklı değer`)
  for (const k of eksikKumaslar.slice(0, 10)) console.log(`     · ${k}`)
  if (eksikKumaslar.length > 10) console.log(`     … ve ${eksikKumaslar.length - 10} tane daha`)
  console.log(`   belirsiz tür   : ${belirsizTurler.length}`)
  for (const t of belirsizTurler) console.log(`     · ${t}`)
  console.log(`   eksik tür      : ${eksikTurler.length} farklı değer`)
  for (const t of eksikTurler) console.log(`     · ${t}`)
  console.log(`\nRapor: ${RAPOR}`)
  console.log('Bu komut canlıya HİÇBİR ŞEY YAZMADI.')
}

async function yaz() {
  if (!existsSync(RAPOR)) throw new Error(`${RAPOR} yok — önce "rapor" komutunu çalıştırın.`)
  const r = JSON.parse(readFileSync(RAPOR, 'utf8'))
  const o = ortam()

  // 1a) Sınıflandırılmamış kumaş grubu (yoksa açılır).
  //
  // NEDEN AYRI GRUP: fabric_types.group_id zorunlu ve mevcut 9 grup gerçek
  // iş sınıflandırmasıdır (dokuma/örme/denim/…). Siteden gelen 33 yeni kumaşı
  // bunlara dağıtmak tekstil bilgisi gerektiren bir karardır ve tahminle
  // yapılamaz — yanlış grup, yanlış maliyet ve yanlış raporlama demektir.
  // Hepsi görünür biçimde burada toplanır; doğru grupları CRM arayüzünden
  // tek seferde atanabilir.
  const eksik = r.eksikKumaslar ?? []
  let grup = null
  if (eksik.length) {
    grup = (await oku(o, 'fabric_groups?select=id&key=eq.siniflandirilmamis'))[0]
    if (!grup) {
      grup = (await yazSatir(o, 'fabric_groups', {
        key: 'siniflandirilmamis',
        label: 'Sınıflandırılmamış (site aktarımı)',
      }, true))[0]
      console.log(`   yeni kumaş grubu açıldı: ${grup.id} (siniflandirilmamis)`)
    }
  }

  // 1b) Eksik kumaşları ekle (uydurma eşleştirme YOK — yeni kayıt açılır).
  if (eksik.length) {
    const mevcutKumas = new Set((await oku(o, 'fabric_types?select=label')).map((x) => x.label))
    const mevcutAnahtar = new Set((await oku(o, 'fabric_types?select=key')).map((x) => x.key))
    const yeniler = []
    for (const label of eksik) {
      if (!label || mevcutKumas.has(label)) continue
      let k = anahtarla(label)
      let n = 2
      while (mevcutAnahtar.has(k)) k = `${anahtarla(label)}_${n++}` // çakışma
      mevcutAnahtar.add(k)
      yeniler.push({ label, key: k, group_id: grup.id })
    }
    await yazSatir(o, 'fabric_types', yeniler)
    console.log(`   ${yeniler.length} yeni kumaş eklendi (grup: ${grup.id})`)
  }

  // 1c) Eksik türleri Yeni Sezon dalına ekle (parent 358). `key` global TEKİL
  // olduğundan (product_categories_key_key) çakışma denetimi ALL kategoriler
  // üzerinden yapılır, yalnız 358 altında değil.
  const eksikTur = r.eksikTurler ?? []
  if (eksikTur.length) {
    const mevcutTur = new Set((await oku(o, 'product_categories?select=label&parent_id=eq.358')).map((x) => x.label))
    const mevcutAnahtar = new Set((await oku(o, 'product_categories?select=key')).map((x) => x.key))
    const yeniTurler = []
    for (const label of eksikTur) {
      if (!label || mevcutTur.has(label)) continue
      let k = 'ys_' + anahtarla(label)
      let n = 2
      while (mevcutAnahtar.has(k)) k = `ys_${anahtarla(label)}_${n++}` // çakışma
      mevcutAnahtar.add(k)
      yeniTurler.push({ label, key: k, parent_id: TUR_DALI })
    }
    await yazSatir(o, 'product_categories', yeniTurler)
    console.log(`   ${yeniTurler.length} yeni tür eklendi (Yeni Sezon dalı)`)
  }

  // 2) Katalog satırı (varsa yeniden kullan — idempotent)
  let katalog = (await oku(o, `catalogs?select=id&name=eq.${encodeURIComponent(KATALOG_ADI)}`))[0]
  if (!katalog) {
    katalog = (await yazSatir(o, 'catalogs', { name: KATALOG_ADI, season: SEZON, year: 2026 }, true))[0]
  }
  console.log(`   katalog id: ${katalog.id}`)

  // 3) Sözlükleri YENİDEN oku — yeni kumaşlar ve türler artık var
  const sozluk = {
    turler: sozlukKur(await oku(o, `product_categories?select=id,label&parent_id=eq.${TUR_DALI}`)),
    kumaslar: sozlukKur(await oku(o, 'fabric_types?select=id,label')),
  }

  // 3b) Çift kayıtlı etiketleri mevcut KULLANIMA bakarak çöz. Kural simetrik
  // uygulanır (tür tarafında bugün belirsizlik yok ama aynı mantık geçerli).
  const kullanilanKumas = new Set(
    (await oku(o, 'catalog_products?select=fabric_type_id')).map((x) => x.fabric_type_id).filter(Boolean))
  const kullanilanTur = new Set(
    (await oku(o, 'catalog_products?select=category_id')).map((x) => x.category_id).filter(Boolean))
  sozluk.kumaslar = kullanimaGoreTekille(sozluk.kumaslar, kullanilanKumas)
  sozluk.turler = kullanimaGoreTekille(sozluk.turler, kullanilanTur)

  const urunler = await siteUrunleri()
  const mevcutKodlar = new Set((await oku(o, 'catalog_products?select=code')).map((x) => x.code))
  const mevcutSite = new Set((await oku(o, 'catalog_products?select=site_code')).map((x) => x.site_code))

  const satirlar = []
  const atlanan = []
  const belirsiz = []
  let kumassiz = 0
  for (const u of urunler) {
    if (mevcutSite.has(u.code)) { atlanan.push(u.code); continue }
    // Yalnız kumaş eksik/belirsizse ürün yine eklenir, fabric_type_id null
    // kalır — rastgele satır seçmek yanlış maliyet demektir; boş alan
    // dürüsttür ve CRM arayüzünden tek seferde doldurulabilir.
    const e = esitle(u, sozluk, { kumassizKabul: true })
    if (!e.ok) { belirsiz.push({ site_code: u.code, eksik: e.eksik }); continue }
    if (e.kayit.fabric_type_id === null) kumassiz++
    satirlar.push({ catalog_id: katalog.id, code: icKodUret(mevcutKodlar), ...e.kayit })
  }

  if (!satirlar.length) console.log('   yazılacak yeni ürün yok.')
  else {
    // PostgREST tek istekteki dizinin tamamını TEK işlemde yazar:
    // biri düşerse hiçbiri yazılmaz.
    await yazSatir(o, 'catalog_products', satirlar)
    console.log(`   ${satirlar.length} ürün eklendi (${kumassiz} tanesi kumaşsız — fabric_type_id null)`)
  }
  console.log(`   zaten vardı: ${atlanan.length} · belirsiz kaldı: ${belirsiz.length}`)
  for (const b of belirsiz.slice(0, 10)) console.log(`     · ${b.site_code}: ${b.eksik.map((x) => x.alan + '=' + x.deger).join(', ')}`)
}

const komutlar = { rapor, yaz }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const k = process.argv[2]
  if (!komutlar[k]) {
    console.error('Kullanım: node scripts/katalog-ice-aktar.mjs <rapor|yaz|gorsel>')
    process.exit(1)
  }
  await komutlar[k]()
}
