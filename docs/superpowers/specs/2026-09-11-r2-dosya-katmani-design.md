# Dosya katmanının Cloudflare R2'ye taşınması

**Tarih:** 2026-09-11
**Durum:** Onaylandı, uygulama planı bekleniyor
**Kapsam:** Supabase Storage → Cloudflare R2 + özel Worker

---

## 1. Neden

Üç somut dert var:

1. **Kota ve ücret.** Supabase ücretsiz katmanı 1 GB depolama veriyor. Canlıda
   3.794 nesne, 854 MB. Sınıra dayandık; büyümek ücretli plan demek.
2. **Görsel dönüşümü yok.** Küçük resim üretimi Supabase'de ücretli bir özellik.
   `CatalogImage` bugün dönüşümü deneyip başarısız olunca **orijinali** indiriyor.
   Yani katalog ızgarası 40 adet tam boy görsel çekiyor.
3. **Dağınıklık.** Diğer projeler ve belge motoru zaten Cloudflare'da.

Ek olarak imzalı URL modeli tarayıcı önbelleğini tamamen devre dışı bırakıyor:
60 saniyelik imza her sayfa açılışında yeniden üretiliyor, adres değiştiği için
tarayıcı her seferinde yeniden indiriyor.

## 2. Hedefler

- **Sıfır ek ücret.** Her parça ücretsiz katman içinde kalacak.
- **Görünür hız artışı.** İkinci ziyarette liste sayfaları hiç görsel indirmeyecek.
- **Yetki bugünküyle aynı seviyede.** Zayıflatma yok.
- **Geri dönülebilirlik (kısmen tek SQL — bkz. düzeltme).** Geçiş ANINA kadar
  yüklenmiş dosyalar için iki hafta boyunca tek SQL ile eski hale dönülebilecek
  (Supabase kovası dokunulmadan durduğu için). **Geçişten SONRA yüklenen
  dosyalar bu kapsamda DEĞİLDİR** — onlar yalnız R2'de var, Supabase kovasında
  hiç bulunmazlar; `bucket='documents'` güncellemesi eski koda o dosyaları
  GÖRÜNMEZ bırakır. Bu dosyalar için ayrı, elle bir kurtarma gerekir —
  ayrıntı ve risk listesi SQL'i için bkz. §8 "Geri dönüş".
- **Tüketici kodu değişmesin.** ~20 sayfa/bileşen `useFiles` sözleşmesine bağlı;
  o sözleşme korunacak.

### Hedef olmayanlar (YAGNI)

- Dosya bazlı ince yetkilendirme (bugünkü kural: etkin kullanıcı hepsini okur).
- Çoklu kova. Tek kova yeter; `avatars` zaten boş.
- Sürüm geçmişinin R2'de tutulması (DB'deki `replaces_file_id` zinciri yeterli).
- Kullanıcıya görünen bir dosya yöneticisi.

## 3. Maliyet zarfı

| Kaynak | Ücretsiz sınır | Tahmini kullanım | Pay |
|---|---|---|---|
| R2 depolama | 10 GB | 0,9 GB + küçükler ≈ 1,1 GB | %11 |
| R2 A sınıfı (yazma) | 1 M/ay | taşımada ~11 bin, sonra yüzler | %1 |
| R2 B sınıfı (okuma) | 10 M/ay | on binler | %1 |
| R2 çıkış trafiği | sınırsız | — | — |
| Worker istek | 100 bin/gün | binler | %1-2 |
| Worker CPU | 10 ms/istek | <1 ms (akıtma + imza) | %10 |
| Özel alan adı | ücretsiz | 1 | — |

**Kritik karar:** Küçük resim **yükleme anında bir kez** üretilip R2'ye ayrı nesne
olarak konur. Cloudflare Image Resizing kullanılmaz — o ayda 5.000 benzersiz
dönüşümden sonra ücretlidir (bin başına ~0,50 $) ve 3.400 görselin iki boyutu
6.800 eder. Önceden üretim hem ücretsiz hem de sunumda hiç işlem gerektirmediği
için daha hızlıdır.

## 4. Mimari

```
tarayıcı
   │  (1) giriş sonrası: POST dosya.tekstilas.com/oturum  [Bearer jeton]
   │      ← Set-Cookie: dosya_oturum (HttpOnly, Secure, SameSite=Lax)
   │
   │  (2) <img src="https://dosya.tekstilas.com/d/<yol>?w=160">
   ▼
Cloudflare Worker  "tekstil-dosya"
   ├─ çerezdeki JWT'yi Supabase JWKS ile YEREL doğrular (ağ turu yok)
   ├─ files kaydını Supabase REST'ten kullanıcının kendi jetonuyla sorar (RLS)
   │     └─ kenar önbelleği: 60 sn
   ├─ R2'den nesneyi okur (kenar önbelleği YOK — bkz. §7 düzeltmesi)
   └─ Cache-Control: private, max-age=31536000, immutable + ETag
   ▼
R2 kovası  "tekstil-crm-dosya"  (dışarıya KAPALI)
```

`crm.tekstilas.com` ve `dosya.tekstilas.com` aynı kayıtlı alan adı altında
olduğu için çerez **aynı site** sayılır; `SameSite=Lax` alt kaynak
isteklerinde (img/fetch) sorunsuz gider.

**Düzeltme (2026-09-11, bütünsel inceleme):** Bu belge daha önce
`Cache-Control: public, ...` yazıyordu; uygulanan kod `private, ...` kullanıyor
ve KODUN DOĞRU OLDUĞU tespit edildi — belge koda uyduruldu. Gerekçe: içerik
kullanıcıya özel yetkili (RLS'ten geçmiş, `files` kaydı sorgulanarak
doğrulanmış) veriyi taşıyor. `public` işaretlemek paylaşılan ara sunuculara
(kurumsal proxy, CDN katmanı, bazı tarayıcı-dışı önbellekler) bu içeriği
önbelleklemesi için izin verir — bir kullanıcının görsel/PDF'i başka bir
kullanıcıya (aynı paylaşılan önbellek arkasındaki) servis edilebilir. `private`
yalnız isteği yapan tarayıcının kendi diskinde önbelleklemesine izin verir;
§7'deki "ikinci ziyarette sıfır istek" hız kazanımı `private` ile de tam olarak
geçerlidir (tarayıcı önbelleği paylaşılan proxy önbelleği değildir).

### 4.1 Neden çerez

Bir `<img>` etiketi `Authorization` başlığı gönderemez. Seçenekler:

| Yol | Önbellek | Sızma riski | Karar |
|---|---|---|---|
| Çerez | ✅ tam | düşük (HttpOnly) | **seçildi** |
| Sorgu dizesinde jeton | kısmi | referrer/log sızıntısı | hayır |
| `fetch` + blob URL | ❌ yok | — | hayır |

## 5. Bileşenler

### 5.1 Worker — `services/dosya-worker/`

Dört uç. **Listeleme ucu yoktur** (kova içeriği sayılamaz).

| Uç | Yöntem | İş |
|---|---|---|
| `/oturum` | POST | Bearer jetonu doğrular, çerezi bırakır |
| `/d/<yol>` | GET, HEAD | Dosyayı verir. `?w=160` / `?w=480` küçük resim |
| `/y` | PUT | Dosya yükler (MIME + boyut + yol denetimi) |
| `/s` | POST | Nesneleri siler (orijinal + 2 küçük) |

**Doğrulama sırası** (her istekte, sırayla):

1. Çerez var mı, JWT imzası JWKS ile geçerli mi, `exp` geçmemiş mi.
   (Yalnız `/y` ucu ikinci bir yol kabul eder: servis sırrı başlığı — bkz. 5.4.)
2. Yol biçimi: `^[a-z0-9_\-./]{1,200}$`, `..` ve ters bölü yasak.
3. `files` kaydı var mı, `deleted_at is null` mı (kullanıcının jetonuyla, RLS
   → iptal kontrolü buradadır). Sonuç **(kullanıcı, yol)** anahtarıyla 60 sn
   kenarda tutulur.
4. Yükleme ise: MIME izin listesinde mi, boyut ≤ 25 MiB mi.

JWKS uç noktası doğrulandı (2026-09-11): proje asimetrik anahtar (ES256)
kullanıyor, açık anahtar `/auth/v1/.well-known/jwks.json` adresinden alınır ve
Worker'da 24 saat önbeklenir. **Paylaşılan sır yoktur** — 1 Eylül SAST
kararıyla uyumlu.

#### Yetki iptali — belge motoru kararıyla ilişki

`services/pdf-worker/src/index.js` kimliği bilerek Supabase'e **sorarak**
doğruluyor. Oradaki gerekçe yerinde: yalnız imza doğrulamak, çıkarılmış bir
kullanıcıyı jeton süresi dolana dek (≈1 saat) içeri almaya devam eder.

Bu Worker imzayı yerelde doğruluyor ama **iptal kontrolünü kaybetmiyor**,
çünkü ikinci adım zaten canlı bir veritabanı sorgusu: `files` kaydı
kullanıcının kendi jetonuyla sorulur ve `files` üzerindeki RLS
`public.is_active_user()` çağırır. Çıkarılmış kullanıcının sorgusu orada
boş döner. İmza doğrulaması yalnız **ucuz ilk kapıdır**; yetkinin kaynağı
veritabanıdır.

Önbellek bu yüzden **(kullanıcı, yol)** çiftine göre anahtarlanır, yalnız yola
göre değil. Yola göre anahtarlansaydı bir kullanıcının olumlu sonucu
diğerlerine servis edilir ve iptal tamamen devre dışı kalırdı.

**İptal penceresi: en çok 60 saniye** (önbellek ömrü). Belge motorundaki 0
saniyeye göre bir gevşeme, 1 saatlik saf yerel doğrulamaya göre büyük bir
sıkılaşma. Görsel başına canlı sorgu yapmadan bir katalog ızgarasını taşımanın
başka yolu yok; 60 saniye bilinçli ve belgelenmiş bir takastır.

**Tarayıcı önbelleği ayrı bir konudur.** Kullanıcının daha önce indirdiği
dosyalar diskinde kalır ve yetkisi kalksa da açılır. Bu her önbellek şemasında
böyledir ve kabul edilmiştir: o dosyaları zaten indirmişti. Henüz görmediği
bir dosya 60 saniye içinde kapanır.

MIME ve boyut sınırları bugünkü `documents` kovasındakiyle birebir aynıdır
(25 MiB; pdf, jpeg, png, webp, gif, heic, heif, xlsx, docx, xls, csv, txt, zip).

### 5.2 Ön yüz — `src/hooks/useFiles.ts`

Yeniden yazılır ama **dışa verdiği sözleşme korunur**:
`useUploadFile`, `useEntityFiles`, `useDeleteFile`, `useSignedUrl`, `getSignedUrl`.
Böylece 20 tüketici dosyaya elle dokunulmaz.

- `getSignedUrl` artık imza üretmez, **kalıcı adres** döndürür. Adı geriye
  dönük uyum için korunur; JSDoc'ta bunun artık imzalı olmadığı yazılır.
  `downloadName` verilirse `?indir=<ad>` eklenir, Worker
  `Content-Disposition: attachment` koyar.
- `useSignedUrl` React Query yerine düz türetme olur (ağ isteği yok). 45 sn'lik
  `staleTime` ve imza yenileme mantığı silinir.
- Yükleme: görselse tarayıcıda `canvas` ile 160 ve 480 piksel WebP üretilir,
  üç nesne de Worker'a PUT edilir, sonra `files` kaydı bugünkü gibi yazılır.
  Sağlama toplamı **orijinalin** SHA-256'sı olarak kalır.

**Çerez ömrü sonu davranışı:** `src/lib/dosyaOturum.ts` çerez tazelemeyi tek
yerde tutar. Supabase `onAuthStateChange` ile `TOKEN_REFRESHED` olayında
`/oturum` yeniden çağrılır. Ayrıca resim bileşenleri `onError`'da **bir kez**
oturumu tazeleyip görseli tekrar dener; ikinci hatada kırık simge gösterilir.
Bu, "bir saat sonra boş kare" hatasına karşı emniyet ağıdır.

### 5.3 `CatalogImage` sadeleşmesi

`noTransform` yedek yolu silinir (artık dönüşüm her zaman var). Bileşen
`width`'i en yakın hazır boyuta (160 / 480) yuvarlar.

### 5.4 Talep girişi — `supabase/functions/intake-request/index.ts`

`db.storage.from('documents').upload(...)` yerine Worker'ın `/y` ucuna PUT.

**Kimlik:** Kenar işlevinin kullanıcı jetonu yoktur. `/y` ucu bu yüzden ikinci
bir yol kabul eder: `X-Servis-Sirri` başlığı. Sır yalnız iki sunucu bileşeni
arasında paylaşılır (kenar işlevi gizli değişkeni ↔ Worker gizli değişkeni),
tarayıcıya **asla** ulaşmaz. Bu, kenar işlevinin bugün kendi girişinde
kullandığı `INTAKE_SECRET` kalıbının aynısıdır. 1 Eylül SAST kararı ön yüze
gömülen sırlarla ilgiliydi; sunucular arası sır o kararın kapsamı dışındadır.
Servis sırrıyla gelen istek yalnız yükleme yapabilir, okuma yapamaz. Küçük resim Deno'da `ImageScript` ile denenir; başarısız olursa
**yalnız orijinal** konur (talep girişi asla görsel yüzünden düşmemeli).
Küçüksüz kalan kayıtlar için `scripts/kucuk-resim-tamamla.mjs` sonradan tamamlar.

### 5.5 Müşteri kalıcı silme — `src/hooks/useCustomers.ts`

RPC'nin döndürdüğü `[{bucket, path}]` listesi `supabase.storage.remove` yerine
Worker `/s` ucuna gönderilir. Her yol için üç nesne (orijinal + 2 küçük) silinir.
Bugünkü "sessiz geç" davranışı korunur (DB zaten silinmiş).

### 5.6 CORS

Resim etiketleri CORS istemez, ama `fetch` ile indiren yollar ister: dosya
indirme, yapay zekâ sipariş çıkarma, katalog dışa aktarımının görseli veri
adresine çevirmesi. Worker bu yüzden `Access-Control-Allow-Origin` olarak
**yalnız** `https://crm.tekstilas.com` (ve geliştirmede
`http://localhost:5173`) döndürür, `Access-Control-Allow-Credentials: true`
koyar ve `OPTIONS` ön uçuşunu yanıtlar. Joker köken kullanılmaz — kimlik
bilgisi taşıyan isteklerde zaten yasaktır.

### 5.7 Geliştirme ortamı

Çerez tabanlı kimlik, geliştirmede canlı Worker'a **çalışmaz**: `localhost`
ile `dosya.tekstilas.com` farklı sitedir, `SameSite=Lax` çerezi engeller.
Çözüm, geliştirmede Worker'ı yerelde çalıştırmaktır:

```
npx wrangler dev --remote      # localhost:8787, gerçek R2 kovasına bağlı
```

`localhost:8787` ile `localhost:5173` aynı sitedir (çerezlerde port önemsizdir),
bu yüzden çerez sorunsuz gider. `--remote` sayesinde geliştirici gerçek
dosyaları görür, yerel boş kova derdi olmaz.

Ön yüz adresi `VITE_DOSYA_URL` ile verilir: geliştirmede
`http://localhost:8787`, canlıda `https://dosya.tekstilas.com`.
`.env.example` bu değişkenle güncellenir.

### 5.8 Veritabanı

Tek değişiklik: `public.files.bucket` değeri `'documents'` → `'r2'`.
Tablo, RLS, tetikleyiciler, `storage_path` biçimi **aynen kalır**.
`storage.objects` üzerindeki RLS ilkeleri ve kova sınırları dokunulmadan durur
(geri dönüş için gerekli).

## 6. Depolama düzeni

```
<yol>                  → orijinal   (ör. image/9f2c…-kumas.jpg)
k/160/<yol>.webp       → 160 piksel küçük
k/480/<yol>.webp       → 480 piksel küçük
```

Önek şeması seçildi (`#` gibi özel karakter değil), çünkü `rclone`, kabuk
ve yerel dosya sistemi bu yolları sorunsuz taşır. Küçükler tek önek altında
toplandığı için toplu üretim ve toplu temizlik kolaydır.

Orijinal yol şeması taşımada **birebir korunur**, böylece `files.storage_path`
kayıtları değişmeden geçerli kalır. Worker istemciden gelen yolu asla
yapıştırmaz; `w` parametresine göre anahtarı kendisi kurar.

## 7. Hız

| Önlem | Etki |
|---|---|
| Kalıcı adres + `immutable`, 1 yıl | İkinci ziyarette **sıfır** istek |
| ETag + koşullu istek | Yenilemede 304, gövde yok |
| Önceden üretilmiş küçük resim | Liste görseli ~8 KB (bugün ~250 KB) |
| `files` kaydı 60 sn kenarda, (kullanıcı, yol) anahtarlı | ikinci açılışta DB sorgusu yok |

Katalog ızgarası için kaba tahmin: bugün ~10 MB indirme, sonrasında ilk
ziyarette ~320 KB, ikinci ziyarette 0.

**Düzeltme (2026-09-11, bütünsel inceleme — madde F):** Bu belge daha önce
"Kenar önbelleği (Worker Cache API) → R2 okuması yalnız ilk istekte" satırını
da içeriyordu. Bu satır KALDIRILDI — dosya BAYTLARI için `caches.default`
önbelleği UYGULANMADI (denendi, sonra bilinçli olarak geri alındı). Gerekçe:

1. Bu Worker'ın önbellek araması **yetki denetiminden SONRA** çalışmak
   ZORUNDADIR (aksi hâlde bir kullanıcının önbelleğe düşürdüğü dosya, o
   dosyaya erişimi olmayan başka bir kullanıcıya ya da hiç oturumu olmayan
   birine servis edilir — yetki sızıntısı). Bu sıranın bozulmaması,
   otomatik bir regresyon testiyle KORUNMASI gereken en kritik noktadır.
2. Deneme sırasında ampirik olarak doğrulandı: bu projenin Worker test
   ortamı (`@cloudflare/vitest-pool-workers`, `isolatedStorage` varsayılan
   açık) `caches.default` yazımlarını **ayrı `SELF.fetch()` çağrıları
   arasında kalıcı kılmıyor** — ne `ctx.waitUntil` ile ne doğrudan
   `await` ile. (R2 ve diğer binding'ler ayrı istekler arasında kalıcıyken
   Cache API kalıcı DEĞİL — bu ortamın belgelenmemiş bir davranışı.)
   Bunun sonucu: "ikinci istek önbellekten dönüyor mu" ve — çok daha
   önemlisi — "önbellek dolu olsa bile yetkisiz istek hâlâ reddediliyor
   mu" testleri YAZILAMADI; yazılan testler önbellek hiç gerçekten
   isabet etmediği için hem doğru hem YANLIŞ sıralamayla AYNI ŞEKİLDE
   yeşil kalıyordu (elle doğrulandı: sıra kasıtlı olarak bozulup testler
   tekrar çalıştırıldı, hepsi yine geçti). Yani bu güvenlik açısından en
   kritik davranışı koruyacak bir regresyon testi bu ortamda YAZILAMAZ.
3. Görevin kendi ölçütü şudur: **"Yanlış uygulanmış bir önbellek, hiç
   önbellek olmamasından çok daha kötüdür."** Test edilemeyen bir
   yetki-sıralı önbellek şeması — özellikle 3.821 gerçek müşteri dosyasını
   etkileyecek bir dalda — tam olarak bu risk kategorisidir: gelecekte biri
   (ya da bir YZ ajanı) `dosyaVer`'i düzenlerken sırayı yanlışlıkla
   bozarsa, mevcut test paketi bunu YAKALAMAZ.

`isolatedStorage: false` gibi bir pool ayarıyla bu kısıt aşılabilir, ama bu
tüm test paketini (55 test) etkileyen, ayrı bir tasarım kararı gerektiren
geniş kapsamlı bir değişikliktir — bu düzeltme turunun kapsamı dışında
bırakıldı. `files` kaydı önbelleği (kimlik.js, §5.1) ve tarayıcı önbelleği
(kalıcı adres + `immutable`) zaten §7'deki hız hedefinin büyük kısmını
karşılıyor; Worker Cache API katmanı YAGNI sayıldı, ileride ayrı bir
görevde (test ortamı sorunu çözüldükten SONRA) ele alınabilir.

## 8. Taşıma

Tamamı yerel makinede, ücretsiz araçlarla. `rclone` kurulu (doğrulandı).

1. **Kopya al.** `rclone sync` ile Supabase kovası yerel klasöre. Kesilirse
   kaldığı yerden sürer.
2. **Küçükleri üret.** `scripts/kucuk-resim-uret.mjs` (sharp) 3.399 görselin
   160 ve 480 piksel WebP'lerini yerelde üretir.
3. **R2'ye yükle.** `rclone sync` ile klasör → R2. Ardından `rclone check`
   ile sayı ve boyut birebir doğrulanır.
4. **Geçiş** (sakin saat, ~15 dk): son fark kopyası → tek SQL ile
   `update public.files set bucket = 'r2'` → yeni ön yüz yayını.
5. **Bekleme.** Supabase nesneleri **iki hafta** dokunulmadan durur.
6. **Temizlik.** İki hafta sonra Supabase kovası boşaltılır.

### Geri dönüş

Herhangi bir aşamada: `update public.files set bucket = 'documents'` +
eski derlemenin yayını. Bu, **geçiş ANINA kadar** yüklenmiş dosyalar için
yeterlidir — Supabase nesneleri yerinde durduğu için o kısımda veri kaybı yok.

**Ama bu TEK SQL DEĞİLDİR** (bkz. §2 "Hedefler" düzeltmesi): geçişten SONRA
yüklenen dosyalar yalnız R2'de vardır, Supabase kovasında hiç bulunmazlar.
Yukarıdaki güncelleme o dosyaları eski koda GÖRÜNMEZ bırakır — kayıp değil,
ama erişilemez, çünkü eski kod yalnız `documents` kovasına bakar.

Risk altındaki dosyaları (geçişten sonra yüklenenler) listelemek için:

```sql
-- Geri dönüşte KAYBOLACAK dosyalar (geçişten sonra yüklenenler).
-- Geçiş commit'inin zaman damgasını <GECIS_ZAMANI> yerine koy.
select id, storage_path, original_name, created_at
  from public.files
 where created_at > '<GECIS_ZAMANI>'
   and deleted_at is null
 order by created_at;
```

Geri dönüş gerekirse bu listedeki dosyalar **ELLE kurtarılmalı** (R2'den
indirilip Supabase `documents` kovasına yeniden yüklenmeli). İki haftalık
pencerede bu en fazla birkaç yüz dosyadır ve `.tasima/ham` klasörü geçiş
öncesi tam kopyayı zaten tuttuğu için (geçiş ANINDAKİ dosyalar için) elle
kurtarma emek yükü sınırlıdır; yalnız yukarıdaki sorgunun döndürdüğü,
geçişten SONRA yüklenmiş dosyalar bu kapsamın dışındadır ve R2'den ayrıca
indirilmesi gerekir.

## 9. Test

**Worker birim testleri** (vitest + miniflare):
geçerli jeton, süresi geçmiş jeton, çerezsiz istek, yol kaçışı (`..`),
MIME reddi, boyut reddi, küçük resim yoksa orijinale düşme,
önbellek başlıkları, ETag/304, `deleted_at` dolu dosyanın reddi,
yanlış servis sırrının reddi, servis sırrıyla okuma denemesinin reddi,
izinsiz kökene CORS başlığı verilmemesi.

**Ön yüz birim testleri:** adres üretici, boyut yuvarlama, canvas küçültücü.
Mevcut 243 test kırılmadan geçmeli.

**Geçiş sonrası canlı denetim:** rastgele 50 dosyaya HEAD, katalog ızgarası,
pano, bir yükleme, bir indirme, bir silme.

## 10. Bilinen sınırlar

- **HEIC/HEIF** görsellerde tarayıcı canvas çizemez → küçük resim üretilmez,
  orijinal sunulur. Katalogda HEIC yok; müşteri yüklemelerinde nadir.
- **Worker 100 bin istek/gün** aşılırsa o gün dosyalar açılmaz. Bugünkü
  kullanım bunun %1'i altında ve önbellek isteklerin çoğunu Worker'a
  ulaşmadan bitiriyor.
- **Çerez üçüncü taraf bağlamında çalışmaz.** CRM'i bir iframe içine gömen
  bir senaryo bugün yok; olursa bu tasarım gözden geçirilmeli.
- **`wrangler` oturumu süresi dolmuş.** Uygulamanın ilk adımı interaktif
  `wrangler login` — kullanıcıdan istenecek.

## 11. Açık iş: uygulama sırası

Ayrı bir uygulama planı yazılacak. Kaba sıra:
Worker → ön yüz dikişi → taşıma betikleri → kuru prova → geçiş → temizlik.
