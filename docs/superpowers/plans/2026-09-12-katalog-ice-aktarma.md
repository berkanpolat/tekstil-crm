# Yeni Sezon İçe Aktarma (Parça 1) Uygulama Planı

> **Ajan çalışanlar için:** GEREKLİ ALT BECERİ: `superpowers:subagent-driven-development`
> ya da `superpowers:executing-plans`. Adımlar onay kutusu (`- [ ]`) biçimindedir.

**Amaç:** tekstilas.com'daki `sk2627` sezonuna ait 619 ürünü ve görsellerini
CRM'e aktarmak; böylece CRM tam kataloğu (1291 ürün) bilsin.

**Mimari:** Tek bir Node betiği, üç alt komut: `rapor` (canlıya YAZMAZ),
`yaz` (ürünleri tek işlemde ekler), `gorsel` (görselleri R2'ye taşır).
Saf eşleştirme mantığı ayrı bir modülde ve birim testli.

**Teknoloji:** Node 20, Supabase Management API (SQL ucu), mevcut
`scripts/r2-tasima.mjs` yardımcıları, `sharp`, vitest.

**Tasarım:** `docs/superpowers/specs/2026-09-12-katalog-tek-kaynak-design.md`

## Genel Kısıtlar

- **Dil:** tanımlayıcı, yorum, commit ve kullanıcıya görünen metin **Türkçe**.
- **Canlıya yazma yalnız `yaz` ve `gorsel` komutlarında.** `rapor` salt okuma.
- **`yaz` idempotent olmalı:** `site_code` üzerinden mükerrer denetimi; ikinci
  çalıştırma var olanı atlar, kopya oluşturmaz.
- **Uydurma eşleştirme YASAK.** CRM'de karşılığı olmayan kumaş, "benzerine"
  bağlanmaz; yeni `fabric_types` kaydı olarak eklenir.
- **Mevcut kayıtlara DOKUNULMAZ.** İş tamamen ekleme: yeni bir `catalogs`
  satırı ve ona bağlı yeni ürünler. Katalog 2 ve 4 değişmez.
- **Koleksiyon eşleşmesi sabit:** `tesettur→7`, `casual→8`, `premium→9`.
- **Kod alanları:** `site_code` siteden aynen alınır (`TES-ELB-001`);
  `code` iç koddur, `YS-` + 6 karakter [A-Z0-9], çakışmaya karşı denetlenir.
- **R2 anahtarları:** orijinal `catalog/<code>/<N>.webp`; küçükler
  `k/160/catalog/<code>/<N>.webp.webp` ve `k/480/…` (çift uzantı DOĞRU —
  Worker'ın `r2Anahtar` fonksiyonuyla eşleşmek zorunda).
- **`catalog_product_images.image_type`:** ilk görsel `ana`, diğerleri `diger`.
- **Betikler `.env.deploy`'dan okur:** `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `DOSYA_SERVIS_URL`, `DOSYA_SERVIS_SIRRI`.
- **Commit sonu:** `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

## Dosya Haritası

| Dosya | Sorumluluk |
|---|---|
| `scripts/katalog-ice-aktar-esleme.mjs` | Saf eşleştirme mantığı (test edilebilir, ağsız) |
| `scripts/katalog-ice-aktar.mjs` | CLI: `rapor` / `yaz` / `gorsel` |
| `tests/unit/katalogEsleme.test.ts` | Eşleştirme birim testleri |

---

### Görev 1: Eşleştirme mantığı

**Dosyalar:**
- Oluştur: `scripts/katalog-ice-aktar-esleme.mjs`
- Test: `tests/unit/katalogEsleme.test.ts`

**Arayüzler:**
- Üretir:
  - `KOLEKSIYON = { tesettur: 7, casual: 8, premium: 9 }`
  - `icKodUret(mevcutKodlar: Set<string>) → string`
  - `esitle(siteUrun, sozluk) → { ok, kayit?, eksik? }`
  - `raporOzeti(sonuclar) → { toplam, hazir, eksikKumas, belirsizTur }`

- [ ] **Adım 1: Başarısız testi yaz**

`tests/unit/katalogEsleme.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { KOLEKSIYON, icKodUret, esitle, raporOzeti } from '../../scripts/katalog-ice-aktar-esleme.mjs'

const SOZLUK = {
  // etiket → id listesi (çift kayıtlı etiketler birden fazla id taşır)
  turler: new Map([['Elbise', [11]], ['Gömlek', [12, 99]]]),
  kumaslar: new Map([['Pamuk Keten', [5]]]),
}

describe('KOLEKSIYON', () => {
  it('üç koleksiyonu sabit eşler', () => {
    expect(KOLEKSIYON).toEqual({ tesettur: 7, casual: 8, premium: 9 })
  })
})

describe('icKodUret', () => {
  it('YS- öneki ve 6 karakter üretir', () => {
    expect(icKodUret(new Set())).toMatch(/^YS-[A-Z0-9]{6}$/)
  })
  it('mevcut kodla çakışmaz', () => {
    const hepsi = new Set()
    for (let i = 0; i < 200; i++) hepsi.add(icKodUret(hepsi))
    expect(hepsi.size).toBe(200)
  })
})

describe('esitle', () => {
  const urun = { name: 'Test Elbise', slug: 'test-elbise', code: 'TES-ELB-001',
                 cat: 'tesettur', type: 'Elbise', fabric: 'Pamuk Keten' }

  it('tam eşleşen ürünü hazırlar', () => {
    const r = esitle(urun, SOZLUK)
    expect(r.ok).toBe(true)
    expect(r.kayit).toMatchObject({
      name: 'Test Elbise', slug: 'test-elbise', site_code: 'TES-ELB-001',
      collection_id: 7, category_id: 11, fabric_type_id: 5,
    })
  })

  it('CRM’de olmayan kumaşı EKSİK olarak bildirir, uydurmaz', () => {
    const r = esitle({ ...urun, fabric: 'İpek Saten' }, SOZLUK)
    expect(r.ok).toBe(false)
    expect(r.eksik).toEqual([{ alan: 'kumas', deger: 'İpek Saten' }])
  })

  it('çift kayıtlı tür etiketini BELİRSİZ sayar', () => {
    const r = esitle({ ...urun, type: 'Gömlek' }, SOZLUK)
    expect(r.ok).toBe(false)
    expect(r.eksik).toEqual([{ alan: 'tur', deger: 'Gömlek', adaylar: [12, 99] }])
  })

  it('bilinmeyen koleksiyonu eksik sayar', () => {
    const r = esitle({ ...urun, cat: 'yok' }, SOZLUK)
    expect(r.ok).toBe(false)
    expect(r.eksik[0].alan).toBe('koleksiyon')
  })

  it('birden çok eksiği birlikte bildirir', () => {
    const r = esitle({ ...urun, fabric: 'Jarse', cat: 'yok' }, SOZLUK)
    expect(r.eksik).toHaveLength(2)
  })
})

describe('raporOzeti', () => {
  it('sayıları doğru toplar', () => {
    const s = [
      { ok: true }, { ok: true },
      { ok: false, eksik: [{ alan: 'kumas', deger: 'Jarse' }] },
      { ok: false, eksik: [{ alan: 'tur', deger: 'Gömlek' }] },
    ]
    expect(raporOzeti(s)).toEqual({ toplam: 4, hazir: 2, eksikKumas: 1, belirsizTur: 1 })
  })
})
```

- [ ] **Adım 2: Testi çalıştır, başarısız olduğunu gör**

```bash
npx vitest run katalogEsleme
```

Beklenen: modül bulunamadı.

- [ ] **Adım 3: `scripts/katalog-ice-aktar-esleme.mjs`'i yaz**

```js
// Yeni sezon içe aktarmasının SAF eşleştirme mantığı.
//
// Bu dosya ağa ve dosya sistemine DOKUNMAZ — bütün karar mantığı burada
// olduğu için birim testle kuşatılabiliyor. Yan etkiler CLI'de.

/** Sitedeki koleksiyon kodu → CRM catalog_collections.id. Birebir hazır. */
export const KOLEKSIYON = { tesettur: 7, casual: 8, premium: 9 }

const HARFLER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/**
 * İç kod üretir. Katalog 4'ün kalıbı: `YS-` + 6 karakter.
 * Katalog 2'nin `ST-26SS…` kalıbı o sezona özgüdür, kopyalanmaz.
 * @param mevcutKodlar çakışma denetimi için; üretilen kod BU KÜMEYE EKLENİR.
 */
export function icKodUret(mevcutKodlar) {
  for (let deneme = 0; deneme < 1000; deneme++) {
    let k = 'YS-'
    for (let i = 0; i < 6; i++) k += HARFLER[Math.floor(Math.random() * HARFLER.length)]
    if (!mevcutKodlar.has(k)) { mevcutKodlar.add(k); return k }
  }
  throw new Error('İç kod üretilemedi: 1000 denemede boş kod bulunamadı.')
}

/**
 * Bir site ürününü CRM kaydına dönüştürür.
 *
 * UYDURMA EŞLEŞTİRME YOKTUR: CRM'de karşılığı olmayan kumaş "benzerine"
 * bağlanmaz, eksik olarak bildirilir. Yanlış kumaş yanlış maliyet demektir.
 * Çift kayıtlı tür etiketi de belirsizdir — hangi satırın seçileceğine
 * insan karar verir.
 *
 * @returns {{ok: true, kayit: object} | {ok: false, eksik: object[]}}
 */
export function esitle(urun, sozluk) {
  const eksik = []

  const collection_id = KOLEKSIYON[urun.cat]
  if (!collection_id) eksik.push({ alan: 'koleksiyon', deger: urun.cat ?? null })

  let category_id = null
  const turAdaylari = sozluk.turler.get(urun.type)
  if (!turAdaylari) eksik.push({ alan: 'tur', deger: urun.type ?? null })
  else if (turAdaylari.length > 1) eksik.push({ alan: 'tur', deger: urun.type, adaylar: turAdaylari })
  else category_id = turAdaylari[0]

  let fabric_type_id = null
  const kumasAdaylari = sozluk.kumaslar.get(urun.fabric)
  if (!kumasAdaylari) eksik.push({ alan: 'kumas', deger: urun.fabric ?? null })
  else if (kumasAdaylari.length > 1) eksik.push({ alan: 'kumas', deger: urun.fabric, adaylar: kumasAdaylari })
  else fabric_type_id = kumasAdaylari[0]

  if (eksik.length) return { ok: false, eksik }

  return {
    ok: true,
    kayit: {
      name: urun.name,
      slug: urun.slug,
      site_code: urun.code,
      collection_id,
      category_id,
      fabric_type_id,
    },
  }
}

/** Rapor başlığında gösterilecek sayılar. */
export function raporOzeti(sonuclar) {
  const ozet = { toplam: sonuclar.length, hazir: 0, eksikKumas: 0, belirsizTur: 0 }
  for (const s of sonuclar) {
    if (s.ok) { ozet.hazir++; continue }
    for (const e of s.eksik) {
      if (e.alan === 'kumas') ozet.eksikKumas++
      if (e.alan === 'tur') ozet.belirsizTur++
    }
  }
  return ozet
}
```

- [ ] **Adım 4: Testleri çalıştır, geçtiğini gör**

```bash
npx vitest run katalogEsleme
```

Beklenen: 9 test PASS.

- [ ] **Adım 5: Commit**

```bash
git add scripts/katalog-ice-aktar-esleme.mjs tests/unit/katalogEsleme.test.ts
git commit -m "Katalog içe aktarma: saf eşleştirme mantığı

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Görev 2: `rapor` komutu (canlıya YAZMAZ)

**Dosyalar:**
- Oluştur: `scripts/katalog-ice-aktar.mjs`

**Arayüzler:**
- Tüketir: `KOLEKSIYON`, `esitle`, `raporOzeti` (Görev 1).
- Üretir: `node scripts/katalog-ice-aktar.mjs rapor` → `.ice-aktarma-rapor.json`

- [ ] **Adım 1: CLI iskeletini ve `rapor`u yaz**

```js
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
```

- [ ] **Adım 2: `.gitignore`'a rapor dosyasını ekle**

```
.ice-aktarma-rapor.json
```

- [ ] **Adım 3: Kuru çalıştır ve çıktıyı incele**

```bash
set -a && source .env.deploy && set +a
node scripts/katalog-ice-aktar.mjs rapor
```

Beklenen: 619 ürün, eksik kumaş listesi (~33 değer), belirsiz tür listesi
(`Gömlek`, `Pantolon`, `Sweatshirt`, `Yelek`, `Şapka` arasından bu sezonda
geçenler). Canlıda hiçbir değişiklik olmamalı.

- [ ] **Adım 4: Doğrula — canlıya yazılmadı**

```bash
node -e "
const r=require('./.ice-aktarma-rapor.json');
console.log('rapor ürün sayısı:', r.sonuclar.length, '| özet:', r.ozet)"
```

- [ ] **Adım 5: Commit**

```bash
git add scripts/katalog-ice-aktar.mjs .gitignore
git commit -m "Katalog içe aktarma: rapor komutu (salt okuma)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Görev 3: Eksik sözlük kayıtları ve `yaz` komutu

**Dosyalar:**
- Değiştir: `scripts/katalog-ice-aktar.mjs`

**Arayüzler:**
- Tüketir: `.ice-aktarma-rapor.json` (Görev 2), `icKodUret` (Görev 1).
- Üretir: `node scripts/katalog-ice-aktar.mjs yaz`

> **`yaz` TEK İŞLEMDİR.** Yarıda kalırsa hiçbir şey yazılmamış olur.
> **İdempotenttir:** `site_code` zaten varsa o ürün atlanır.

- [ ] **Adım 1: `yaz` komutunu ekle**

`scripts/katalog-ice-aktar.mjs` içine, `rapor`dan sonra:

```js
async function yaz() {
  if (!existsSync(RAPOR)) throw new Error(`${RAPOR} yok — önce "rapor" komutunu çalıştırın.`)
  const r = JSON.parse(readFileSync(RAPOR, 'utf8'))
  const o = ortam()

  // 1) Eksik kumaşları ekle (uydurma eşleştirme YOK — yeni kayıt açılır).
  const eksik = r.eksikKumaslar ?? []
  if (eksik.length) {
    const mevcutKumas = new Set((await oku(o, 'fabric_types?select=label')).map((x) => x.label))
    const yeniler = eksik.filter((k) => k && !mevcutKumas.has(k)).map((label) => ({ label }))
    await yazSatir(o, 'fabric_types', yeniler)
    console.log(`   ${yeniler.length} yeni kumaş eklendi`)
  }

  // 2) Katalog satırı (varsa yeniden kullan — idempotent)
  let katalog = (await oku(o, `catalogs?select=id&name=eq.${encodeURIComponent(KATALOG_ADI)}`))[0]
  if (!katalog) {
    katalog = (await yazSatir(o, 'catalogs', { name: KATALOG_ADI, season: SEZON, year: 2026 }, true))[0]
  }
  console.log(`   katalog id: ${katalog.id}`)

  // 3) Sözlükleri YENİDEN oku — yeni kumaşlar artık var
  const sozluk = {
    turler: sozlukKur(await oku(o, 'product_categories?select=id,label')),
    kumaslar: sozlukKur(await oku(o, 'fabric_types?select=id,label')),
  }
  const urunler = await siteUrunleri()
  const mevcutKodlar = new Set((await oku(o, 'catalog_products?select=code')).map((x) => x.code))
  const mevcutSite = new Set((await oku(o, 'catalog_products?select=site_code')).map((x) => x.site_code))

  const satirlar = []
  const atlanan = []
  const belirsiz = []
  for (const u of urunler) {
    if (mevcutSite.has(u.code)) { atlanan.push(u.code); continue }
    const e = esitle(u, sozluk)
    if (!e.ok) { belirsiz.push({ site_code: u.code, eksik: e.eksik }); continue }
    satirlar.push({ catalog_id: katalog.id, code: icKodUret(mevcutKodlar), ...e.kayit })
  }

  if (!satirlar.length) console.log('   yazılacak yeni ürün yok.')
  else {
    // PostgREST tek istekteki dizinin tamamını TEK işlemde yazar:
    // biri düşerse hiçbiri yazılmaz.
    await yazSatir(o, 'catalog_products', satirlar)
    console.log(`   ${satirlar.length} ürün eklendi`)
  }
  console.log(`   zaten vardı: ${atlanan.length} · belirsiz kaldı: ${belirsiz.length}`)
  for (const b of belirsiz.slice(0, 10)) console.log(`     · ${b.site_code}: ${b.eksik.map((x) => x.alan + '=' + x.deger).join(', ')}`)
}
```

`komutlar` nesnesini güncelle: `const komutlar = { rapor, yaz }`

- [ ] **Adım 2: Raporu yenile (yeni kumaşlar sonrası belirsizlik azalmalı)**

```bash
set -a && source .env.deploy && set +a
node scripts/katalog-ice-aktar.mjs rapor
```

- [ ] **Adım 3: Yedek al (CLAUDE.md kural 2 — canlıya yazmadan ÖNCE)**

```bash
TOK=$(security find-generic-password -s "Supabase CLI" -a supabase -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -s -X POST "https://api.supabase.com/v1/projects/kkxvoxeqfsaqzklrtgrw/database/query" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  --data-binary '{"query":"select * from public.catalog_products"}' \
  > ~/tekstil-crm-yedekler/catalog_products-ice-aktarma-oncesi-2026-09-12.json
wc -c ~/tekstil-crm-yedekler/catalog_products-ice-aktarma-oncesi-2026-09-12.json
```

- [ ] **Adım 4: `yaz`ı çalıştır**

```bash
node scripts/katalog-ice-aktar.mjs yaz
```

Beklenen: yeni kumaşlar eklendi, katalog satırı oluştu, ~619 ürün eklendi.

- [ ] **Adım 5: Doğrula**

```bash
TOK=$(security find-generic-password -s "Supabase CLI" -a supabase -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -s -X POST "https://api.supabase.com/v1/projects/kkxvoxeqfsaqzklrtgrw/database/query" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  --data-binary '{"query":"select c.name, count(*) from catalog_products p join catalogs c on c.id=p.catalog_id group by 1 order by 2 desc"}'
```

Beklenen: üç katalog, yenisinde ~619 ürün, eskiler 197 ve 475 olarak **değişmemiş**.

- [ ] **Adım 6: İdempotenslik denetimi — ikinci çalıştırma kopya yaratmamalı**

```bash
node scripts/katalog-ice-aktar.mjs yaz
```

Beklenen: `yazılacak yeni ürün yok`, toplam sayı değişmez.

- [ ] **Adım 7: Commit**

```bash
git add scripts/katalog-ice-aktar.mjs
git commit -m "Katalog içe aktarma: yaz komutu (idempotent, tek işlem)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Görev 4: `gorsel` komutu — görselleri R2'ye taşı

**Dosyalar:**
- Değiştir: `scripts/katalog-ice-aktar.mjs`

**Arayüzler:**
- Tüketir: `yaz` sonrası oluşan ürünler; `sharp`; Worker `/y` ucu.
- Üretir: R2 nesneleri + `public.files` + `public.catalog_product_images` kayıtları.

- [ ] **Adım 1: `gorsel` komutunu ekle**

```js
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const BOYUTLAR = [160, 480]

/** Worker'ın r2Anahtar'ıyla AYNI biçim. Ayrışırsa küçükler bulunamaz. */
const kucukAnahtar = (yol, boyut) => `k/${boyut}/${yol}.webp`

async function r2Yaz(url, sir, yol, govde, mime) {
  const r = await fetch(`${url}/y?yol=${encodeURIComponent(yol)}`, {
    method: 'PUT',
    headers: { 'content-type': mime, 'content-length': String(govde.byteLength), 'x-servis-sirri': sir },
    body: govde,
  })
  if (!r.ok) throw new Error(`R2 yazılamadı (${r.status}): ${yol}`)
}

async function gorsel() {
  const o = ortam()
  const url = process.env.DOSYA_SERVIS_URL
  const sir = process.env.DOSYA_SERVIS_SIRRI
  if (!url || !sir) throw new Error('DOSYA_SERVIS_URL / DOSYA_SERVIS_SIRRI tanımlı değil.')

  const urunler = await siteUrunleri()
  const siteHaritasi = new Map(urunler.map((u) => [u.code, u]))
  const katalog = (await oku(o, `catalogs?select=id&name=eq.${encodeURIComponent(KATALOG_ADI)}`))[0]
  if (!katalog) throw new Error('Katalog bulunamadı — önce "yaz" çalıştırın.')

  const kayitlar = await oku(o, `catalog_products?select=id,code,site_code&catalog_id=eq.${katalog.id}`)
  const gorselliler = new Set((await oku(o, 'catalog_product_images?select=product_id')).map((x) => x.product_id))

  let eklenen = 0, atlanan = 0, basarisiz = 0
  for (const p of kayitlar) {
    if (gorselliler.has(p.id)) { atlanan++; continue }
    const u = siteHaritasi.get(p.site_code)
    const yollar = (u?.catalog_product_images ?? []).map((g) => g.storage_path)
    if (!yollar.length) { atlanan++; continue }

    try {
      let sira = 0
      for (const sy of yollar) {
        const r = await fetch(`https://tekstilas.com/katalog-media/${sy}`)
        if (!r.ok) throw new Error(`site görseli alınamadı (${r.status}): ${sy}`)
        const bayt = Buffer.from(await r.arrayBuffer())
        const hedef = `catalog/${p.code}/${sira + 1}.webp`

        await r2Yaz(url, sir, hedef, bayt, 'image/webp')
        for (const b of BOYUTLAR) {
          const k = await sharp(bayt).resize({ width: b, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
          await r2Yaz(url, sir, kucukAnahtar(hedef, b), k, 'image/webp')
        }

        const sha = createHash('sha256').update(bayt).digest('hex')
        // İki ayrı yazma: PostgREST tek istekte iki tabloya yazamaz. Sıra
        // önemli — dosya kaydı olmadan görsel bağı yetim kalır. Ters sırada
        // bir arıza olursa `files` kaydı bağsız kalır; zararsızdır ve
        // idempotenslik denetimi (gorselliler kümesi) onu yakalar.
        const dosya = (await yazSatir(o, 'files', {
          bucket: 'r2', storage_path: hedef, original_name: sy.split('/').pop(),
          mime_type: 'image/webp', size_bytes: bayt.byteLength, checksum: sha, category: 'image',
        }, true))[0]
        await yazSatir(o, 'catalog_product_images', {
          product_id: p.id, file_id: dosya.id,
          image_type: sira === 0 ? 'ana' : 'diger', sort_order: sira,
        })
        sira++
      }
      eklenen++
      if (eklenen % 50 === 0) console.log(`  ${eklenen}/${kayitlar.length}`)
    } catch (e) {
      console.error(`  başarısız: ${p.site_code} — ${e.message}`)
      basarisiz++
    }
  }
  console.log(`\nGörsel: eklenen ${eklenen} · atlanan ${atlanan} · başarısız ${basarisiz}`)
}
```

`komutlar` nesnesini güncelle: `const komutlar = { rapor, yaz, gorsel }`

- [ ] **Adım 2: Çalıştır**

```bash
set -a && source .env.deploy && set +a
node scripts/katalog-ice-aktar.mjs gorsel
```

- [ ] **Adım 3: Yeniden çalıştır — idempotenslik**

```bash
node scripts/katalog-ice-aktar.mjs gorsel
```

Beklenen: hepsi `atlanan`, yeni ekleme yok.

- [ ] **Adım 4: Canlı doğrulama**

```bash
TOK=$(security find-generic-password -s "Supabase CLI" -a supabase -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -s -X POST "https://api.supabase.com/v1/projects/kkxvoxeqfsaqzklrtgrw/database/query" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  --data-binary '{"query":"select count(distinct i.product_id) gorselli_urun, count(*) gorsel from catalog_product_images i join catalog_products p on p.id=i.product_id join catalogs c on c.id=p.catalog_id where c.season = '"'"'sk2627'"'"'"}'
```

Beklenen: ~619 görselli ürün.

- [ ] **Adım 5: CRM arayüzünde gözle bak**

`https://crm.tekstilas.com/katalog` — yeni sezon ürünleri görselleriyle
listeleniyor mu? Bir ürüne tıkla, detay sayfasında görsel geliyor mu?

- [ ] **Adım 6: Commit ve sürüm**

```bash
git add scripts/katalog-ice-aktar.mjs
git commit -m "Katalog içe aktarma: görseller R2'ye taşınıyor

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

`package.json` sürümünü `1.38.0` yap, `CHANGELOG.md`'ye girdi ekle,
`git tag v1.38.0`.

---

## Geri dönüş

İçe aktarma tamamen EKLEMEdir; mevcut hiçbir kayıt değişmez.

```sql
-- Yeni sezonu geri al (yumuşak): ürünler görünmez olur, veri durur.
update public.catalogs set is_active = false
 where name = 'Sonbahar/Kış 26-27';

-- Tamamen kaldır (sert): önce görsel bağları, sonra ürünler, sonra katalog.
delete from public.catalog_product_images
 where product_id in (select p.id from catalog_products p
                      join catalogs c on c.id = p.catalog_id
                      where c.name = 'Sonbahar/Kış 26-27');
delete from public.catalog_products
 where catalog_id = (select id from catalogs where name = 'Sonbahar/Kış 26-27');
delete from public.catalogs where name = 'Sonbahar/Kış 26-27';
```

R2'ye yazılan nesneler kalır; `files` kayıtları olmadan erişilemezler.
Yedek: `~/tekstil-crm-yedekler/catalog_products-ice-aktarma-oncesi-2026-09-12.json`
