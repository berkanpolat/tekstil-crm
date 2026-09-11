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
- **Geri dönülebilirlik.** İki hafta boyunca tek SQL ile eski hale dönülebilecek.
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
   ├─ R2'den nesneyi okur (kenar önbelleği: kalıcı)
   └─ Cache-Control: public, max-age=31536000, immutable + ETag
   ▼
R2 kovası  "tekstil-crm-dosya"  (dışarıya KAPALI)
```

`crm.tekstilas.com` ve `dosya.tekstilas.com` aynı kayıtlı alan adı altında
olduğu için çerez **aynı site** sayılır; `SameSite=Lax` alt kaynak
isteklerinde (img/fetch) sorunsuz gider.

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
3. `files` kaydı var mı, `deleted_at is null` mı (kullanıcının jetonuyla, RLS).
4. Yükleme ise: MIME izin listesinde mi, boyut ≤ 25 MiB mi.

JWKS uç noktası doğrulandı (2026-09-11): proje asimetrik anahtar (ES256)
kullanıyor, açık anahtar `/auth/v1/.well-known/jwks.json` adresinden alınır ve
Worker'da 24 saat önbeklenir. **Paylaşılan sır yoktur** — 1 Eylül SAST
kararıyla uyumlu.

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
| Kenar önbelleği (Worker Cache API) | R2 okuması yalnız ilk istekte |
| ETag + koşullu istek | Yenilemede 304, gövde yok |
| Önceden üretilmiş küçük resim | Liste görseli ~8 KB (bugün ~250 KB) |
| `files` kaydı 60 sn kenarda | 40 görsellik ızgara = 1 DB sorgusu |

Katalog ızgarası için kaba tahmin: bugün ~10 MB indirme, sonrasında ilk
ziyarette ~320 KB, ikinci ziyarette 0.

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
eski derlemenin yayını. Supabase nesneleri yerinde durduğu için veri kaybı yok.
Geçiş sonrası yüklenen dosyalar için küçük bir geri-taşıma betiği gerekir;
iki haftalık pencerede bu en fazla birkaç yüz dosyadır.

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
