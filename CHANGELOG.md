# Değişiklik Günlüğü

Bu projenin tüm önemli değişiklikleri bu dosyada tutulur.
Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) esaslıdır ve
sürümleme [Semantic Versioning](https://semver.org/lang/tr/) izler.

> **Kural:** Her paket sonunda bu dosyaya bir girdi eklenir, `package.json`
> sürümü artırılır ve `git tag` atılır (bkz. CLAUDE.md → "Sürüm & değişiklik günlüğü").
>
> **Not (defter kayması):** Migration dosyalarının tarih önekleri, commit
> tarihlerinden ileridir (CLAUDE.md'de belgelenen bilinen durum). Aşağıdaki
> tarihler **commit** tarihleridir; migration adları uygulanan dosyalardır.

---

## [1.11.0] — 2026-08-17

### Eklendi
- **Müşteri silme — arayüz.** v1.10.0 backend RPC'lerinin UI'si.
  - Müşteri kartında **"Arşivle"** (mevcut yetki) — onay sonrası müşteri + açık
    operasyonları gizlenir, listeye döner.
  - Müşteri kartında **"Kalıcı Sil"** yalnız `customers.delete` yetkisiyle görünür.
    Akış: önizleme (talep/teklif/numune/sipariş/belge/etkileşim/dosya dökümü) →
    cari/ödeme varsa buton kapalı + "arşivleyin" uyarısı → **müşteri adını yazarak**
    onay → `customer_hard_delete` → dönen storage yolları bucket'tan temizlenir → toast.
  - Müşteri listesinde **"Arşiv"** toggle'ı: arşivlenenleri gösterir; seçip
    **"Arşivden çıkar"** ile geri alınır (yalnız birlikte arşivlenen operasyonlar döner).
  - Hook'lar: `useArchiveCustomer`, `useUnarchiveCustomer`, `useCustomerDeletePreview`,
    `useHardDeleteCustomer` (`useCustomers.ts`); `CustomerDangerActions` bileşeni.

## [1.10.0] — 2026-08-17

### Eklendi
- **Müşteri silme — iki aşamalı altyapı (backend).** Yanlış/deneme müşterilerin
  raporları kirletmemesi için canlı öncesi temizlik.
  - **Arşivle (soft-delete, geri alınabilir):** müşteri + o an açık operasyonları
    `deleted_at` ile gizlenir. Birlikte arşivlenenler `operations.archived_with_customer`
    ile işaretlenir; arşivden çıkarınca **yalnız** onlar geri gelir (önceden ayrı
    silinmişler kalır).
  - **Kalıcı sil (`customers.delete` yetkisi = owner+admin):** `SECURITY DEFINER`
    RPC, tek transaction, sıralı silme. Cari hareketi/ödemesi olan müşteri kalıcı
    silinemez (muhasebe izi) — arşivle yetinilir. Storage yolları çağırana döndürülür
    (istemci `storage.remove` ile temizler).
  - **Önizleme RPC:** silmeden önce talep/teklif/numune/sipariş/belge/etkileşim/dosya
    sayıları + `cari_hareket`/`odeme` + `can_hard_delete`.
  - Migration `20260821000000_customer_two_stage_delete.sql`: `operations.archived_with_customer`
    kolonu, `customers.delete` yetkisi (owner+admin), 4 RPC (`customer_delete_preview`,
    `customer_archive`, `customer_unarchive`, `customer_hard_delete`). Canlıya `psql -f`
    ile uygulandı; guard'ın `false` yolu rollback'li denemeyle doğrulandı. UI ayrı pakette.

## [1.9.0] — 2026-08-17

### Eklendi
- **Yeni Sezon katalog maliyet aktarımı (469 ürün).** `data/maliyet.csv` →
  `product_costs` + `product_cost_items`. Eşleştirme `catalog_products.source_code`
  ile (katalog 4). Kur canlı okundu (TCMB 2026-08-17, USD=47.8066) ve `rate_snapshot`'a
  kayıt anı kuru olarak donduruldu; canlı görünüm zaten `sumCost` ile güncel kurdan
  hesaplıyor (v1.6.0).
  - 469 `product_costs` + 1407 `product_cost_items` (ürün başına kumaş USD +
    işçilik TRY + aksesuar TRY).
  - Kumaş kalemi: `fabric_name` = katalog `composition`, `name` = `"Kumaş — <CSV orijinal>"`.
  - **Maliyetsiz kalan 6 ürün** (kasıtlı atlandı): `BB_C_01`, `BB_C_03`, `BB_P_02`
    (boş), `E_P_14` (yalnız kumaş adı), `K_P_07` (işçilik girilmemiş),
    `004_takimi-kirmizi` (CSV'de yok). "Beyaz Yelekli Takım" kod değil ürün adı
    olduğu için eşleşmedi.
  - `scripts/maliyet-aktar.mjs`: idempotent (source_code, hedef 469 ürünle sınırlı),
    tek transaction (hata → tam rollback), 4 katman doğrulama (çapraz kontrol,
    aykırı değer taraması, elle kontrol listesi, marj doğrulaması). `--write`
    olmadan kuru koşu. Migration gerekmedi.

### Değiştirildi
- **Marj kademeleri artırıldı:** 50 adet %25→**%40**, 200 adet %20→**%30**,
  500 adet %10→**%25** (`margin_tiers`). *Ayarlar → Fiyatlandırma* ekranından
  düzenlenebilir; yardım metnindeki eski örnek güncellendi.

## [1.8.2] — 2026-08-17

### Düzeltildi
- **Karışık en/boy oranlı katalog görselleri artık kesilmiyor.** Yeni katalog
  kaynak dosyaları 15 farklı en/boy oranında (çoğunluk 0.746; 363 dosya 0.558 çok
  uzun; bazıları kare). Arayüz eski tekdüze 2:3 kataloğa göre yazıldığından yeni
  görseller kırpılıyordu.
  - Izgara kartı: `aspect-[2/3]` → `aspect-[5/7]`, `object-contain` (kırpma yok;
    boşluk nötr `bg-muted/30` ile dolar). Eski 2:3 görseller de bozulmadan sığar.
  - Liste satırı thumbnail (`size-10`) ve detay galeri thumbnail (`size-14`):
    `object-cover` → `object-contain` (`contain` prop → Supabase transform de
    `resize: contain`).

### Not
- **4 düşük çözünürlüklü kaynak görsel** tespit edildi (gerekirse Drive'dan
  yeniden indirilecek):
  - `P_C_10` → **YS-0171** Çizgili Cepli Pamuk Keten Kapri Pantolon — 1.webp, 2.webp (400×533)
  - `TK_T_011` → **YS-0365** Modal Etek Takım Haki — 2.webp (326×489)
  - `ET_T_14` → **YS-0115** Pamuk Keten Uzun Kot Etek Kahverengi — 2.webp (326×489)

## [1.8.1] — 2026-08-17

### Değişti
- **Yeni katalog ürün kodları sıralıdan rastgeleye.** `YS-0001…YS-0475` sıralı
  formatı, `YS-` + 6 rastgele karakter (`YS-XXXXXX`) formatına taşındı. Alfabe
  `generate_operation_code` ile aynı: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
  (karışıklık yaratan I/O/0/1 hariç). 475 ürünün tamamı taşındı, çakışma 0.
  - **Storage'a dokunulmadı:** `files.storage_path` (`catalog/YS-0001/N.ext`)
    donuk kaldı; yol ile `code` arasında join olmadığından yalnız
    `catalog_products.code` değişti. 2452 görsel bağı korundu (id FK üzerinden).
  - **Eşleme/rollback logu:** kalıcı `catalog_yscode_migration` tablosu
    (`source_code ↔ old_code ↔ new_code`). Geri alma tek UPDATE ile mümkün.
  - Ön-kontrol: hiçbir teklif/belge/operasyon YS kodunu metin olarak
    kopyalamamıştı (0 kayıt) → taşıma yan etkisiz. Mevcut 197 ST- ürünü etkilenmedi.
  - Migration: `20260820000000_catalog_ys_random_code.sql`.

## [1.8.0] — 2026-08-17

### Eklendi
- **Yeni Sezon Katalog aktarımı (475 ürün + 2452 görsel).** `data/yeni-katalog.csv`
  ve `data/yeni-katalog-gorseller/` kaynaklarından, mevcut 197 ürünlük katalog ile
  342 kayıtlık kategori ağacına dokunmadan ayrı bir sezon kataloğu oluşturuldu:
  - Yeni `catalogs` kaydı "Yeni Sezon Katalog" (season `26SS`, year `2026`).
  - Yeni kategori ağacı: kök `ys_root` "Yeni Sezon" + 14 çocuk (Elbise, Tunik,
    Ferace, Pantolon, Etek, Gömlek, Ceket, Tulum, Sweatshirt, T-Shirt,
    Kimono & Panço, Alt Üst Takım, Bluz & Büstiyer, Ev Giyim).
  - 3 koleksiyon (katalog-scoped): Tesettür (175), Premium (156), Casual (144).
  - 475 ürün: kod `YS-0001…YS-0475`, CSV "Kodlar" değeri `source_code`'ta saklandı
    (maliyet eşleştirme + idempotent koruma), kumaş 52 ham yazımdan 36 kanonik
    değere normalize edildi (küratörlü sözlük; Crep+Krep→Krep, Viscon+Viskon→Viscon,
    Tencel+Tensel→Tencel, Cupra+Kupra→Kupra; İ/I 'en' locale ile Denim/Viscon).
  - 2452 görsel Storage'a (`documents/catalog/YS-*`) + `files` + `catalog_product_images`
    olarak yüklendi; `1.webp` → ana görsel, diğerleri diğer.
- `scripts/yeni-katalog-aktar.mjs` — katalog→kategori→koleksiyon→ürün, idempotent
  (`(catalog_id, source_code)` çakışmasında günceller), tek transaction.
- `scripts/yeni-katalog-gorsel-yukle.mjs` — görsel yükleyici; idempotent (yüklenmiş
  dosyayı atlar), her 100 dosyada ilerleme, art arda 5 hata devre kesici.

### Uygulanan migration
- `20260819000000_catalog_source_code.sql` — `catalog_products.source_code text`
  kolonu + kısmi unique index (`catalog_id, source_code` — idempotent içe aktarma).

## [1.7.0] — 2026-08-17

### Eklendi
- **Katalog görsel indirme araçları (kimlik-gerektirmeyen, idempotent).**
  Önceki indirmede Drive oturumu koparak 367 ürün "klasör erişilemedi" hatası
  almış, log yanıltıcı biçimde "BİTTİ: 475" yazmıştı. Yeni araç seti bunu
  onarır ve tekrarlanabilir kılar:
  - `scripts/katalog-eksikleri-bul.mjs` — `data/yeni-katalog.csv` ile diski
    karşılaştırıp eksik ürünleri bulur; klasör kaynağını iki biçimden
    (yardımcı klasör-kimliği kolonu veya `GÖRSEL LİNKİ` içindeki
    `/folders/` ya da `/file/d/` URL'si) çözer.
  - `scripts/katalog-manifest-derle.mjs` — çözülen parent klasörleri
    `scripts/katalog-manifest.json`'a (kod→klasör eşlemesi) derler.
  - `scripts/katalog-gorsel-indir.mjs` — **public** Drive URL'leriyle
    (kimlik/oturum yok) klasör kazır, görselleri indirir, md5 ile mükerrer
    eler, genişlik >1200 ise 1200'e küçültüp lossy `cwebp -q 80` ile
    `.webp`'e çevirir. İdempotent (inmiş ürünü atlar), 3 kez yeniden deneme
    (5-10-20 sn), art arda 5 hatada **devre kesici**, sonda dürüst rapor
    (başarılı/atlandı/hatalı).
  - `scripts/katalog-manifest.json` — 367 eksik ürünün kod→klasör eşlemesi.

### Düzeltildi
- Eksik 367 katalog ürünün görselleri indirildi; katalog **475/475 ürün tam**
  (2.452 webp, boş klasör yok). Canlı DB'ye dokunulmadı; yalnız
  `data/yeni-katalog-gorseller/` yazıldı.

## [1.6.0] — 2026-08-14

### Değişti
- **Katalog maliyeti artık GÜNCEL kurla hesaplanır (iç görünüm).**
  `CatalogProductPage` → Fiyat sekmesi (birim maliyet + fiyat kademeleri) ve
  Maliyet sekmesi toplamı, donmuş `total_cost_usd`/`total_cost_try` yerine
  kalemlerin kendi para birimi + **canlı kur** ile `sumCost` üzerinden yeniden
  hesaplanır. TL kalemler TL saklanır (`product_cost_items.currency='TRY'`),
  toplam bugünün kuruyla değerlenir. "Bugünkü maliyetim ne?" sorusu güncel yanıt verir.
- Ortak `toCostItem` yardımcısı: kayıtlı kalemi (`CostItemRow`) pricing
  çekirdeğinin `CostItem` biçimine çevirir (görüntü + fiyat aynı kaynaktan).

### Korundu (bilinçli)
- **Teklif/maliyet belgesi kuru DONUK.** `CostDocButton` ve belge üretimi
  `cost.total_cost_usd`/`_try`'yi **kayıt anındaki** kurla kullanmaya devam eder;
  müşteriye verilen fiyat sonradan değişmez. Belgede kullanılan kur + tarih
  zaten görünür (`usdRate` / `rateDate`).
- **`total_cost_usd`, `total_cost_try`, `rate_snapshot` şemada kalıyor** —
  audit/geçmiş değeri; silinmedi. Migration **yok**.

### UI
- Katalog maliyet görünümlerine "**Güncel kurla hesaplandı**" notu; Maliyet
  sekmesinde kayıt anı değeri de parantezde gösterilir (kullanıcı iki rakam
  farkında şaşırmasın).

Bu paket kod-only; migration yok.

---

## [1.5.0] — 2026-08-14

### Eklendi
- **Gösterge paneli — satır kısayolları (madde 3).**
  - **Teklif iletildi:** satır sonunda onayla/reddet ikonları. Onaylamada
    "Sıradaki aşama" seçimi (Numune varsayılan · Sipariş · "Şimdilik sadece
    işaretle"); seçime göre hem teklif sonucu hem operasyon aşaması güncellenir
    (aşama geçişi `useAdvanceStage` ile — QuotesTab'ın kanonik kabul yolu).
    Reddetmede **red sebebi zorunlu** (sebepsiz red engellendi).
  - **Numuneler / Siparişler:** satır sonunda durum güncelleme menüsü
    (`useUpdateSample` / `useUpdateOrder`). Mevcut durum işaretli/pasif.
  - İkonlar küçük ve satır sonunda; satır tıklamasını (`stopPropagation`) bozmaz.
- **Paylaşılan `QuoteAcceptDialog` / `QuoteRejectDialog`**
  (`src/components/operations/QuoteResultDialogs.tsx`). QuotesTab ve gösterge
  paneli aynı diyaloğu kullanır — iki kopyanın iki farklı davranışa dönüşmesi
  önlendi. Red diyaloğu artık her iki yerde de sebebi **zorunlu** kılar.

### Değişti
- **Gösterge paneli yerleşimi (madde 2).** Dört ana bölüm (Teklif bekliyor ·
  Teklif iletildi · Numuneler · Siparişler) **2×2 ızgara**da, her biri **sabit
  yükseklikte** (`h-72`) ve **kendi içinde kaydırılır**; başlık + toplam sayı
  sabit kalır. Kullanıcı sayfayı kaydırmadan dördünü birden görür.
  **Hatırlatıcılar** ızgaradan çıkıp altta tam genişlik ayrı bölüme alındı.

Bu paket kod-only; migration yok.

---

## [1.4.0] — 2026-08-14

### Eklendi
- **Gösterge paneli — Anlık durum kartları.** "Numunede" ve "Siparişte"
  kartları artık dönemden **bağımsız**, operasyonun **güncel aşamasına**
  (`operations.stage_id` → `operation_stages.key`) bakar. Kartlar dönem
  seçicisinden görsel olarak ayrık, "Anlık durum" başlığı altında; dönem
  değiştiğinde değişmezler.
  - Numunede = `stage 'numune'`; Siparişte = `stage 'siparis' + 'uretim'`
    (üretimdeki iş de "siparişte" sayılır). Terminal aşamalar ve silinenler hariç.
  - Yeni RPC: `metric_active_funnel()` (tarih parametresiz) + public köprü.

### Düzeltildi
- **"Numunede" kartı 0 gösteriyordu.** Kart eskiden `metric_funnel`'den
  besleniyordu; o RPC operasyonu **açılış tarihine** (`requested_at/created_at ∈
  dönem`) göre kesip "aşamaya ulaşmış operasyon" (kümülatif huni) sayıyordu.
  Operasyonlar dönemden önce açıldıysa şu an numunede olsalar bile 0 çıkıyordu.
  Artık anlık durum sorgusundan (`metric_active_funnel`) beslenir.

### Değişti
- **Akış kartları** ("Gelen talep", "Verilen teklif", "Girilen aksiyon")
  döneme bağlı kalmaya devam eder; her kartın altında aktif dönem etiketi
  ("bugün", "son 2 gün" vb.) gösterilir. Akış vs durum karışıklığı böylece
  görsel olarak ayrışır.

### Migration (ELLE uygulanacak — sende)
- `20260818000000_p7_active_funnel.sql`: `metric_active_funnel()` RPC + public
  köprü + grant. Uygulanana kadar "Numunede/Siparişte" kartları veri çekemez
  (RPC yok → 0/boş). Diğer kartlar etkilenmez.

---

## [1.3.3] — 2026-08-14

### Düzeltildi
- **Sipariş Formu — Bedenler alanına noktalı virgül yazılamıyordu.** Alan
  değeri `bedenler.join('; ')` ile filtrelenmiş diziden türetiliyordu; kullanıcı
  ayraç (`;`) yazınca boş son eleman `filter(Boolean)` ile atılıyor, ayraç bir
  sonraki render'da siliniyordu (bir sonraki bedeni asla ekleyemiyordunuz). Alan
  artık **ham metin** olarak tutuluyor (`sip.bedenlerText`); diziye **yalnız
  çıkışta** (matris kolonları + `normalizeForRender` dışa aktarımı) çevriliyor.
  Eski (dizi biçimli) kaydedilmiş belgelerle geriye uyumlu.
- **Payload tutarsızlığı:** `useDocuments` alan-eşleme çıktısı bedenleri
  `', '` ile birleştiriyordu; ondalık beden (`40,5`) virgül belirsizliği
  yaratıyordu. Artık `'; '` ile birleştiriliyor.

### Değişti
- **Bedenler etiketi seçili beden sistemine göre değişiyor:** Alfa'da
  "XS; S; M", Numara'da "40; 40,5; 41", Özel'de "S; M; L" örneği gösterilir.

### Not (ayrı iş — kod değişmedi)
- PDF şablonu (`services/pdf-renderer/templates/studio.html:2408`) "Beden
  Sistemi" **künye özet satırında** bedenleri `sistem (ilk–son)` uç-nokta
  aralığı olarak basıyor (önizlemedeki "Alfa (30–30)" bundan). **Renk×Beden
  dağıtım tablosu ve barkodlar TAM listeyi** gösterir — ara bedenler
  kaybolmaz; yalnız künye özeti uç noktaları gösterir. Uç noktalar dizi
  sırasına göredir (sayısal min–max değil). Künye özetini tam listeye çevirmek
  isterse ayrı bir şablon işidir.

## [1.3.2] — 2026-08-14

### Düzeltildi
- **Belge formlarında "Ürün Grubu" (ve türevleri) seçilemiyordu** — tıklanıyor ama
  değer forma yazılmıyordu. Kök neden: `CategorySelect` tek olayda **iki** state
  güncellemesi yapıyor (grup seç + tür sıfırla), ama form `up`'ları snapshot
  tabanlıydı (`set({ ...data, soS: { ...s, ...patch } })`; `data`/`s` render'dan
  sabit). İkinci güncelleme aynı eski snapshot'tan türeyip ilkini **eziyordu** →
  grup seçimi kayboluyordu. (Katalog formu aynı deseni fonksiyonel `setF((s)=>…)`
  ile kullandığından etkilenmiyordu — fark buydu.)
- **Kalıp çözüm:** yeni saf yardımcı `patchSection` (`src/lib/formPatch.ts`) +
  belge formlarındaki tüm snapshot-tabanlı güncellemeler **fonksiyonel setState**'e
  çevrildi (ardışık çağrılar artık birikir, ezmez). Değişen yerler (`editorForms.tsx`):
  `up` × 3 (fiyat_teklifi/soS·siparis_onay/sip·siparis_formu), `recompute`
  (sipariş onay fiyat/tutar), `upO` (koli sipariş), `setList` × 2 (numune/koli),
  döviz kuru efekti, iç-not alanı. Form bileşenlerinin `set` prop tipi
  `Dispatch<SetStateAction<Data>>`'e genişletildi.
- **Regresyon testi:** `src/lib/formPatch.test.ts` — art arda iki güncellemede
  ilkinin korunduğunu doğrular + eski snapshot deseninin kaybettiğini karşıt
  kanıtla gösterir (4 test).

### Notlar
- Migration yok. `npm run build` + **197 birim testi** yeşil (yeni 4 test dahil).

## [1.3.1] — 2026-08-14

### Düzeltildi
- **Referans dropdown'ları boş gelme sınıf hatası** (ör. Sipariş Onay belgesinde
  "Ürün Grubu" seçilemiyor): oturum tam kurulmadan çalışan bir referans sorgusu,
  **paylaşılan statik query key**'e 0-satır sonucu yazıyordu; `staleTime` (30sn)
  penceresi boyunca aynı key'i kullanan tüm tüketiciler o boş listeyi alıyor, yeni
  istek gitmiyordu (RLS/veri/token değil — react-query bellek-içi önbelleği).
  Teşhis: soğuk açılışta `getSession()` süresi dolmuş token döndürebiliyor; token
  yenilenmeden giden ilk istek PostgREST'te anon sayılıp RLS `is_active_user()`
  false → 0 satır.
- **Kalıp çözüm** — yeni `useReferenceQuery` sarmalayıcısı (`src/hooks/useReferenceQuery.ts`,
  `useSessionReady` ile): oturum hazır **ve** `useCurrentUser` (getUser ile token'ı
  doğrular) çözülüp kullanıcı gelene kadar sorguyu göndermez (`enabled=false`).
  Böylece oturum öncesi boş sonuç hiç önbelleğe girmez. RLS'e bağlı statik-key'li
  **29 referans/lookup sorgusu** (13 hook dosyası) bu korumaya alındı: ürün
  kategorileri, talep/teklif/numune/sipariş durum & kanal seçenekleri, iller,
  rol/departman/pozisyon, görev durum/öncelik, ödeme yöntemi/banka, müşteri
  seçenekleri, rapor filtreleri, genel referans tablosu.

### Notlar
- Migration yok. `npm run build` + 193 birim testi yeşil.

## [1.3.0] — 2026-08-14

### Eklendi
- **4 yeni teklif red sebebi** (`quote_rejection_reasons`, migration
  `20260817000000_red_sebepleri_yeni.sql`): `moq_fazla` (MOQ Fazla),
  `sonra_degerlendirecek` (Sonra Değerlendirecek), `numune_ucreti_fazla`
  (Numune Ücreti Fazla), `yanlis_numara` (Yanlış Numara). Idempotent
  (`on conflict do nothing`).
- **Reddedilen tekliflere red sebebi atandı** (`scripts/red-sebep-yaz.mjs`,
  kaynak `data/red-sebepleri.csv` — 118 kayıt): `teklif_reddedildi`
  aşamasındaki operasyonların quote'larına `rejection_reason_id` yazıldı.
  Eşleşme müşteri markası üzerinden DB `normalize_tr` ile (JS/SQL sapması yok),
  yalnız `rejection_reason_id IS NULL` olanlara, `rejection_note`'a
  dokunulmadan. **118 quote** güncellendi (116 otomatik + 2 elle: "Ayaz Atlas"→
  AYAZ ALTAS, "Mahir Tuğanatay"→Mahir Tuğantay yazım farkları). Dağılım:
  Ulaşılamadı 53, Fiyat Yüksek 34, Müşteri Vazgeçti 10, MOQ Fazla 8,
  Sonra Değerlendirecek 6, Numune Ücreti Fazla 5, Yanlış Numara 2.
  CSV'de olmayan 37 quote boş bırakıldı. "Melike Hanım" `numune` aşamasında
  olduğu için (reddedilmemiş) atlandı.
- Kuru koşu scripti `scripts/red-sebep-kuru-kosu.mjs` (yalnız okuma).

### Notlar
- Uygulanan migration: `20260817000000_red_sebepleri_yeni.sql` (`psql -f` ile;
  defter kayması sürüyor). Toplu güncelleme öncesi yedek alındı
  (`~/tekstil-crm-yedekler/quotes_operations_20260814_redsebep.sql`).
- Bildirim gürültüsü **0**: yazma yalnız `rejection_reason_id`'ye dokunduğu,
  `status_id`/`sent_at` değişmediği için notify/timeline/hard_gate trigger'ları
  tetiklenmedi (`notifications` 212→212, `event_log` 9081→9081). `sync_operation_status`
  koşulsuz çalıştı ama 155 op zaten `teklif_bekliyor` olduğundan net değişiklik yok.

## [1.2.0] — 2026-08-13

### Eklendi
- **Süreç Takip Sistemi verilerinin CRM'e aktarımı** (`scripts/surec-takip-aktar.mjs`):
  **222 müşteri**, **224 talep** (operations), **275 durum geçmişi olayı** (event_log),
  **196 etkileşim** (interactions). İki kademeli müşteri eşleşmesi (telefon-önce,
  sonra marka; `normalize_tr`/telefon-son-10-hane), kaynak tarihlerin korunması
  (`created_at`/`requested_at`/`occurred_at`), tüm adımlar idempotent. Satış rolünde
  3 kullanıcı oluşturuldu (affan.ergul, ayse.duzgun, hakan.akgun); polat.cetiner
  mevcut hesaba eşlendi. Telefonlar `contact_points`'e (187), notlar tek
  `interactions` kaydı olarak (`[Süreç Takip aktarımı]` etiketli).
- **"Teklif Reddedildi" terminal aşaması** (`operation_stages.teklif_reddedildi`,
  migration `20260816000000_teklif_reddedildi_terminal_stage.sql`): reddedilen
  teklifler artık "İptal" ile karışmaz; ayrı `danger` terminal aşamada. Aktarımdan
  gelen **155 iptal → teklif_reddedildi** taşındı, quote'ları `reddedildi` durumuna
  çekildi (gerekçe + yanıt tarihi), `quotes_close_op_on_reject` trigger'ı yeni
  aşamaya yönlendirildi (bugünden sonraki gerçek redler de buraya gider).
- **214 quote üretimi** (`scripts/surec-takip-quotes.mjs`): teklif verilmiş
  aşamalardaki (teklif_iletildi/numune/siparis/tamamlandi/iptal) operasyonlara
  quote kaydı (`sent_at` kaynak durum-değişim tarihinden). "Teklif bekliyor"
  panelindeki şişme düzeldi (70 → 12).
- **Etkileşim→operasyon backfill** (`scripts/surec-takip-etkilesim-operasyon-backfill.mjs`):
  196 ithal etkileşime `interactions.operation_id` yazıldı → operasyon ekranında
  da görünür oldular (`entity_type`/`entity_id` korunarak).
- `cancellation_reasons`'a **"Teklif reddedildi"** (`teklif_reddedildi`) referansı.

### Notlar
- Uygulanan migration: `20260816000000_teklif_reddedildi_terminal_stage.sql`
  (`psql -f` ile; defter kayması sürüyor). Toplu güncelleme öncesi yedek alındı
  (`~/tekstil-crm-yedekler`).

## [1.1.0] — 2026-08-13

### Eklendi
- **Ortak `Pagination` bileşeni** (`src/components/shared/Pagination.tsx`):
  konum bilgisi ("1–24 / 197"), sayfa boyutu seçici ve ileri/geri düğmeleri.
  `DataTable`'ın gömülü sayfalama bloğu buraya çıkarıldı (tek kaynak).
- **Katalog ızgara görünümüne sayfalama:** ızgara kolunda yalnızca "{toplam} ürün"
  metni vardı, sayfa geçişi yoktu (`page` 1'de kilitliydi). Artık ızgara ve liste
  görünümleri aynı sayfalama çubuğunu kullanır; sayfa boyutu seçenekleri 24/48/96.
  Görünüm değiştirince (ızgara↔liste) sayfa numarası korunur.

### Değişti
- `DataTable` sayfalama arayüzü davranışça aynı; ortak `Pagination` bileşenini
  render eder (kod tekrarı kaldırıldı).

## [1.0.0] — 2026-08-13

Canlı kullanıma hazırlık. İlk üretim temeli.

### Eklendi
- **Sürüm takibi:** `CHANGELOG.md` (bu dosya) + `package.json` sürümü `1.0.0`.
  Bundan sonra her paket: changelog girdisi + sürüm artışı + `git tag`.
- **Tam sıfırlama (katalog dahil) hazırlığı:** `scripts/uretim-sifirlama.sql`
  genişletildi — operasyon + CRM + **katalog** (ürün/görsel/koleksiyon/katalog/
  maliyet) + tüm `files` satırları silinecek; storage `catalog/` öneki de
  temizlenecek. Ayarlar, referanslar, roller, workflow'lar ve 3 kullanıcı korunur.

### Bekleyen (onay/deploy sende)
- Sıfırlama scriptinin prova + gerçek çalıştırması (ayrı onaylar; script
  ROLLBACK-kilitli).
- P9 bildirim migration'ı (`20260815000000_p9_notifications.sql`) elle uygulanacak.
- Gösterge paneli migration'ı (`20260813000000_p7_pending_requests_image.sql`) elle uygulanacak.
- Intake edge fn deploy + `INTAKE_SECRET`.

---

## [0.9.3] — 2026-08-12 — P11 Sipariş belge işleme

### Eklendi
- Belge/dış-PDF siparişinde `extracted_data`'dan tek kalemlik `order_items` yazımı.
- Görsel/numune/YZ-yorum düzeltmeleri.

### Migration
- `20260816000000_p11_order_extraction_source_belge.sql`

---

## [0.9.2] — 2026-08-12 — P10 Görsel ve erişim iyileştirmeleri (madde 10/12/13)

### Değişti
- Zaman çizelgesi sadeleştirme (kanal ikonu + tarih grubu + katlanır detay, son 3 açık).
- Müşteri **Dosyalar** sekmesi (üretilen belgeler tip+tarih + yüklenenler).
- Talep görseli tıkla-büyüt lightbox (Esc / ← / →).

### Migration
- Yok.

---

## [0.9.1] — 2026-08-12 — P9 Bildirimler (madde 16)

### Eklendi
- Ses politikası (3 sesli olay) + talep/teklif/numune/sipariş durum bildirimleri.
- Teklife 1 saat kala sesli uyarı; numune/sipariş termini dolunca sesli uyarı.

### Migration
- `20260815000000_p9_notifications.sql` — **elle uygulanacak (beklemede).**

---

## [0.9.0] — 2026-08-12 — P8 Taslak köprüsü + eşleşmeyen katalog

### Eklendi
- **P8A** — Taslak → belge köprüsü: taslak teklifi dolu `fiyat_teklifi` belgesi olarak açma.
- **P8B** — Eşleşmeyen katalog kodu: görünürlük + tolerans + yakın eşleşme önerisi.

### Migration
- `20260814000000_p8b_catalog_match.sql`

---

## [0.8.2] — 2026-08-12 — Gösterge Paneli + düzeltme turu 2 (kısmi)

### Eklendi
- P7 Gösterge paneli: "bugün durum ne" — grafiksiz 6 bölüm (5 sayı + 5 liste).
- Durum cascade, belgeden sipariş, yaklaşan süreler düzeltmeleri.

### Migration
- `20260803000000_state_cascade.sql`, `20260803010000_fix_active_op_filter.sql`,
  `20260803020000_due_soon_interventions.sql`
- `20260813000000_p7_pending_requests_image.sql` — **elle uygulanacak (beklemede).**

---

## [0.8.1] — 2026-08-12 — Intake (tekstilas.com entegrasyonu)

### Eklendi
- `intake_process` RPC + edge fn + taslak teklif + birleştirme + eşleşmeyen kod çözümü.

### Migration
- `20260804000000_intake_integration.sql`, `20260804010000_approve_draft_quote.sql`,
  `20260805000000_unmatched_catalog.sql`

### Bekleyen
- Edge fn deploy + `INTAKE_SECRET` (sende).

---

## [0.8.0] — 2026-08-12 — P6 Görev/Hedef + YZ, P7 Raporlar

### Eklendi
- **P6** — Görev/hedef + YZ (ai-assist tek kapı + izin listesi + maliyet kontrolü);
  otomatik takip görevleri (durum geçişi / etkileşim → `source='otomatik'`); çakışma bloğu.
- **P7** — `metrics.*` tek kaynak, çalışan + yönetici panel, 6 rapor + Excel/PDF, YZ yorum.

### Migration
- `20260801100000_p6_1_tasks_goals.sql` … `20260801160000_p6_13_ai_cost.sql`,
  `20260801200000_state_machine_automation.sql`, `20260812120000_p6_11_otomatik_takip_gorevleri.sql`
- `20260801240000_p7_1_metrics.sql`, `20260802000000_metric_public_wrappers.sql`,
  `20260802010000_manager_dashboard.sql` … `20260802050000_role_permission_admin.sql`

---

## [0.6.0] — 2026-08-10 — P5 Finans

### Eklendi
- Cari hesap, ödemeler, ön ödeme kapısı, vade takibi, ekstre, yetkilendirme.
- Form kalitesi: ilk temas alanları, konum/telefon dropdown, beden ondalık, katalog/ürün silme.

### Migration
- `20260731100000_p5_1_account_transactions.sql` … `20260731170000_p5_8_sales_no_finance.sql`,
  `20260810000000_p5_first_contact_fields.sql`, `20260810010000_p5_catalog_soft_delete.sql`

---

## [0.5.0] — 2026-07-30 — P4B Katalog + maliyet

### Eklendi
- Katalog (ürün/görsel/koleksiyon), maliyet reçetesi, döviz kuru, marj kademeleri,
  maliyet belgesi, tek-tuş teklif. Uyarı motoru + açık dosyalar + snooze + günlük özet.

### Migration
- `20260728100000_p4b_document_settings.sql` … `20260729140000_p4b_daily_summary.sql`,
  `20260730100000_p4b_catalog_schema.sql` … `20260730160000_p4b_operation_catalog_fk.sql`

---

## [0.4.0] — 2026-07-27 — P4A Belge motoru

### Eklendi
- 5 belge tipi, TR/EN, iç-not sızıntı koruması, bağımsız belge üretimi.

### Migration
- `20260727120000_p4a_flow_and_documents.sql`, `20260727130000_pool_claim.sql`,
  `20260727140000_p4a_build_document_data.sql`, `20260727150000_p4a_documents_independent.sql`,
  `20260727160000_p4a_uretici_settings.sql`

---

## [0.3.0] — 2026-07-27 — P3 Operasyonlar

### Eklendi
- Talep/teklif/numune/sipariş, durum makinesi + kapılar, SLA, operasyon ekranı,
  intake edge fn temeli, rework şeması.

### Migration
- `20260726320000_p3_1_operation_reference_data.sql` … `20260726470000_p3_12_intake_and_sla_trigger.sql`,
  `20260727100000_p3_rework_schema.sql`, `20260727110000_p3_rework_categories.sql`,
  `20260726410000_system_timezone.sql`

---

## [0.2.0] — 2026-07-25 — P1 CRM temel

### Eklendi
- Referanslar, iletişim noktaları/telefon, potansiyeller, müşteriler, etkileşim,
  not/etiket/dosya, zaman çizelgesi, dönüşüm, arama/mükerrer, içe aktarma.

### Migration
- `20260726090000_p1_1_reference_data.sql` … `20260726310000_p1_10_undo_v2.sql`

---

## [0.1.0] — 2026-07-25 — P0 İskele + temel

### Eklendi
- Proje iskeleti (Vite + React 19 + TS strict, Tailwind 4, shadcn, test/lint zinciri).
- DB temeli (enum + yardımcı fn), denetim/olay kayıtları, kimlik + çalışan yönetimi,
  rol/yetki, ayarlar altyapısı, dosya depolama, operasyon kodu üreteci.
- Tasarım sistemi + AppShell, paylaşılan bileşenler, ikas tasarımına geçiş.
- Güvenlik: kabul testi açıkları düzeltmesi + kalıcı regresyon; hata görünürlüğü.

### Migration
- `20260725121441_p0_2_db_foundation.sql` … `20260725190000_p0_4_user_mgmt_rls_hardening.sql`

[1.0.0]: #100--2026-08-13
[0.9.3]: #093--2026-08-12--p11-sipariş-belge-işleme
[0.9.2]: #092--2026-08-12--p10-görsel-ve-erişim-iyileştirmeleri-madde-101213
[0.9.1]: #091--2026-08-12--p9-bildirimler-madde-16
[0.9.0]: #090--2026-08-12--p8-taslak-köprüsü--eşleşmeyen-katalog
[0.8.2]: #082--2026-08-12--gösterge-paneli--düzeltme-turu-2-kısmi
[0.8.1]: #081--2026-08-12--intake-tekstilascom-entegrasyonu
[0.8.0]: #080--2026-08-12--p6-görevhedef--yz-p7-raporlar
[0.6.0]: #060--2026-08-10--p5-finans
[0.5.0]: #050--2026-07-30--p4b-katalog--maliyet
[0.4.0]: #040--2026-07-27--p4a-belge-motoru
[0.3.0]: #030--2026-07-27--p3-operasyonlar
[0.2.0]: #020--2026-07-25--p1-crm-temel
[0.1.0]: #010--2026-07-25--p0-iskele--temel
