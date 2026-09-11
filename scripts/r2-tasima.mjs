#!/usr/bin/env node
// Supabase Storage → Cloudflare R2 taşıma aracı.
//
// UYGULAMA: Görev 10 brief'i + kontrolör kararları (K1-K6).
//   .superpowers/sdd/2026-09-11-r2-dosya-katmani/gorev-10-brief.md
//
// KULLANIM
//   node scripts/r2-tasima.mjs indir     # Supabase'den yerel klasöre
//   node scripts/r2-tasima.mjs kucuk     # 160/480 WebP üret
//   node scripts/r2-tasima.mjs yukle     # R2'ye (Worker /y ucundan)
//   node scripts/r2-tasima.mjs dogrula   # sayı/boyut karşılaştır, R2 tarafını denetle
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

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { kucukYolu, gorselMi } from './r2-tasima-yardimci.mjs'

export { kucukYolu, gorselMi }

const KLASOR = '.tasima'
const DURUM = '.tasima-durum.json'
const ESZAMAN = 6
const BOYUTLAR = [160, 480]
const KOVA = 'documents'
// Worker'daki AZAMI_BAYT ile aynı (services/dosya-worker/src/index.js).
const AZAMI_BAYT = 25 * 1024 * 1024
// Worker'daki IZINLI_MIME ile aynı — genel-kisitlar.md.
const IZINLI_MIME = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'text/csv', 'text/plain', 'application/zip',
])

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
  if (!existsSync(DURUM)) return { indirilen: [], kucuk: [], yuklenen: [] }
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

/** İş listesini sınırlı eşzamanlılıkla işler; her iş kendi hatasını yakalar. */
async function kuyruk(isler, calis) {
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
      if (++bitti % 100 === 0) console.log(`  ${bitti}/${isler.length}`)
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
  })
  await durumYaz(durum)
  console.log(`İndirilen toplam: ${durum.indirilen.length} · bu çalıştırmada başarısız: ${basarisiz}`)
}

// ---------------------------------------------------------------------------
// Aşama 2: kucuk
// ---------------------------------------------------------------------------

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
    let hataVar = false
    for (const boyut of BOYUTLAR) {
      const hedef = path.join(KLASOR, 'ham', kucukYolu(k.storage_path, boyut))
      try {
        await mkdir(path.dirname(hedef), { recursive: true })
        await sharp(kaynak)
          .resize({ width: boyut, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toFile(hedef)
      } catch (e) {
        console.error(`  küçültülemedi (${boyut}): ${k.storage_path} — ${e.message}`)
        hataVar = true
      }
    }
    if (hataVar) { basarisiz++; return }
    durum.kucuk.push(k.storage_path)
  })
  await durumYaz(durum)
  console.log(`Küçültülen toplam: ${durum.kucuk.length} · bu çalıştırmada başarısız: ${basarisiz}`)
}

// ---------------------------------------------------------------------------
// Aşama 3: yukle
// ---------------------------------------------------------------------------

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
    if (i.mime.split(';')[0].trim().toLowerCase() !== 'image/webp' && !IZINLI_MIME.has(i.mime)) {
      // Worker aynı denetimi yapar (415); burada erken tespit ederek boşuna
      // ağ isteği atmayız.
      console.error(`  tip Worker tarafından reddedilecek, atlanıyor: ${i.yol} (${i.mime})`)
      reddedilen++
      return
    }

    let govde
    try {
      govde = await readFile(kaynak)
    } catch (e) {
      console.error(`  okunamadı: ${i.yol} — ${e.message}`)
      basarisiz++
      return
    }
    if (govde.byteLength > AZAMI_BAYT) {
      console.error(`  boyut sınırı aşılıyor, atlanıyor: ${i.yol} (${govde.byteLength} bayt)`)
      reddedilen++
      return
    }

    let r
    try {
      r = await fetch(`${o.dosyaUrl}/y?yol=${encodeURIComponent(i.yol)}`, {
        method: 'PUT',
        headers: {
          'content-type': i.mime,
          'content-length': String(govde.byteLength),
          'x-servis-sirri': o.sir,
        },
        body: govde,
      })
    } catch (e) {
      console.error(`  yükleme isteği başarısız (ağ): ${i.yol} — ${e.message}`)
      basarisiz++
      return
    }
    if (!r.ok) {
      // Worker hata gövdesi { hata: '<kısa metin>' } biçimindedir (bkz. K4).
      let hata = ''
      try {
        hata = (await r.json())?.hata || ''
      } catch {
        // Gövde JSON değilse yok say; durum kodu yeterli bilgi verir.
      }
      console.error(`  yüklenemedi: ${i.yol} (HTTP ${r.status}${hata ? ` — ${hata}` : ''})`)
      if (r.status === 415 || r.status === 413 || r.status === 400) reddedilen++
      else basarisiz++
      return
    }
    durum.yuklenen.push(i.yol)
  })
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
// CLI — YALNIZ doğrudan çalıştırıldığında işler. Testler `r2-tasima-yardimci.mjs`
// dosyasından kucukYolu/gorselMi içe aktarır; bu dosyanın import edilmesi
// sırasında taşıma başlamamalı.
// ---------------------------------------------------------------------------

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const komut = process.argv[2]
  const komutlar = { indir, kucuk, yukle, dogrula }
  if (!komutlar[komut]) {
    console.error('Kullanım: node scripts/r2-tasima.mjs <indir|kucuk|yukle|dogrula>')
    process.exit(1)
  }
  try {
    await komutlar[komut]()
  } catch (e) {
    console.error(`\nHATA: ${e.message}`)
    process.exit(1)
  }
}
