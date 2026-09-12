# Katalog tek kaynak: CRM ile tekstilas.com aynı veriyi paylaşsın

**Tarih:** 2026-09-12
**Durum:** Onaylandı, uygulama planı bekleniyor
**Kapsam:** Yeni sezonun CRM'e aktarılması + sitenin CRM'den canlı beslenmesi

---

## 1. Neden

Bugün iki ayrı katalog var ve birbirinden habersizler.

| | Sitede | CRM'de |
|---|---|---|
| iy2026 sezonu | 672 | 672 |
| sk2627 sezonu | 619 | **0** |

CRM'deki 672 ürünün tamamı sitede var; çakışan kayıtlarda ad, kod ve koleksiyon
**birebir aynı** (2026-09-12'de ölçüldü, tek fark yok). CRM'de olup sitede olmayan
ürün yok. Yani ortada bir "kopma" değil, **hiç aktarılmamış bir sezon** var.

Görseller de çift: site kendi kopyasını `/katalog-media/<slug>/` altında tutuyor,
CRM kendi kopyasını R2'de `catalog/<kod>/` altında. Aynı ürünün iki dosyası.

Sonuç: ürün eklemek iki ayrı yerde iş demek, başlık değiştirmek iki yerde
düzeltme demek, ve iki katalog sessizce ayrışıyor.

## 2. Hedefler

- **CRM tek kaynak.** Ürün bilgisi yalnız CRM'de düzenlenir.
- **Site anında yansıtır.** CRM'deki değişiklik siteye elle adım olmadan geçer.
- **Görsel tek kopya.** Aynı dosya hem CRM'de hem sitede gösterilir.
- **Site kodu neredeyse hiç değişmez.** Bugün çalışan JavaScript ve görsel
  adresleri aynen kalır; arkadaki kaynak değişir.
- **Her adım tek tek geri alınabilir.**

### Hedef olmayanlar (YAGNI)

- Sitenin tamamının Worker'a taşınması.
- Bağımsız bir katalog mikroservisi (bugün iki tüketici için fazla ağır).
- CRM'deki ürün düzenleme arayüzünün değiştirilmesi.
- Sitedeki eski görsel kopyalarının hemen silinmesi (geri dönüş için kalır).

## 3. İki parça, sırayla

**Bu iş tek bir değişiklik değil.** Birleştirme, CRM sitenin yarısını bilmeden
anlamsızdır. Sıra bağlayıcıdır:

1. **İçe aktarma** — 619 ürün CRM'e girer, görselleri R2'ye taşınır.
2. **Birleştirme** — Worker sitenin önüne geçer, site CRM'den beslenir.

Birinci parça canlı siteye hiç dokunmaz; tamamen CRM tarafında biter.

**Her parça AYRI bir uygulama planı alır.** Parça 1 kendi başına değer üretir
(CRM tam kataloğu bilir) ve Parça 2 başlamadan doğrulanabilir. Tek plana
sıkıştırmak, ikinci parçanın bağımlılığı (belirteç yetkisi) yüzünden birinciyi
de bekletirdi.

---

## PARÇA 1 — İçe aktarma

## 4. Kaynak ve hedef

Kaynak: `https://tekstilas.com/products.json` içindeki `season = "sk2627"`
kayıtları (619 adet). Her birinde ad, slug, site kodu, koleksiyon, tür, kumaş
ve görsel yolu dolu.

Hedef: `public.catalog_products` içinde **yeni bir katalog satırı**
("Sonbahar/Kış 26-27"). Mevcut iki katalog (id 2 ve 4) dokunulmaz.

Koleksiyon eşleşmesi birebirdir ve hazırdır:
`tesettur → 7`, `casual → 8`, `premium → 9`.

## 5. Kod şeması

CRM iki kod tutar ve ikisi farklı işe yarar:

- `site_code` — müşteriye görünen kod. Siteden **aynen** alınır
  (`TES-ELB-001`, `PRM-PNT-001` gibi).
- `code` — iç kod, `not null`. Katalog 4'ün kalıbıyla üretilir (`YS-` öneki +
  rastgele altı karakter). Katalog 2'nin kalıbı (`ST-26SS…`) o sezona özgüdür,
  kopyalanmaz.

## 6. Sözlük eşleştirmesi — ölçüldü

| Alan | Siteden gelen farklı değer | CRM'de karşılığı var | Yok |
|---|---|---|---|
| Tür | 17 | **17** | 0 |
| Kumaş | 61 | 28 | **33** |

**Tür tarafı temiz** ama bir tuzak var: `product_categories` içinde **5 etiket
çift kayıtlı** (`Sweatshirt`, `Yelek`, `Gömlek`, `Şapka`, `Pantolon`).
Etikete göre eşleştirme bu beşinde belirsizdir; hangi satırın seçileceği
raporda gösterilir ve onaylanır.

**Kumaş tarafında 33 değer CRM'de yok** (`İpek Saten`, `Jarse`, `Kaşe`,
`Trençkot Gabardin`, `Şişme (Naylon)` gibi). Bunlar `fabric_types` içine yeni
kayıt olarak eklenir. Uydurma eşleştirme yapılmaz — yanlış kumaş, yanlış
maliyet demektir.

## 7. Onay kapısı

İçe aktarma betiği **iki aşamalıdır** ve birinci aşama canlıya yazmaz:

1. `rapor` — eşleştirme tablosunu çıkarır: her ürün için hangi tür, hangi
   kumaş, hangi koleksiyon; belirsiz kalanlar ayrı listede; eklenecek yeni
   kumaşlar ayrı listede. Çıktı bir dosyadır, gözle okunur.
2. `yaz` — yalnız rapor onaylandıktan sonra çalışır. Tek işlem içinde yazar,
   yarıda kalırsa hiçbir şey yazılmamış olur.

Betik **yeniden çalıştırılabilir**: `site_code` üzerinden mükerrer denetimi
yapar, ikinci çalıştırma var olanı atlar.

## 8. Görsellerin taşınması

619 görsel sitenin herkese açık adresinden indirilir
(`/katalog-media/<slug>/<slug>-1.webp`), R2'ye `catalog/<kod>/1.webp` olarak
yazılır, 160 ve 480 piksellik küçükleri üretilir. Ardından `public.files` ve
`public.catalog_product_images` kayıtları açılır.

Bu, dün kurulan taşıma altyapısının aynısıdır ve `scripts/r2-tasima.mjs`
içindeki indirme/küçültme/yükleme yardımcıları yeniden kullanılır. Yükleme
Worker'ın `/y` ucundan, servis sırrıyla yapılır.

Sitedeki kopyalar **silinmez**. Parça 2 tamamlanıp doğrulanana kadar
oradadırlar; geri dönüş yolu budur.

---

## PARÇA 2 — Birleştirme

## 9. Mimari

Cloudflare'de mevcut `tekstilas.com` bölgesine üç Worker yolu tanımlanır.
İstekler siteye ulaşmadan Worker'a düşer:

```
tekstilas.com/products.json      → Worker: CRM'den canlı JSON
tekstilas.com/katalog-media/*    → Worker: R2'den görsel (açık, yalnız katalog)
tekstilas.com/katalog/           → Worker: sitenin HTML'i + kart kutusu doldurulur
```

Diğer her istek (ana sayfa, `lead.php`, varlıklar) dokunulmadan siteye gider.

## 10. Ürün listesi ucu

Worker `catalog_products` ve ilişkili sözlükleri okuyup sitenin bugün beklediği
JSON biçimini **birebir** üretir: `id`, `name`, `slug`, `code`, `cat`, `type`,
`fabric`, `product_types`, `catalog_product_images`, `season`.

`id` alanı sitenin kendi uuid5'leridir ve CRM'de karşılığı yoktur; slug'dan
türetilir (mevcut `site-products-export.mjs` içindeki aynı yöntemle), böylece
bugünkü değerlerle aynı kalır.

Okuma, kullanıcı jetonu olmadan, yalnız yayındaki ürünler için yapılır
(`is_active`, `deleted_at is null`). Kenarda 5 dakika önbeklenir; CRM'deki
değişiklik en geç o sürede siteye yansır.

## 11. Görsel ucu

`/katalog-media/` altındaki iki adres biçimi karşılanır:

```
_thumbs/<slug>.webp        → R2  k/160/catalog/<kod>/1.webp.webp
<slug>/<slug>-<N>.webp     → R2  catalog/<kod>/<N>.webp
```

⚠️ Küçük resim anahtarı `k/<boyut>/<tam yol>.webp` biçimindedir; orijinalin
uzantısı korunup sonuna `.webp` eklenir. Yani `catalog/YS-ABC/1.webp` için
küçüğü `k/160/catalog/YS-ABC/1.webp.webp` olur — çift uzantı doğrudur ve
Worker'ın `r2Anahtar` fonksiyonuyla birebir eşleşmek zorundadır
(`services/dosya-worker/src/index.js`).

Slug'dan koda çeviri, ürün listesi sorgusundan üretilen bir haritayla yapılır
ve kenarda önbeklenir.

**Açıklık sınırı dardır ve bilinçlidir:** yalnız `catalog/` önekli nesneler
oturumsuz açılır. Müşteri belgeleri, teklifler, sipariş formları ve talep
görselleri eskisi gibi çerez ister. Açılan şeyler bugün zaten sitede yayındadır.

Yanıtlar `public` önbellek başlığı taşır (CRM'in kendi dosya yolundaki `private`
başlığından farklı — orası kullanıcıya özeldir, burası herkese açıktır).
`nosniff` ve CSP `sandbox` burada da uygulanır.

## 12. Katalog sayfası

Sitenin HTML'i Worker'dan geçerken `HTMLRewriter` ile işlenir. Kart kutusunun
içi CRM verisinden üretilen kartlarla doldurulur.

**Kart tasarımı Worker'a taşınmaz.** Site HTML'inde tek bir örnek kart şablonu
bırakılır; Worker onu okuyup her ürün için çoğaltır. Tasarım değişikliği yine
sitenin kendi dosyasında yapılır.

Üretilen sayfa kenarda önbeklenir, her ziyaretçi veritabanına inmez.

## 13. Ücretsiz katman

| Kaynak | Ücretsiz sınır | Beklenen |
|---|---|---|
| Worker istek | 100 bin/gün | önbellek sonrası binler |
| R2 okuma | 10 M/ay | on binler |
| R2 depolama | 10 GB | mevcut 1,1 GB + ~0,1 GB |
| R2 çıkış | sınırsız | — |

Kenar önbelleği burada kritiktir: önbelleksiz bir katalog sayfası her ziyaretçi
için bir veritabanı sorgusu demektir.

## 14. Bağımlılık: belirteç yetkisi

Worker yolları bölge seviyesinde `Workers Routes` yetkisi ister. Mevcut
belirteçte bu yetki **yoktur** (2026-09-11'de dosya Worker'ının alan adı bu
yüzden hesap seviyesi uçtan bağlanmıştı). Kullanıcı belirtece bu yetkiyi
eklemelidir; Parça 2 onsuz başlayamaz.

## 15. Sıra, doğrulama, geri dönüş

Her adım ayrı ayrı geri alınabilir:

1. İçe aktarma raporu → onay → yazma. Geri dönüş: yeni katalog satırını pasife al.
2. Görsellerin R2'ye taşınması. Geri dönüş: gerek yok, ekleme.
3. `products.json` yolu. Geri dönüş: yolu kaldır, statik dosya geri döner.
4. `katalog-media` yolu. Geri dönüş: yolu kaldır, sitedeki kopyalar geri döner.
5. `katalog/` yolu. Geri dönüş: yolu kaldır, gömülü HTML geri döner.

Her yol açıldıktan sonra canlı denetim: ürün sayısı, rastgele 20 görsel,
katalog sayfasının ilk ekranı, ve sitenin teklif akışının hâlâ çalıştığı.

## 16. Bilinen sınırlar

- **Sitedeki `id` alanları korunmak zorunda.** Türetim girdisi bilinmiyordu;
  slug'dan uuid5 ile yeniden üretilir. Bir ürünün slug'ı değişirse `id` de
  değişir — site tarafında bunun bir etkisi olup olmadığı denetlenmeli.
- **Yeni sezonda ürün başına tek görsel var**, eski sezonda ortalama iki.
  Eksik değil, sadece az.
- **5 çift kayıtlı tür etiketi** sözlük temizliği istiyor; bu iş kapsamda
  değil, yalnız eşleştirme sırasında onay isteyerek geçilir.
- **Worker yolları yalnız `tekstilas.com` bölgesinde çalışır.** Site başka bir
  alan adına taşınırsa yollar da taşınmalıdır.
