# Faz 4B — Maliyet, Kur ve Fiyat Hesapları

Bu belge kur ve marj hesaplarının **nasıl** yapıldığını, **hangi varsayımlarla** kurulduğunu ve
**örnek bir ürünün maliyetten satış fiyatına kadar tüm adımlarını sayılarla** anlatır. Hesap
çekirdeği `src/lib/pricing.ts`'te saf fonksiyonlardır ve `tests/unit/pricing.test.ts` (37 test) +
`scripts/test-catalog-p4b.mjs` (DB/servis + sızıntı) ile doğrulanır.

## 1. Kur nasıl uygulanıyor

- **Kaynak:** TCMB Döviz Satış (ForexSelling). PDF servisi `/rates` uç noktası TCMB `today.xml`'i
  sunucu tarafında çeker (tarayıcı CORS'una takılmaz). `exchange_rates` tablosuna `set_exchange_rate`
  ile yazılır (eski kayıt `is_current=false`, yeni eklenir).
- **Cron YOK.** `current_rates()` okuma anında yaşı hesaplar. `stale` (> `pricing.rate_refresh_hours`,
  vars. 6 saat) ise arayüz arka planda tazeler. `blocked` (> `pricing.rate_block_hours`, vars. 24 saat)
  ise **teklif oluşturma engellenir** — eski kurla yanlış fiyat vermektense durmak.
- **Güvenlik payı:** `pricing.safety_margin_percent` (vars. **%0**). Efektif kur = TCMB × (1 + pay/100).
  `buildRates()` bu payı haritaya işler; kur değişmeden pay değişince fiyatlar yeniden hesaplanır.
- **Kur yaşı görünür:** katalog maliyet/fiyat ekranında "1$ = X ₺ · N saat önce".

## 2. Maliyet nasıl toplanıyor

- Reçete **birim (adet) başınadır**. Kalem tipleri: kumaş, kesim/dikim/ütü, aksesuar, serbest.
- **Kumaş** iki şekilde: `metre_fiyat` (metre × birim fiyat) veya `sabit` (tutar). Diğerleri sabit.
- **Her kalemin kendi para birimi** olabilir (kumaş USD, dikim TL). Her kalem kendi kurundan TL'ye
  çevrilip toplanır: `toplam_TL = Σ (kalem_tutarı × kur[kalem_para])`. `toplam_USD = toplam_TL / USD_kuru`.
- Maliyet versiyonlanır (`product_costs.version`, `is_current`); hesap anındaki kurlar `rate_snapshot`'a
  yazılır. Bir teklif hangi maliyetle çıktıysa o sürüm kayıtta durur.
- **Kur değişince** maliyet yeniden kaydedilince (yeni sürüm) güncel kurla yeniden hesaplanır.

## 3. Marj ve fiyat kademeleri nasıl hesaplanıyor

- **Maliyet üstü marj:** `birim_fiyat = birim_maliyet × (1 + marj/100)`. (100 + %25 = 125 — satış
  fiyatının yüzdesi DEĞİL.)
- **Adet kademeleri ARALIK mantığı:** `margin_tiers` (min_quantity → marj). Bir adet için
  `min_quantity ≤ adet` olan **en büyük** kademe geçerli. Adet en küçük eşiğin altındaysa (MOQ zaten
  korur) en küçük kademe uygulanır.
  - Tohum: 50→%25, 200→%20, 500→%10 ⇒ 50–199 %25, 200–499 %20, 500+ %10.
- **Ürüne özel marj** (`catalog_products.custom_margin_percent`) doluysa kademeleri **ezer**.
- Ayarlar → Fiyatlandırma'dan kademeler, varsayılan marj ve kur eşikleri yönetilir.

## 4. Örnek — bir ürünün maliyetten satış fiyatına (sayılarla)

**Ürün:** Test Ürün · **Kur:** 1 USD = 40,00 ₺ (güvenlik payı %0)

**Maliyet reçetesi:**

| Kalem | Hesap | Kalem tutarı | TL karşılığı |
|---|---|---:|---:|
| Kumaş | 2 m × 3 USD (metre×fiyat) | 6,00 USD | 6 × 40 = **240,00 ₺** |
| Kesim/Dikim (sabit) | 50 TRY | 50,00 TRY | **50,00 ₺** |
| **Toplam maliyet** | | | **290,00 ₺** |

`toplam_USD = 290 / 40 = ` **7,25 USD** (birim maliyet).

**Fiyat kademeleri** (birim maliyet 7,25 USD sabit):

| Adet | Birim Maliyet | Marj | Birim Fiyat = maliyet×(1+marj/100) | Toplam = birim×adet |
|---:|---:|---:|---:|---:|
| 50  | $7,25 | %25 | 7,25 × 1,25 = **$9,06** | $453,13 |
| 200 | $7,25 | %20 | 7,25 × 1,20 = **$8,70** | $1.740,00 |
| 500 | $7,25 | %10 | 7,25 × 1,10 = **$7,98** | $3.987,50 |

**Tek-tuş teklif (120 adet):** 120 ∈ [50,199] → %25 → birim **$9,06**, toplam **$1.087,20**. Bu
fiyat belgeye gider; **maliyet ($7,25) ve marj (%25) müşteriye giden teklifte GEÇMEZ** (test [2]).

## 5. Sızıntı koruması (kritik)

- Maliyet ayrı tablolarda (`product_costs`, `product_cost_items`), RLS `costs.view`/`costs.edit`.
- Tek-tuş teklif fiyatı `product_price()` RPC'sinden gelir: `costs.view` YOKSA yanıt yalnızca
  `unit_price_usd` + `fabric_name` döner; `unit_cost_usd`/`margin_percent` **null**'lanır. Böylece
  satışçı maliyeti görmeden fiyat alır (test [1]).
- Fiyat teklifinde yalnız satış fiyatı + kumaş adı görünür; maliyet kalemleri hiçbir yerde geçmez
  (test [2]). Maliyet belgesi ("İÇ KULLANIM — Müşteri ile Paylaşılmaz") maliyeti içerir ama
  Maliyet sekmesinden (costs.view) on-demand indirilir, paylaşılan Belgeler listesine yazılmaz (test [3]).

## 6. Varsayımlar

1. Teklifler **USD** üzerinden; belgede TL karşılığı TCMB Döviz Satış'la yaklaşık gösterilir.
2. Fire/zayiat **yok** (kumaş metresi olduğu gibi). MOQ ürün kartından; adet MOQ altına düşse de
   hesap en küçük kademeyle çalışır (arayüz MOQ'yu hatırlatır).
3. Birim maliyet sabittir (adete göre değişmez); yalnız marj kademeye göre değişir.
4. `unit_price` 2 ondalığa yuvarlanır (kuruş/cent). Ara toplamlar yuvarlamadan taşınır.
5. Katalog dışı ürünlerde maliyet girilmez; o tekliflerde fiyat elle yazılır (Faz 4A editörü).

## 7. Tereddüt ettiğim noktalar (kullanıcı kararı gerekebilir)

1. **MOQ altı adet.** Şu an en küçük kademe uygulanıyor. Alternatif: MOQ altını tümden engellemek.
   Seçtiğim: engelleme yok, en küçük kademe (esneklik). Teyit ister misin?
2. **Yuvarlama.** Birim fiyatı 2 ondalığa yuvarlıyorum; toplam = yuvarlanmış birim × adet. Alternatif:
   toplamı yuvarlamadan hesaplayıp sonra göstermek (kuruş farkı). Şu anki seçim müşteri-teklifi
   tutarlılığı için birim-yuvarlama.
3. **Güvenlik payı yeri.** Payı kur haritasına işliyorum (tüm döviz kalemleri + belge TL karşılığı
   aynı efektif kuru görür). Alternatif: yalnız belge TL-gösteriminde uygulamak. Şu an: her yerde tutarlı.
4. **Marj erimesi eşiği** (`pricing.margin_erosion_percent`, %5) tanımlı ama otomatik işaretleme
   (katalogda "maliyet %X arttı" rozeti) henüz arayüze bağlanmadı — kur snapshot'ı ile karşılaştırma
   verisi var, gösterim eklenecek (aşağıdaki "kalan" bölümü).
5. **Çoklu ürün tek teklif.** Tek üründen teklif tam; operasyona bağlı çoklu katalog ürününü tek
   teklifte üretim seçenekleri olarak sunma, `operation_catalog_items` FK hazır ama arayüz akışı
   hafif kaldı.

## 8. Test kapsamı

- **Birim (`tests/unit/pricing.test.ts`, 37):** kademe sınırları (49/50/51, 199/200/201, 499/500/501),
  maliyet üstü marj, metre×fiyat/sabit, çok para birimli toplam, kur değişince yeniden hesap, güvenlik
  payı, kart fiyat tablosu, özel marj.
- **Entegrasyon/sızıntı (`scripts/test-catalog-p4b.mjs`):** product_price fiyat + maliyet gizleme,
  teklifte maliyet sızmıyor, maliyet belgesi İÇ KULLANIM, çok para birimli DB toplamı.
