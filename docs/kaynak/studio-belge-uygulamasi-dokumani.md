# Tekstil A.Ş. Belge & Fiyatlandırma Uygulaması — Proje Dokümanı ve Entegrasyon Rehberi

> Kaynak dosya: `index__3_.html` (tek dosya, 9,66 MB)
> Dosya içi başlık: *KOLİ ETİKET OLUŞTURUCU (v3 – vektörel)* — isim eskimiş,
> uygulama artık çok daha geniş bir kapsama sahip.
> Bu doküman, projeyi **başka bir proje içinde kullanmak** isteyen bir ekip için hazırlandı.

---

## 1. Bir bakışta

Bu, Tekstil A.Ş. (Tekstilas) için yazılmış, **tarayıcıda çalışan tek dosyalık bir
belge üretme ve fiyatlandırma uygulamasıdır.** Build adımı, paket yöneticisi,
derleyici yoktur — dosyayı çift tıklayınca çalışır.

İki ana işi vardır:

**1) Baskıya hazır belge üretmek.** Koli etiketi, numune etiketi, sipariş formu,
teknik föy, fiyat teklifi, sipariş onay formu ve kumaş kartelası. Hepsi vektörel
olarak (gerçek font + SVG + SVG barkod) üretilir ve tarayıcının "PDF olarak kaydet"
özelliğiyle çıktı alınır. Ekran görüntüsü alınmadığı için baskıda bulanıklık olmaz.

**2) Ürün maliyeti ve fiyatı hesaplamak.** Gömülü 143 ürünlük katalog üzerinden
kalem kalem maliyet girilir, dolar kuru uygulanır, kâr marjına göre adet kademeli
(50/200/500) satış fiyatı otomatik üretilir ve doğrudan teklife dönüştürülür.

```
                    ┌────────────────────────┐
                    │   ANA EKRAN (Home)     │
                    │  kayıtlar · klasörler  │
                    └───────────┬────────────┘
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
  ┌───────────┐         ┌──────────────┐        ┌──────────────┐
  │  KATALOG  │         │   BELGELER   │        │   KARTELA    │
  │ 143 ürün  │         │ Koli/Numune  │        │  Tedarikçi   │
  │           │         │ Sipariş/Föy  │        │  Grup/Tür    │
  │ ↓ maliyet │         │ Teklif/Onay  │        │  Renk kodu   │
  │ ↓ fiyat   │────────▶│              │        │              │
  └───────────┘         └──────┬───────┘        └──────┬───────┘
                               │                       │
                               ▼                       ▼
                        window.print() → A4 vektörel PDF
                               │
                               ▼
                  Supabase (jobs / catalog_pricing / app_settings)
                        canlı senkron · çok cihaz
```

---

## 2. Teknoloji yığını

| Katman | Teknoloji |
|---|---|
| Uygulama | Saf (vanilla) JavaScript — framework yok, build yok, modül yok |
| Yapı | Tek `.html` dosyası: inline CSS + inline JS + gömülü veri |
| Yönlendirme | `history.pushState` + `popstate`, `.view` CSS sınıfı ile görünüm değişimi |
| Depolama | Supabase (Postgres + PostgREST + Realtime), CDN'den `supabase-js@2` |
| Barkod | JsBarcode 3.11.6 (CDN) — SVG çıktı |
| Excel dışa aktarma | SheetJS 0.18.5 — **gerektiğinde** CDN'den yüklenir, yoksa CSV'ye düşer |
| Döviz kuru | TCMB `today.xml` — 6 kademeli CORS proxy zinciri |
| PDF | Tarayıcının kendi yazdırma motoru (`@media print` + `@page`) |
| Fontlar | Inter + Sacramento, base64 woff2 olarak dosyaya gömülü |

### Dosya boyutunun dağılımı

| Parça | Boyut | Oran |
|---|---:|---:|
| Katalog ürün fotoğrafları (143 adet base64) | ~8,94 MB | %92 |
| Gömülü fontlar (Inter + Sacramento woff2) | ~0,42 MB | %4 |
| CSS | ~295 KB | %3 |
| JavaScript (mantık) | ~150 KB | %1,5 |
| HTML iskeleti | ~49 KB | <%1 |

**Yani dosyanın %92'si veri, %8'i uygulama.** Bu, taşıma stratejisi için en önemli tek
bilgidir (bkz. §11).

---

## 3. Mimari

Sunucu tarafı kod yoktur. Tarayıcı doğrudan Supabase'e konuşur.

```
┌──────────────────────────────────────────────────────┐
│  Tek HTML dosyası (yerel disk veya statik hosting)   │
│                                                      │
│  ├─ 12 <section class="view">  (aynı anda 1 aktif)   │
│  ├─ #print-root  ← yazdırılacak belge buraya basılır │
│  └─ global fonksiyonlar + inline onclick handler'lar  │
└──────────────────┬───────────────────────────────────┘
                   │  supabase-js (publishable key)
                   ▼
┌──────────────────────────────────────────────────────┐
│  Supabase projesi: fzcagsyxpkdgnqfoyxtz              │
│                                                      │
│   jobs            → tüm belgeler (JSONB blob)        │
│   catalog_pricing → ürün başına maliyet + fiyat      │
│   app_settings    → tek satır: key='global'          │
│                                                      │
│   Realtime: jobs + app_settings tablolarında         │
└──────────────────────────────────────────────────────┘
```

Anlamanız gereken dört tasarım kararı:

1. **Şema yok, JSON blob var.** Her belge `jobs` tablosunda tek bir satır ve tüm içeriği
   `data` sütununda JSONB olarak durur. Postgres bu verinin *içini* bilmez; sorgulama,
   filtreleme, raporlama tarayıcıda yapılır.
2. **Belge = saf fonksiyon.** Her belge tipinin bir `xxxDoc()` fonksiyonu vardır:
   durum nesnesini alır, HTML string'i döndürür. Yan etkisi yoktur. Bu, en taşınabilir parçadır.
3. **PDF = yazdırma.** Ayrı bir PDF kütüphanesi yoktur. Belge HTML'i `#print-root`
   içine basılır, `@page size` ayarlanır, `window.print()` çağrılır. Kullanıcı hedef
   olarak "PDF olarak kaydet" seçer.
4. **Ölçekleme otomatik.** `fyFit`, `tkFit`, `soFit` gibi fonksiyonlar içeriği ölçüp
   A4'e sığmıyorsa CSS `transform: scale()` ile küçültür. Sayfa taşması bu şekilde önlenir.

---

## 4. Bölümler (görünümler)

Uygulama 12 `view` bölümünden oluşur. Aynı anda yalnızca biri `active` sınıfını taşır.

| Görünüm | Ne yapar |
|---|---|
| `home` | Ana ekran. USD kuru girişi, katalog kısayolu, 6 hızlı işlem butonu, klasör çubuğu, son kayıtlar listesi |
| `koli` | **Koli Etiketi.** Müşteri + içerik kodu + adres + toplam koli; her koli için renk/beden/adet/ağırlık. Barkod içerik kodundan (`STD-xxxxxx`) üretilir, rozette "sıra/toplam" görünür |
| `numune` | **Numune Etiketi.** 9×12 cm, A4'e 4 adet sığar. Ürün kodu + beden/renk |
| `siparis` | **Sipariş Formu.** Renk×beden adet matrisi, satır/sütun/genel toplam, girilen toplamla tutarlılık kontrolü, bakım talimatı ikonları, her renk-beden kombinasyonu için otomatik barkod |
| `foy` | **Teknik Föy.** Çok sayfalı. Ürün künyesi, kumaş/kompozisyon tablosu, üretim notları, sorumlular, ürün görselleri ve **görsel üzerine tıklayarak konstrüksiyon açıklaması ekleme** (leader çizgileri SVG ile çizilir). Dikey/yatay sayfa seçimi |
| `teklif` | **Fiyat Teklifi.** Çoklu seçenek (adet/birim fiyat), önerilen seçenek işaretleme, KDV/indirim, **Türkçe–İngilizce çift dil**, TCMB kuru ile TRY/USD/EUR/GBP |
| `onay` | **Sipariş Onay Formu.** İmza alanlı tek sayfa onay belgesi |
| `katalog` | **Ürün Kataloğu.** 143 ürün, arama, ürün başına "Fiyatlı"/"Maliyet" rozeti, toplu seçim ve toplu PDF |
| `urun` | Katalogtan seçilen ürünün detayı, fiyat seçenekleri ve teklif şablonu ayarları |
| `maliyet` | **Maliyet Hesabı.** Kalem kalem (kumaş metre×birim veya sabit tutar), TRY/USD karışık, kâr marjı, KDV. "Fiyat oluştur" ile kademeli fiyatlara dönüşür |
| `ozet` | Ürün özeti: maliyet, satış, kâr, marj karşılaştırma tablosu ve PDF çıktısı |
| `fabric` | **Kumaş Kartelaları** — 3 sekme: Tedarikçiler, Kumaş Grupları & Türleri, Kartelalar. Kartela kodu `yıl+grup+tür` biçiminde otomatik üretilir (örn. `26·20·01`) |

Ek olarak sayfa üstünde iki modal vardır: **kur kapısı** (açılışta USD kuru sorar) ve
**teklif ayarları** (fiyat kademeleri: adet + kâr yüzdesi + önerilen).

---

## 5. Veri modeli

Supabase tarafında yalnızca **üç tablo** vardır.

### `jobs` — tüm belgeler

```
id          text     'j' + timestamp
type        text     koli | numune | siparis | foy | teklif | onay | kartela
title       text     liste görünümü için özet başlık
data        jsonb    belgenin tamamı (tipe göre değişen şema)
updated_at  timestamptz
```

`data` içeriği belge tipine göre farklıdır: `koli` için `{order, koliler[]}`,
`foy` için `{foy:{...images[], pages[], sorumlular[]}}`, `teklif` için `{teklif:{opts[]}}`
gibi. **Şema doğrulaması yoktur** — sözleşme yalnızca JavaScript kodunda yaşar.

Klasörleme de burada: her job'un `folder` alanı vardır, klasör adları
`app_settings.folders` dizisinde tutulur.

### `catalog_pricing` — ürün fiyat ve maliyeti

```
kod         text  PK   katalog ürün kodu (örn. ST-26SS190009)
opts        jsonb      satış seçenekleri [{detay, kumas, adet, birim, oner, sel}]
cost        jsonb      maliyet {items:[{ad, mode, metre, birim, tutar, cur}], kdv, kar}
updated_at  timestamptz
```

### `app_settings` — tek satırlık global ayar

```
key    text  PK   her zaman 'global'
value  jsonb      { usd, usdDate, suppliers[], fabricGroups[],
                    folders[], katFolders[], pricing:{tiers[]} }
```

Tedarikçiler, kumaş grupları/türleri ve fiyat kademeleri ayrı tablo değil,
bu tek JSON belgesinin içinde saklanır.

### Gömülü katalog (`CATALOG` sabiti)

143 ürün, her biri şu alanlarla: `kod`, `ad`, `grup`, `tur`, `komp` (kompozisyon),
`moq`, `kol` (koleksiyon), `foto` (base64 JPEG), `ar` (en/boy oranı), `aciklama`.
Tümü "Kadın Giyim" grubunda. Bu veri **kodun içinde sabittir** — veritabanında değil.
Ürün eklemek için HTML dosyasını düzenlemek gerekir.

---

## 6. Belge üretme motoru

Her belge tipi aynı üç adımlı kalıbı izler:

```
  xxxDoc()   →  durum nesnesinden HTML string üretir (saf fonksiyon)
  xxxRender() →  önizleme panosuna basar, ölçekler, barkodları çizer
  xxxMakePDF() → #print-root'a basar, @page ayarlar, window.print()
```

Ortak yardımcılar:

| Fonksiyon | İşi |
|---|---|
| `setPageOrient(o)` | `@page { size: A4 portrait\|landscape }` kuralını çalışma anında yazar |
| `renderBarcodes(root)` | `data-code` taşıyan tüm `<svg>`'lere JsBarcode uygular |
| `fyFit` / `tkFit` / `soFit` | İçerik A4'e sığmıyorsa `transform: scale()` ile küçültür |
| `fyBuildDoc()` | Teknik föyü ölçüp otomatik sayfalara böler |
| `fyDrawLeaders()` | Görsel üzerindeki açıklama noktalarından etikete SVG kılavuz çizgisi çeker |
| `H()` / `A()` | HTML ve attribute kaçışı (XSS koruması) |

Sayfa ölçüleri CSS'te piksel olarak sabitlenmiş: **A4 dikey 794×1122 px**,
**yatay 1122×793 px**, koli etiketi 700×933 px.

---

## 7. Fiyatlandırma mantığı

Bu, uygulamanın en fazla iş kuralı içeren bölümü:

1. **Maliyet girişi** (`view-maliyet`) — kalemler iki modda girilir: *metre* modunda
   `metre × birim fiyat`, *tutar* modunda sabit tutar. Her kalem TRY veya USD olabilir.
2. **Kur uygulaması** — USD kalemler `settings.usd` ile TL'ye çevrilir. Kur girilmemişse
   hesap eksik sayılır ve uyarı verilir.
3. **Kademeli fiyat üretimi** (`catAutoPrice`) — varsayılan kademeler:
   50 adet → %25 kâr, 200 adet → %20 (önerilen), 500 adet → %15.
   Formül: `birim USD fiyat = maliyet × (1 + marj/100) ÷ kur`, 0,1 hassasiyetle yuvarlanır.
   Kademeler `app_settings.pricing.tiers` üzerinden değiştirilebilir.
4. **Teklife dönüşüm** (`catMakeQuote`) — üretilen seçenekler doğrudan bir
   fiyat teklifi belgesine aktarılır.
5. **Özet** (`view-ozet`) — maliyet / satış / kâr / marj karşılaştırması. Marj
   renk kodludur: ≥%25 yeşil, ≥%0 sarı, negatif kırmızı.

Döviz kuru iki yoldan gelir: kullanıcının elle girdiği USD kuru (kalıcı, ayarlarda)
veya teklif ekranındaki **TCMB canlı kuru**. TCMB XML'i CORS'a kapalı olduğu için kod
sırayla 6 farklı proxy dener; hepsi başarısız olursa kullanıcıdan elle giriş ister.

---

## 8. Senkronizasyon ve çok cihazlı kullanım

- Açılışta `jobs`, `app_settings` ve `catalog_pricing` paralel yüklenir.
- `persist()` **fark tabanlı** çalışır: her job'un JSON'u bir snapshot ile karşılaştırılır,
  yalnızca değişenler `upsert`, silinenler `delete` edilir.
- Realtime abonelikleri `jobs` ve `app_settings` tablolarını dinler; başka bir cihazda
  yapılan değişiklik anında ana ekrana yansır.
- Eski sürüm `localStorage` kullanıyordu. Uygulama açılışta eski anahtarları
  (`studio_etiket_jobs_v1`, `studio_catalog_v1`, `studio_settings_v1`) kontrol eder ve
  bulursa **"Eski verileri içe aktar"** çubuğunu gösterir.

**Çakışma çözümü yoktur.** İki kişi aynı belgeyi aynı anda düzenlerse son yazan kazanır.

---

## 9. Güvenlik durumu

Bu bölümü entegrasyondan **önce** okuyun.

| Bulgu | Ayrıntı |
|---|---|
| **Kimlik doğrulama yok** | Kodda `sbUser` değişkeni tanımlı ama hiç kullanılmıyor; HTML'de `#acct-bar` alanı var ama hiç doldurulmuyor. Giriş ekranı yok. Dosyayı açan herkes tüm veriye erişir. |
| **Anahtar dosyada açık** | Supabase URL'i ve publishable key JavaScript içinde düz metin. Publishable key zaten istemciye açık olacak türden ama... |
| **RLS büyük ihtimalle açık** | Uygulama giriş yapmadan `jobs` tablosuna yazabildiğine göre, anon rolün insert/update/delete yetkisi olmalı. Yani URL'i bilen herkes tüm belgeleri okuyabilir ve silebilir. |
| **Yıkıcı işlem korumasız** | `catResetAll()` tüm ürün maliyet ve fiyat verisini tek `confirm()` sonrası siler. Yetki kontrolü yok, geri alma yok. |
| **Üçüncü taraf proxy'ler** | TCMB kuru için `allorigins.win`, `codetabs.com`, `corsproxy.io`, `thingproxy.freeboard.io` üzerinden geçiliyor. Bunlar isteği görebilen dış servisler; kur verisi hassas değil ama bağımlılık dışarıda. |
| **CDN bağımlılığı** | JsBarcode, supabase-js, SheetJS ve Google Fonts dış CDN'lerden. Bunlar kesilirse uygulama kısmen veya tamamen çalışmaz — offline kullanım mümkün değil. |

Bunlar mevcut kullanımda (bilinen kişilerin eriştiği, URL'i paylaşılmayan bir iç araç)
kabul edilebilir olabilir; ancak **daha geniş bir projeye monte edilirken bu varsayım
geçerliliğini yitirir.**

---

## 10. Kod kalitesi notları

Entegrasyon planlarken bilinmesi gerekenler:

- **Yinelenen fonksiyon tanımları.** `supList`, `supSave`, `supDelete`, `supNextCode`,
  `katList`, `katCard`, `katDoc`, `fabKartelaPane`, `fgList`, `fgAddGroup`, `fgAddType`,
  `fgDelGroup`, `fgDelType`, `fgImportApply`, `catAutoPrice` gibi fonksiyonlar dosyada
  **iki kez** tanımlı. JavaScript'te sonraki tanım öncekini geçersiz kılar, yani
  **yalnızca dosyanın sonundaki sürüm çalışır.** Bu, zaman içinde yamaların dosya
  sonuna eklenmesinden kaynaklanıyor. Taşırken ölü kodu ayıklamak şart.
- **Global isim alanı.** Tüm fonksiyonlar `window` üzerinde; HTML'de `onclick="..."`
  ile çağrılıyor. Bir modül sistemine taşırken her handler'ın yeniden bağlanması gerekir.
- **Test yok, lint yok, tip yok.**
- **Sürüm kontrolü izi yok.** Dosya adındaki `__3_` bir tarayıcı indirme ekidir;
  gerçek sürümleme yalnızca dosya başındaki yorumda ("v3 – vektörel").
- **Karışık dil.** Değişken ve fonksiyon adları Türkçe kısaltmalar (`fy` = föy,
  `tk` = teklif, `so` = sipariş onay, `ml` = maliyet, `oz` = özet, `kat` = kartela,
  `sup` = tedarikçi, `fg` = fabric group, `cdd` = custom dropdown). Bu kısaltma
  sözlüğü olmadan kod okunmuyor — yukarıdaki listeyi saklayın.

---

## 11. Başka bir proje içinde kullanma

### Önce: bu proje ve teklead kardeş sistemler

Daha önce incelediğimiz **teklead** ile bu uygulama **aynı şirkete** ait
(`info@tekstilas.com`, aynı lacivert `#1f2f57` / turuncu `#ef7e1d` marka renkleri,
aynı kadın giyim kataloğu). Ama:

| | teklead | bu uygulama |
|---|---|---|
| Supabase projesi | `sthmktgwcfttopqadjau` | `fzcagsyxpkdgnqfoyxtz` |
| Yığın | React 19 + TS + Vite | saf JS, tek dosya |
| Auth | Supabase Auth + RLS | yok |
| Kapsam | müşteri bulma ve iletişim | belge üretme ve fiyatlandırma |

**İki ayrı Supabase projesinde duruyorlar.** Birleştirme düşünülüyorsa bu, kararın
merkezindeki gerçektir: tablolarda isim çakışması yok (`jobs`, `catalog_pricing`,
`app_settings` vs. teklead'in tabloları), yani şema düzeyinde birleşme mümkün.
Ama teklead'in RLS'i kilitli, bunun RLS'i açık — **birleştirme anında bu uygulamaya
mutlaka auth eklenmelidir**, yoksa teklead'in müşteri verisi de açığa çıkar.

### Senaryo A — Olduğu gibi bırakıp bağlantı kurmak (en düşük risk)

Statik bir yere koyup (`belge.example.com`) ana projeden link vermek. Yapılacaklar:

1. Supabase'de anon rolün yetkisini kısın, uygulamaya bir giriş ekranı ekleyin
2. Katalog fotoğraflarını Supabase Storage'a taşıyıp dosyayı ~700 KB'a indirin
3. CDN bağımlılıklarını yerelleştirin (veya en azından SRI hash ekleyin)

Bu üç adım birkaç günlük iş ve uygulamanın mimarisine dokunmaz.

### Senaryo B — Belge motorunu çekip almak (en değerli parça)

`xxxDoc()` fonksiyonları **saf**: durum nesnesi girer, HTML string çıkar. Bunlar
herhangi bir projeye — React dahil — neredeyse değiştirilmeden taşınabilir:

```
stickerHTML()      koli etiketi
numuneHTML()       numune etiketi
siparisDocHTML()   sipariş formu (matris + barkod tablosu)
fyBuildDoc()       teknik föy (otomatik sayfalama ile)
tkQuoteDoc()       fiyat teklifi (çift dilli)
soDoc()            sipariş onay formu
ozDoc()            ürün maliyet/kâr özeti
mlDoc()            maliyet dökümü
katSheet()         kumaş kartelası
bulkDoc()          toplu ürün teklifi
```

Yanlarında taşınması gerekenler: ilgili CSS blokları, `setPageOrient`,
`renderBarcodes`, `H`/`A`, ve `xxxFit` ölçekleyicileri.

**Dikkat:** Bu fonksiyonlar HTML string döndürür. React'e taşırken `dangerouslySetInnerHTML`
kullanmak yerine, yazdırma için ayrı bir DOM konteynerine basmak daha temiz olur —
zaten mevcut mimari de böyle çalışıyor (`#print-root`).

### Senaryo C — Sadece iş mantığını almak

Belge üretmeden yalnızca hesaplamayı istiyorsanız:

| Fonksiyon | İşi |
|---|---|
| `mlItemTutar`, `mlCalc` | Maliyet kalemi ve toplam hesabı (metre/tutar, TRY/USD) |
| `pricingTiers`, `catAutoPrice` | Kademeli fiyat üretimi (adet + kâr marjı → birim fiyat) |
| `ozCompute`, `ozCostSub` | Kâr/marj hesabı ve para birimi normalizasyonu |
| `gridTotals` | Renk×beden matrisi satır/sütun/genel toplamı |
| `tkLoadTCMB` | TCMB kuru çekme (6 kademeli proxy fallback'i ile) |
| `RENK_LISTESI` | 34 standart tekstil rengi + hex kodu |
| `URUN_GRUPLARI`, `BEDEN_SETLERI`, `BAKIM`, `CARE_ICONS` | Tekstil taksonomisi ve bakım talimatı SVG ikonları |
| `katCalcCode` | Kartela kodu üretimi (yıl + grup + tür + renk + tedarikçi) |
| `fgParseText`, `fgImportColumns` | CSV/TSV/Excel'den kumaş grubu içe aktarma |
| `titleTR`, `titleCaseTR` | Türkçe'ye duyarlı başlık biçimlendirme (i/İ sorunu çözülmüş) |

### Senaryo D — Modern bir yığına taşımak

Yeniden yazma kararı verilirse gerçekçi sıralama:

1. **Veriyi koddan ayırın.** 143 ürünü ve fotoğrafları veritabanına + object storage'a
   taşıyın. Bu tek adım dosyayı 9,66 MB'tan ~700 KB'a indirir ve kataloğu
   kod değişikliği olmadan güncellenebilir hale getirir.
2. **`jobs.data` blob'unu parçalayın.** Belge tiplerini gerçek tablolara ayırın
   ki raporlama, arama ve yetkilendirme mümkün olsun.
3. **Auth ve RLS ekleyin.**
4. **Belge motorunu olduğu gibi taşıyın.** Bu katman zaten sağlam; yeniden yazmaya
   gerek yok, sarmalamak yeterli.
5. **Yinelenen fonksiyonları temizleyin** (§10).

### Entegrasyondan önce mutlaka bakılacaklar

| Konu | Ne yapmalı |
|---|---|
| Auth yok, RLS muhtemelen açık | Birleştirmeden önce çözün — teklead verisi de risk altına girer |
| 8,9 MB gömülü fotoğraf | Storage'a taşıyın; her açılışta 9,66 MB indirmek mobilde kullanılamaz |
| Yinelenen fonksiyon tanımları | Hangi sürümün canlı olduğunu (dosyadaki son tanım) doğrulayın |
| Marka sabitleri | Logo (base64), `Tekstil A.Ş.`, telefon/WhatsApp/e-posta `fyFoot()` içinde; renkler `NV`/`OR` sabitlerinde |
| Türkiye'ye özgü | `tr-TR` sayı biçimi, TCMB kuru, TR başlık biçimlendirme, `₺` varsayılan |
| Katalog kodu formatı | `ST-26SS190009` (marka + sezon + tür + sıra) — kendi kodlama şemanız varsa eşleme gerekir |
| CDN kesintisi | JsBarcode/supabase-js/SheetJS düşerse uygulama çalışmaz; yerelleştirin |
| Çakışma çözümü yok | Çok kullanıcılı hale gelecekse son-yazan-kazanır davranışı sorun çıkarır |
| Belge şeması sözleşmesiz | `jobs.data` yapısı yalnızca JS'te tanımlı; taşırken her tip için şema yazın |

---

## 12. Hızlı referans — kısaltma sözlüğü

Kodu okurken en çok işinize yarayacak şey bu:

| Ön ek | Anlamı |
|---|---|
| `fy` | Teknik föy |
| `tk` | Fiyat teklifi |
| `so` | Sipariş onay |
| `sip` | Sipariş formu |
| `ml` | Maliyet |
| `oz` | Özet |
| `cat` | Katalog |
| `kat` | Kartela |
| `sup` | Tedarikçi (supplier) |
| `fg` | Kumaş grubu (fabric group) |
| `cdd` | Aranabilir açılır menü (custom dropdown) |
| `pset` | Fiyat kademesi ayarları (pricing settings) |
| `bulk` | Toplu ürün belgesi |

| Soru | Nereye bakmalı |
|---|---|
| Uygulama nasıl başlıyor | `sbBoot()` → `startApp()` (dosya sonuna yakın `initSiparis(); catInit(); sbBoot();`) |
| Görünüm nasıl değişiyor | `showView(v)` + `popstate` dinleyicisi |
| Veri nasıl kaydediliyor | `persist()`, `saveSettings()`, `saveCatStore()` |
| Bir belge nasıl PDF oluyor | `xxxMakePDF()` → `#print-root` → `window.print()` |
| Fiyat nasıl hesaplanıyor | `catAutoPrice()` + `pricingTiers()` |
| Katalog verisi nerede | `const CATALOG=[...]` — JS içinde sabit |
