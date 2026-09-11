#!/usr/bin/env node
// Supabase Storage → Cloudflare R2 taşıma aracı.
//
// UYGULAMA: Görev 10 brief'i + kontrolör kararları (K1-K6).
//   .superpowers/sdd/2026-09-11-r2-dosya-katmani/gorev-10-brief.md
//
// ÇALIŞTIRMA SIRASI (dördü de bağımsız komut, sırayla ve elle çalıştırılır):
//   1. node scripts/r2-tasima.mjs indir     # Supabase'den yerel .tasima/ham'a indirir
//   2. node scripts/r2-tasima.mjs kucuk     # yerelde görsellerden 160/480 WebP üretir
//   3. node scripts/r2-tasima.mjs yukle     # yerelden R2'ye yükler (Worker /y ucundan)
//   4. node scripts/r2-tasima.mjs dogrula   # sayı/boyut karşılaştırır, R2 tarafını denetler
//
// BEŞİNCİ, BAĞIMSIZ komut — tek seferlik taşımanın parçası DEĞİL, SÜREKLİ:
//   5. node scripts/r2-tasima.mjs kucuk-tamamla
//      Talep girişi (intake-request) kenar işlevi görselleri Worker'ın /y
//      ucuna DOĞRUDAN R2'ye yazıyor (bkz. tasarım §5.4) ve orada küçük resim
//      ÜRETMİYOR — CPU/bağımlılık maliyeti ve "talep girişi asla görsel
//      yüzünden düşmemeli" ilkesi yüzünden. Yani taşımadan SONRA gelen her
//      yeni talep görseli küçüksüz kalır. Bu komut `files` tablosundaki
//      görselleri tarar, küçüğü R2'de OLMAYANLARI bulur, yalnız onları
//      indirip küçültüp yükler. NE ZAMAN ÇALIŞTIRILIR: talep girişi toplu
//      geldikten sonra (ör. kampanya) ya da periyodik (günlük/haftalık cron).
//      Ayrı bir durum anahtarı (`kucukTamamlanan`) kullanır — bkz. aşağıdaki
//      "kucuk-tamamla" bölümündeki JSDoc.
//
// Her aşama YENİDEN BAŞLATILABİLİR: tamamlananlar .tasima-durum.json'da
// tutulur, ikinci çalıştırma kaldığı yerden sürer. `yukle` aşaması ayrıca
// Worker'ın `/y` ucunun servis sırrıyla ÜZERİNE YAZABİLMESİNE güvenir
// (bkz. services/dosya-worker/src/index.js → dosyaYukle, "sirla" dalı):
// çerezle gelen insan yüklemesi 409 alır ama servis sırrıyla gelen taşıma
// isteği aynı yolu tekrar yazabilir — bu yüzden `yukle` durum dosyası
// bozulsa/silinse bile güvenle tekrar çalıştırılabilir.
//
// GEREKLİ ORTAM DEĞİŞKENLERİ (.env'den okunur, process.env öncelikli)
//   SUPABASE_URL              — yoksa VITE_SUPABASE_URL'e düşer
//   SUPABASE_SERVICE_ROLE_KEY — Supabase panel > Project Settings > API
//   DOSYA_SERVIS_URL          — örn. https://dosya.tekstilas.com
//   DOSYA_SERVIS_SIRRI        — Worker'a `wrangler secret put SERVIS_SIRRI` ile
//                                konan değerle AYNI olmalı
//
// ⚠️ `kucukYolu()`'nun ürettiği anahtar biçimi Worker'daki `r2Anahtar`'dan
// (services/dosya-worker/src/index.js) ELLE KOPYALANDI — otomatik paylaşım
// yok (ayrı çalışma zamanları: bu betik Node, Worker Cloudflare Workers).
// Worker'da bu biçim değişirse burası da elle güncellenmeli; ayrışırsa
// `tests/unit/tasimaYol.test.ts` KIRILIR (bu kasıtlı bir erken uyarı —
// brief'teki K2 gereği).
//
// ⚠️ [Görev 10 düzeltme turu 1 — K1] Bu betik MIME'ye göre KENDİ TARAFINDA
// ön-ret YAPMAZ: Worker'ın `/y` ucu servis sırrı yolunda (yalnız bu betiğin
// kullandığı yol) MIME kısıtı uygulamıyor — tarihsel veride bugünkü sıkı
// listeye uymayan dosyalar (video/mp4, NULL mime) var ve taşınmak zorunda.
// `reddedilen` sayacı yalnız Worker'dan GERÇEKTEN dönen 4xx yanıtları sayar,
// betiğin kendi tahminiyle atlama YAPMAZ.

import { readFile, writeFile, mkdir, stat, rm } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { kucukYolu, gorselMi } from './r2-tasima-yardimci.mjs'

const execFileAsync = promisify(execFile)

export { kucukYolu, gorselMi }

const KLASOR = '.tasima'
const DURUM = '.tasima-durum.json'
const ESZAMAN = 6
const BOYUTLAR = [160, 480]
const KOVA = 'documents'
// NOT: burada bilerek ne bir AZAMI_BAYT ne de bir IZINLI_MIME listesi VAR —
// yani betik boyut/tip için kendi tarafında YEREL ÖN-RET yapmıyor (K1,
// düzeltme turu 1): Worker'ın servis-sırrı yolu (bu betiğin kullandığı yol)
// MIME kısıtı uygulamıyor, boyut sınırı ise zaten Worker'da akış sırasında
// gerçek bayt sayısıyla denetleniyor. Tek doğruluk kaynağı Worker'ın
// kendisi; her nesne gönderilip GERÇEK yanıt sayılır.

// ---------------------------------------------------------------------------
// Ortam
// ---------------------------------------------------------------------------

/** `.env` dosyasını basitçe ayrıştırır (yorum satırları ve boş satırlar hariç). */
function envDosyasiniOku() {
  if (!existsSync('.env')) return {}
  try {
    const map = {}
    for (const satir of readFileSync('.env', 'utf8').split('\n')) {
      const t = satir.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      map[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
    }
    return map
  } catch (e) {
    throw new Error(`.env okunamadı: ${e.message}`)
  }
}

function ortam() {
  const dosya = envDosyasiniOku()
  const al = (k) => process.env[k] || dosya[k]
  const g = (k, yedek) => {
    const v = al(k) ?? yedek
    if (!v) throw new Error(`${k} tanımlı değil (.env veya ortam değişkeni olarak ayarlayın)`)
    return v
  }
  return {
    supabaseUrl: g('SUPABASE_URL', al('VITE_SUPABASE_URL')),
    servisAnahtar: g('SUPABASE_SERVICE_ROLE_KEY'),
    dosyaUrl: g('DOSYA_SERVIS_URL'),
    sir: g('DOSYA_SERVIS_SIRRI'),
  }
}

// ---------------------------------------------------------------------------
// Durum dosyası
// ---------------------------------------------------------------------------

async function durumOku() {
  if (!existsSync(DURUM)) return { indirilen: [], kucuk: [], yuklenen: [], kucukTamamlanan: [] }
  let ham
  try {
    ham = await readFile(DURUM, 'utf8')
  } catch (e) {
    throw new Error(`${DURUM} okunamadı: ${e.message}`)
  }
  try {
    const d = JSON.parse(ham)
    return {
      indirilen: Array.isArray(d.indirilen) ? d.indirilen : [],
      kucuk: Array.isArray(d.kucuk) ? d.kucuk : [],
      yuklenen: Array.isArray(d.yuklenen) ? d.yuklenen : [],
      // Ayrı anahtar (K3, madde C): `yuklenen` yalnız BU makinedeki tek
      // seferlik taşımayı bilir. `kucuk-tamamla` sürekli/periyodik çalışır
      // ve gerçeği R2'nin kendisinden sorar (bkz. kucukTamamla()); bu liste
      // yalnız zaten denetlenmiş kayıtları TEKRAR denetlememek için önbellektir.
      kucukTamamlanan: Array.isArray(d.kucukTamamlanan) ? d.kucukTamamlanan : [],
    }
  } catch (e) {
    throw new Error(
      `${DURUM} bozuk JSON içeriyor (${e.message}). Elle onarın ya da dosyayı silip ` +
        `yeniden başlatın (zaten tamamlanan işler bir sonraki taramada atlanacaktır).`,
    )
  }
}

async function durumYaz(d) {
  try {
    await writeFile(DURUM, JSON.stringify(d, null, 2))
  } catch (e) {
    throw new Error(`${DURUM} yazılamadı: ${e.message}`)
  }
}

// ---------------------------------------------------------------------------
// Supabase okuma
// ---------------------------------------------------------------------------

/** files tablosundaki tüm aktif (silinmemiş) kayıtlar, sayfalı. */
async function kayitlar(o) {
  const hepsi = []
  for (let sayfa = 0; ; sayfa++) {
    let r
    try {
      r = await fetch(
        `${o.supabaseUrl}/rest/v1/files?select=storage_path,mime_type,size_bytes` +
          `&deleted_at=is.null&order=id&limit=1000&offset=${sayfa * 1000}`,
        { headers: { authorization: `Bearer ${o.servisAnahtar}`, apikey: o.servisAnahtar } },
      )
    } catch (e) {
      throw new Error(`Supabase'e bağlanılamadı (files sorgusu): ${e.message}`)
    }
    if (!r.ok) {
      throw new Error(`files tablosu okunamadı: HTTP ${r.status} — ${await guvenliMetin(r)}`)
    }
    let parca
    try {
      parca = await r.json()
    } catch (e) {
      throw new Error(`files yanıtı bozuk JSON: ${e.message}`)
    }
    hepsi.push(...parca)
    if (parca.length < 1000) break
  }
  return hepsi
}

async function guvenliMetin(r) {
  try {
    return await r.text()
  } catch {
    return '(gövde okunamadı)'
  }
}

// ---------------------------------------------------------------------------
// Eşzamanlı kuyruk
// ---------------------------------------------------------------------------

/**
 * İş listesini sınırlı eşzamanlılıkla işler; her iş kendi hatasını yakalar.
 *
 * @param araYaz — [Görev 10 düzeltme turu 1 — Ö1] isteğe bağlı, her 100 işte
 *   bir çağrılan ara-kayıt geri çağrısı (ör. `() => durumYaz(durum)`). `yukle`
 *   aşaması ~11.000 istekten oluşabiliyor; durum yalnız aşama SONUNDA
 *   yazılırsa sona yakın bir çökme neredeyse tüm aşamanın tekrarlanmasına
 *   yol açar (veri kaybı değil ama ciddi bir güven zayıflığı — Worker'ın
 *   servis sırrıyla üzerine yazabilmesi zaten tekrarı ucuzlaştırıyor, ama
 *   yine de gereksiz). Ara kayıt kendi hatasını yakalar, betiği DURDURMAZ.
 */
async function kuyruk(isler, calis, araYaz) {
  let sira = 0
  let bitti = 0
  let hataSayisi = 0
  const isci = async () => {
    while (sira < isler.length) {
      const i = sira++
      try {
        await calis(isler[i])
      } catch (e) {
        // calis() içindeki fonksiyonlar kendi hatalarını zaten yakalayıp
        // konsola yazar; buraya sızan beklenmeyen bir istisnadır — betik
        // yine de durmamalı, sonraki işe geçer.
        hataSayisi++
        console.error(`  beklenmeyen hata: ${e.message}`)
      }
      if (++bitti % 100 === 0) {
        console.log(`  ${bitti}/${isler.length}`)
        if (araYaz) {
          try {
            await araYaz()
          } catch (e) {
            console.error(`  ara durum kaydı başarısız (devam ediliyor): ${e.message}`)
          }
        }
      }
    }
  }
  await Promise.all(Array.from({ length: ESZAMAN }, isci))
  return { hataSayisi }
}

// ---------------------------------------------------------------------------
// Aşama 1: indir
// ---------------------------------------------------------------------------

async function indir() {
  const o = ortam()
  const durum = await durumOku()
  const tamam = new Set(durum.indirilen)
  const liste = (await kayitlar(o)).filter((k) => !tamam.has(k.storage_path))
  console.log(`İndirilecek: ${liste.length}`)

  let basarisiz = 0
  await kuyruk(liste, async (k) => {
    const hedef = path.join(KLASOR, 'ham', k.storage_path)
    try {
      await mkdir(path.dirname(hedef), { recursive: true })
    } catch (e) {
      console.error(`  klasör oluşturulamadı: ${k.storage_path} — ${e.message}`)
      basarisiz++
      return
    }

    let imza
    try {
      imza = await fetch(
        `${o.supabaseUrl}/storage/v1/object/sign/${KOVA}/${encodeURI(k.storage_path)}`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${o.servisAnahtar}`,
            apikey: o.servisAnahtar,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ expiresIn: 600 }),
        },
      )
    } catch (e) {
      console.error(`  imza isteği başarısız (ağ): ${k.storage_path} — ${e.message}`)
      basarisiz++
      return
    }
    if (!imza.ok) {
      console.error(`  imza yok: ${k.storage_path} (HTTP ${imza.status})`)
      basarisiz++
      return
    }
    let signedURL
    try {
      ;({ signedURL } = await imza.json())
    } catch (e) {
      console.error(`  imza yanıtı bozuk: ${k.storage_path} — ${e.message}`)
      basarisiz++
      return
    }

    let r
    try {
      r = await fetch(`${o.supabaseUrl}/storage/v1${signedURL}`)
    } catch (e) {
      console.error(`  indirme isteği başarısız (ağ): ${k.storage_path} — ${e.message}`)
      basarisiz++
      return
    }
    if (!r.ok) {
      console.error(`  indirilemedi: ${k.storage_path} (HTTP ${r.status})`)
      basarisiz++
      return
    }

    try {
      await writeFile(hedef, Buffer.from(await r.arrayBuffer()))
    } catch (e) {
      console.error(`  yazılamadı: ${k.storage_path} — ${e.message}`)
      basarisiz++
      return
    }
    durum.indirilen.push(k.storage_path)
  }, () => durumYaz(durum))
  await durumYaz(durum)
  console.log(`İndirilen toplam: ${durum.indirilen.length} · bu çalıştırmada başarısız: ${basarisiz}`)
}

// ---------------------------------------------------------------------------
// Aşama 2: kucuk
// ---------------------------------------------------------------------------

/**
 * Yerelde duran bir orijinalden 160/480 WebP küçükleri üretip `.tasima/ham`
 * altına yazar. `kucuk()` VE `kucukTamamla()` bu fonksiyonu PAYLAŞIR — iki
 * ayrı kopya tutmamak için buraya çıkarıldı.
 *
 * @returns true → ikisi de üretildi, false → en az biri başarısız (çağıran loglar).
 */
async function kucukleriUretVeKaydet(kaynakDosya, orijinalYol) {
  let hataVar = false
  for (const boyut of BOYUTLAR) {
    const hedef = path.join(KLASOR, 'ham', kucukYolu(orijinalYol, boyut))
    try {
      await mkdir(path.dirname(hedef), { recursive: true })
      await sharp(kaynakDosya)
        .resize({ width: boyut, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(hedef)
    } catch (e) {
      console.error(`  küçültülemedi (${boyut}): ${orijinalYol} — ${e.message}`)
      hataVar = true
    }
  }
  return !hataVar
}

async function kucuk() {
  const o = ortam()
  const durum = await durumOku()
  const tamam = new Set(durum.kucuk)
  const liste = (await kayitlar(o)).filter((k) => gorselMi(k.mime_type) && !tamam.has(k.storage_path))
  console.log(`Küçültülecek: ${liste.length}`)

  let basarisiz = 0
  await kuyruk(liste, async (k) => {
    const kaynak = path.join(KLASOR, 'ham', k.storage_path)
    if (!existsSync(kaynak)) {
      console.error(`  kaynak yerelde yok (önce 'indir' çalıştırılmalı): ${k.storage_path}`)
      basarisiz++
      return
    }
    const tamamMi = await kucukleriUretVeKaydet(kaynak, k.storage_path)
    if (!tamamMi) { basarisiz++; return }
    durum.kucuk.push(k.storage_path)
  }, () => durumYaz(durum))
  await durumYaz(durum)
  console.log(`Küçültülen toplam: ${durum.kucuk.length} · bu çalıştırmada başarısız: ${basarisiz}`)
}

// ---------------------------------------------------------------------------
// Aşama 3: yukle
// ---------------------------------------------------------------------------

/**
 * Bir nesneyi Worker'ın `/y` ucuna servis sırrıyla PUT eder. `yukle()` VE
 * `kucukTamamla()` bu fonksiyonu PAYLAŞIR — Worker'a giden çağrı biçimi
 * (başlıklar, sır) tek yerde tutulur, iki kopya ayrışma riski taşımaz.
 *
 * ASLA fırlatmaz: ağ hatası da bir { ok:false } sonucuna çevrilir, çağıran
 * kendi sayaçlarını (başarısız/reddedilen) buna göre güncelleyebilir.
 */
async function nesneYuklePUT(o, yol, mime, govde) {
  let r
  try {
    r = await fetch(`${o.dosyaUrl}/y?yol=${encodeURIComponent(yol)}`, {
      method: 'PUT',
      headers: {
        'content-type': mime,
        'content-length': String(govde.byteLength),
        'x-servis-sirri': o.sir,
      },
      body: govde,
    })
  } catch (e) {
    return { ok: false, agHatasi: true, mesaj: e.message }
  }
  if (r.ok) return { ok: true, status: r.status }
  // Worker hata gövdesi { hata: '<kısa metin>' } biçimindedir (bkz. K4).
  let hata = ''
  try {
    hata = (await r.json())?.hata || ''
  } catch {
    // Gövde JSON değilse yok say; durum kodu yeterli bilgi verir.
  }
  return { ok: false, status: r.status, hata }
}

async function yukle() {
  const o = ortam()
  const durum = await durumOku()
  const tamam = new Set(durum.yuklenen)
  const kayit = await kayitlar(o)

  const isler = []
  for (const k of kayit) {
    isler.push({ yol: k.storage_path, mime: k.mime_type || 'application/octet-stream' })
    if (gorselMi(k.mime_type)) {
      for (const boyut of BOYUTLAR) isler.push({ yol: kucukYolu(k.storage_path, boyut), mime: 'image/webp' })
    }
  }
  const kalan = isler.filter((i) => !tamam.has(i.yol))
  console.log(`Yüklenecek nesne: ${kalan.length}`)

  let basarisiz = 0
  let reddedilen = 0
  await kuyruk(kalan, async (i) => {
    const kaynak = path.join(KLASOR, 'ham', i.yol)
    if (!existsSync(kaynak)) {
      // Küçük resim üretimi HEIC/HEIF gibi tiplerde atlanmış olabilir;
      // orijinal içinse 'indir' aşaması eksik demektir. İkisi de durmaya
      // gerek yoktur — sayılıp raporlanır.
      console.error(`  kaynak yerelde yok: ${i.yol}`)
      basarisiz++
      return
    }
    // BİLEREK yerel MIME/boyut ön-reddi YOK (K1, düzeltme turu 1): tek
    // doğruluk kaynağı Worker'ın kendisidir — betik kendi tahminiyle
    // atlama yapmaz, her nesneyi Worker'a gönderip GERÇEK yanıtı sayar.
    let govde
    try {
      govde = await readFile(kaynak)
    } catch (e) {
      console.error(`  okunamadı: ${i.yol} — ${e.message}`)
      basarisiz++
      return
    }

    const sonuc = await nesneYuklePUT(o, i.yol, i.mime, govde)
    if (!sonuc.ok) {
      if (sonuc.agHatasi) {
        console.error(`  yükleme isteği başarısız (ağ): ${i.yol} — ${sonuc.mesaj}`)
        basarisiz++
        return
      }
      console.error(`  yüklenemedi: ${i.yol} (HTTP ${sonuc.status}${sonuc.hata ? ` — ${sonuc.hata}` : ''})`)
      if (sonuc.status === 415 || sonuc.status === 413 || sonuc.status === 400) reddedilen++
      else basarisiz++
      return
    }
    durum.yuklenen.push(i.yol)
  }, () => durumYaz(durum))
  await durumYaz(durum)
  console.log(
    `Yüklenen toplam: ${durum.yuklenen.length} · bu çalıştırmada başarısız: ${basarisiz} · ` +
      `reddedilen (Worker kuralları): ${reddedilen}`,
  )
}

// ---------------------------------------------------------------------------
// Aşama 4: dogrula
// ---------------------------------------------------------------------------

/**
 * Yerel klasör TEK BAŞINA "R2'ye gerçekten gitti mi" sorusunu yanıtlamaz
 * (bkz. K6) — bu yüzden R2 tarafı da denetlenir.
 *
 * SINIR: Worker'ın listeleme ucu BİLEREK yoktur (dosya-worker/src/index.js
 * başlığı) ve `/d/<yol>` okuma ucu yalnız kullanıcı oturum çerezini kabul
 * eder — servis sırrıyla okunamaz (bkz. K3: sır yalnız `/y` yazmasında
 * geçerli). Yani bu betikten R2'deki nesneleri tek tek "var mı" diye
 * sorgulamanın kimlik doğrulamalı bir yolu yok. Bu yüzden R2 tarafı,
 * `yukle` aşamasının bıraktığı durum dosyasıyla (her başarılı PUT'tan
 * SONRA yazılır, bkz. `yukle()`) beklenen nesne sayısı karşılaştırılarak
 * denetlenir: `yuklenen.length` beklenenden azsa taşıma eksiktir. Tam bir
 * canlı R2 taraması gerekiyorsa Cloudflare panelinden ya da `wrangler r2
 * object list` ile (bu betiğin kapsamı dışında, ayrı bir Cloudflare oturumu
 * gerektirir) yapılmalıdır.
 */
async function dogrula() {
  const o = ortam()
  const kayit = await kayitlar(o)
  const durum = await durumOku()

  // 1) Yerel klasör tutarlılığı (indirilen aşaması).
  let yerelEksik = 0
  let boyutFarki = 0
  await kuyruk(kayit, async (k) => {
    const yerel = path.join(KLASOR, 'ham', k.storage_path)
    if (!existsSync(yerel)) {
      console.error(`  YEREL YOK: ${k.storage_path}`)
      yerelEksik++
      return
    }
    let s
    try {
      s = await stat(yerel)
    } catch (e) {
      console.error(`  stat başarısız: ${k.storage_path} — ${e.message}`)
      yerelEksik++
      return
    }
    if (k.size_bytes && Number(k.size_bytes) !== s.size) {
      console.error(`  BOYUT FARKI: ${k.storage_path} — DB ${k.size_bytes}, yerel ${s.size}`)
      boyutFarki++
    }
  })

  // 2) Beklenen nesne sayısı (orijinal + görsellerin 160/480 küçükleri).
  let beklenen = kayit.length
  for (const k of kayit) if (gorselMi(k.mime_type)) beklenen += BOYUTLAR.length
  const yuklenenSayisi = durum.yuklenen.length
  const fark = beklenen - yuklenenSayisi
  if (fark > 0) {
    console.error(`  R2'YE EKSİK: durum dosyasına göre ${fark} nesne hiç yüklenmemiş.`)
  } else if (fark < 0) {
    // Normalde olmaz (durum dosyası yalnız başarılı PUT sonrası büyür) ama
    // durum dosyası elle düzenlenmiş/bozulmuşsa sinyal vermek isteriz.
    console.error(`  BEKLENMEYEN: durum dosyasında beklenenden ${-fark} fazla nesne var.`)
  }

  console.log(`\nKayıt (DB): ${kayit.length}`)
  console.log(`Yerel: eksik ${yerelEksik} · boyut farkı ${boyutFarki}`)
  console.log(`R2'ye yüklenmesi beklenen nesne: ${beklenen} (orijinal ${kayit.length} + küçükler)`)
  console.log(`Durum dosyasına göre R2'ye yüklenen: ${yuklenenSayisi} · fark: ${fark}`)

  if (yerelEksik || boyutFarki || fark !== 0) {
    console.log('\nSONUÇ: DOĞRULAMA BAŞARISIZ — yukarıdaki farklara bakın.')
    process.exitCode = 1
  } else {
    console.log('\nSONUÇ: doğrulama geçti (not: bu, durum dosyası ile DB kaydının uzlaşmasıdır;')
    console.log('R2 içeriğinin bizzat taranması için Cloudflare tarafında ayrı bir denetim gerekir).')
  }
}

// ---------------------------------------------------------------------------
// Aşama 5 (bağımsız, sürekli): kucuk-tamamla
// ---------------------------------------------------------------------------

// services/dosya-worker/wrangler.jsonc → r2_buckets[0].bucket_name — ELLE
// KOPYALANDI (ayrı çalışma zamanları, otomatik paylaşım yok — bkz. dosya
// başındaki `kucukYolu` notu). Orada değişirse burası da elle güncellenmeli.
const R2_KOVA = 'tekstil-crm-dosya'
// wrangler r2 komutları proje köküne göre değil, Worker paketine göre
// çalışır (auth + binding config orada). --remote: gerçek/canlı R2 kovası.
const WRANGLER_CWD = path.resolve('services/dosya-worker')

/**
 * R2'den bir nesneyi doğrudan Cloudflare'ın `wrangler r2 object get` CLI'ı
 * ile indirir (Worker'ın kendisi ÜZERİNDEN DEĞİL — bkz. aşağıdaki neden).
 *
 * NEDEN Worker /d ÜZERİNDEN DEĞİL: Worker'ın okuma ucu (`/d/<yol>`) BİLEREK
 * yalnız kullanıcı oturum çerezini kabul eder, servis sırrını KABUL ETMEZ
 * (bkz. services/dosya-worker/src/index.js → okuyucuDogrula, ve
 * `dosya.test.js` → "servis sırrıyla OKUMA yapılamaz"). Bu betiğin insan
 * oturumu yok; Worker'ın yetki modelini bu script için gevşetmek (servis
 * sırrına okuma da açmak) tasarımın kasıtlı ayrımını bozar ve bu görevin
 * kapsamı dışındadır. `wrangler r2 object get`, Cloudflare hesap kimlik
 * doğrulamasıyla (bu makinede `wrangler login` yapılmış olmalı) DOĞRUDAN
 * R2 API'sine gider — Worker'ın HTTP yüzeyini hiç kullanmaz, dolayısıyla
 * Worker'ın yetki modelini değiştirmeye gerek kalmaz.
 *
 * @returns true → indirildi, false → nesne yok ya da komut başarısız (loglanır).
 */
async function r2NesneIndir(anahtar, hedefYol) {
  try {
    await mkdir(path.dirname(hedefYol), { recursive: true })
    await execFileAsync(
      'npx',
      ['wrangler', 'r2', 'object', 'get', `${R2_KOVA}/${anahtar}`, '--remote', '--file', hedefYol],
      { cwd: WRANGLER_CWD },
    )
    return true
  } catch {
    return false
  }
}

/** R2'de bir anahtarın var olup olmadığını denetler (geçici dosyaya indirip siler). */
async function r2NesneVarMi(anahtar) {
  const gecici = path.join(os.tmpdir(), `r2-varmi-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const varMi = await r2NesneIndir(anahtar, gecici)
  if (varMi) {
    try {
      await rm(gecici)
    } catch {
      // temizlik başarısız olsa da sonuç geçerli — yok sayılır
    }
  }
  return varMi
}

/**
 * Talep girişi (ve genel olarak) görsellerinden küçüğü R2'de OLMAYANLARI
 * bulur, yalnız onları indirip küçültüp yükler.
 *
 * BAĞIMSIZ ve SÜREKLİ bir komuttur — taşımanın (indir/kucuk/yukle/dogrula)
 * bir parçası DEĞİLDİR, ondan SONRA ve periyodik olarak çalıştırılır
 * (bkz. dosya başı yorumu). `yuklenen` durum anahtarını KULLANMAZ (o yalnız
 * bu makinedeki tek seferlik taşımayı bilir); bunun yerine her kaydın küçüğü
 * gerçekten R2'de var mı diye R2'nin KENDİSİNE sorar (`r2NesneVarMi`) —
 * gerçeğin tek kaynağı budur. `kucukTamamlanan` yalnız zaten denetlenmiş
 * (var bulunmuş ya da bu çalıştırmada üretilmiş) kayıtları bir SONRAKİ
 * çalıştırmada tekrar denetlememek için bir önbellektir; hiçbir zaman
 * "bilmiyoruz, atla" anlamına gelmez.
 *
 * Mevcut `kucukleriUretVeKaydet` ve `nesneYuklePUT` yardımcıları YENİDEN
 * KULLANILIR (kucuk()/yukle() ile aynı kod yolu) — kopyalama yok.
 */
async function kucukTamamla() {
  const o = ortam()
  const durum = await durumOku()
  const tamam = new Set(durum.kucukTamamlanan)
  const kayit = (await kayitlar(o)).filter((k) => gorselMi(k.mime_type) && !tamam.has(k.storage_path))
  console.log(`Denetlenecek görsel: ${kayit.length} (daha önce bu betikle denetlenip tamam bulunanlar hariç)`)

  let islendi = 0
  let atlandi = 0
  let basarisiz = 0

  await kuyruk(kayit, async (k) => {
    // 1) R2'de küçük zaten var mı? 160'ı yeterli sinyal sayıyoruz — kucuk()
    //    ve bu fonksiyon ikisini de HER ZAMAN birlikte üretip birlikte
    //    yüklüyor, biri varsa öbürü de vardır (aksi hâlde yarım kalmış bir
    //    önceki çalıştırmadır ve aşağıdaki üretim/yükleme adımı ikisini de
    //    yeniden yazar — zararsız, servis sırrı üzerine yazabiliyor).
    const varMi = await r2NesneVarMi(kucukYolu(k.storage_path, BOYUTLAR[0]))
    if (varMi) {
      atlandi++
      durum.kucukTamamlanan.push(k.storage_path)
      return
    }

    // 2) Orijinali edin: önce yerelde (.tasima/ham) kalmış mı bak — önceki
    //    tam taşımadan kalmış olabilir — yoksa R2'den indir (bu görsel
    //    taşımadan SONRA doğrudan R2'ye yazılmış olabilir, hiç Supabase'te
    //    olmamış olabilir; bkz. tasarım §5.4).
    const yerelKaynak = path.join(KLASOR, 'ham', k.storage_path)
    if (!existsSync(yerelKaynak)) {
      const indirildi = await r2NesneIndir(k.storage_path, yerelKaynak)
      if (!indirildi) {
        console.error(`  orijinal ne yerelde ne R2'de bulunamadı: ${k.storage_path}`)
        basarisiz++
        return
      }
    }

    // 3) Küçükleri üret (kucuk() ile PAYLAŞILAN kod yolu).
    const uretildi = await kucukleriUretVeKaydet(yerelKaynak, k.storage_path)
    if (!uretildi) {
      basarisiz++
      return
    }

    // 4) Yükle (yukle() ile PAYLAŞILAN kod yolu).
    let hataVar = false
    for (const boyut of BOYUTLAR) {
      const kYol = kucukYolu(k.storage_path, boyut)
      const kDosya = path.join(KLASOR, 'ham', kYol)
      let govde
      try {
        govde = await readFile(kDosya)
      } catch (e) {
        console.error(`  üretilen küçük okunamadı: ${kYol} — ${e.message}`)
        hataVar = true
        continue
      }
      const sonuc = await nesneYuklePUT(o, kYol, 'image/webp', govde)
      if (!sonuc.ok) {
        console.error(
          `  yüklenemedi: ${kYol} (${sonuc.agHatasi ? `ağ hatası — ${sonuc.mesaj}` : `HTTP ${sonuc.status}${sonuc.hata ? ` — ${sonuc.hata}` : ''}`})`,
        )
        hataVar = true
      }
    }
    if (hataVar) {
      basarisiz++
      return
    }

    islendi++
    durum.kucukTamamlanan.push(k.storage_path)
  }, () => durumYaz(durum))

  await durumYaz(durum)
  console.log(
    `\nDenetlenen: ${kayit.length} · yeni üretilip yüklenen: ${islendi} · ` +
      `zaten vardı (atlandı): ${atlandi} · başarısız: ${basarisiz}`,
  )
}

// ---------------------------------------------------------------------------
// CLI — YALNIZ doğrudan çalıştırıldığında işler. Testler `r2-tasima-yardimci.mjs`
// dosyasından kucukYolu/gorselMi içe aktarır; bu dosyanın import edilmesi
// sırasında taşıma başlamamalı.
// ---------------------------------------------------------------------------

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const komut = process.argv[2]
  const komutlar = { indir, kucuk, yukle, dogrula, 'kucuk-tamamla': kucukTamamla }
  if (!komutlar[komut]) {
    console.error('Kullanım: node scripts/r2-tasima.mjs <indir|kucuk|yukle|dogrula|kucuk-tamamla>')
    process.exit(1)
  }
  try {
    await komutlar[komut]()
  } catch (e) {
    console.error(`\nHATA: ${e.message}`)
    process.exit(1)
  }
}
