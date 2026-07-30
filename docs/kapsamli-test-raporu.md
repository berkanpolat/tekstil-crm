# Kapsamlı Düzeltme ve Test Raporu

> Tarih: 2026-07-28 · Kapsam: kullanıcının tespit ettiği 15 madde (Bölüm 1) +
> sistem geneli doğrulama (Bölüm 2). Tüm düzeltmeler sonrası: **build ✓ ·
> eslint temiz · vitest 161/161 · durum-makinesi regresyonu 6/6.**

---

## 1. Düzeltilen hatalar

### 1.1 Durum makinesi eylemlere bağlı değildi (SİSTEMİK — 5 semptom)
- **Sorun:** Etkileşim eklenince lead "Yeni" kalıyor; teklif reddedilince düğmeler
  açık + operasyon "Teklif İletildi"; numune/sipariş oluşunca aşama ilerlemiyor;
  onaylı numunede "Revize et" açık.
- **Kök neden:** Eylem→durum otomasyonu yoktu; `status_transitions` ÖLÜ anahtarlar
  (`talep/teklif`) içeriyordu (aktif aşamalar farklı); UI "kapalı" kontrolü yanlış
  anahtara (`olumsuz`) bakıyordu ama red `reddedildi` yazıyordu.
- **Çözüm:** `migration 20260801200000` — tetikleyiciler: numune→"Numune", sipariş→
  "Sipariş", teklif reddi→(başka açık teklif yoksa) "İptal" **(revizyon korunur)**,
  ilk etkileşim→lead "Temas Kuruldu". Aşama yalnız ileri; Tamamlandı/İptal sabit.
  UI: teklif sonuç düğmeleri terminal durumda kapanır; numune "Revize et" onaylanınca
  kapanır. **Regresyon:** `scripts/e2e-state-machine.mjs` (6/6).

### 1.2 Sektör kaldırıldı + web/Instagram tıklanabilir
- `leads.sector` + `customers.sector` **düşürüldü** (`20260801210000`);
  `convert_lead_to_customer` sektörsüz yeniden yazıldı (dönüşüm test edildi). Tüm kod
  referansları temizlendi. Web/Instagram `contact_points`'te zaten vardı → `ContactLine`
  ile tıklanabilir (yeni sekme, ikon; `instagram.com/@user`, `https://…`, `tel:`, `mailto:`).

### 1.3 Mükerrer yanlış alarmı
- **Kök neden:** eşik 0.6 (gevşek), rakamla-ayrışan isimler benzer sayılıyordu.
- **Çözüm** (`20260801220000`): eşik ayardan (`matching.company_similarity_threshold`=0.75),
  <4 çekirdek atlanıyor, **yalnız rakamla ayrışanlar** (Deneme01/02) elenir. Test: Deneme02
  vs Deneme01 → alarm yok; tam eşleşme yakalanır.

### 1.4 Dönüştürülmüş potansiyeller — ZATEN DOĞRU
- `useLeadList` bunları varsayılan gizliyor; "Dönüştürülenleri göster" çipi mevcut. Değişiklik gerekmedi.

### 1.5 İçe aktarma
- **Geri al/geçmiş:** zaten var ve çalışıyor (İçe Aktar → "Geçmiş" → geri al).
- **Kaynak zorunlu:** eklendi — lead içe aktarmada kaynak seçimi (web scraper/fuar/referans…)
  **zorunlu**, tüm partiye uygulanır (`useRunImport` `sourceId`).

### 1.6 Cari/finans renkleri (SİSTEMİK)
- **Kök neden:** `--color-success/danger/warning` PALE arka-plan tonuna eşliydi →
  `text-success` vb. görünmez soluk çıkıyordu.
- **Çözüm:** tüm standalone `text-(success|danger|warning)` → canlı `-foreground` (yeşil
  #067647, kırmızı #c01048). Cari borç kırmızı / alacak yeşil; bildirim sayaç noktası düzeldi.
  Bu, **1.15'in "soluk rakam" kısmını da** çözer.

### 1.7 Müşteri özet kartı
- `customer_summary` RPC (`20260801230000`): talep/teklif/numune/sipariş/açık-dosya sayımı +
  son etkileşim herkese; **ciro/bakiye YALNIZ finance.view** (QA#1 — RPC içinde `has_permission`
  kontrolü). Kartta her rakam tıklanır → ilgili sekme.

### 1.8 Kategori/tür dropdown (kritik)
- **Kök neden:** SearchableSelect Dialog içindeyken Radix scroll-lock portala giden listede
  kaydırmayı engelliyordu → "kaydırılamıyor" + liste dolu olduğundan "tür yetersiz" (aynı bug).
- **Çözüm:** `CommandList` `onWheel/onTouchMove stopPropagation`. Arama zaten var; ağaç zaten
  kapsamlı (aktif ~50 dal-grup, 300+ tür).

### 1.9 Belge editörü
- **(a)** grup/tür seçimi 1.8 ile çözüldü. **(b)** Talep görseli fiyat teklifine **otomatik**
  gelir (`fetchOperationPhoto` → data URL). **(c)** "Tutar 0 TL" teşhis: yüklenen-dosya
  teklifleri yapısal kalemsiz olduğundan total=0 (tasarım); liste artık 0 yerine "—" gösterir.

### 1.10 Sipariş formu oluştur
- OrdersTab'a **"Sipariş formu oluştur"** düğmesi (belge editörüne; teklif/numune sekmeleri gibi).

### 1.11 Para ondalık girişi (SİSTEMİK)
- **Kök neden:** `type="number"` virgülü reddediyor + maliyet/pricing formları
  `replace(/[^0-9.]/g,'')` ile virgülü siliyordu ("45,50"→4550).
- **Çözüm:** `parseDecimal` (virgül+nokta; binlik ayıraç ayrımı) + `MoneyInput` bileşeni.
  Bağlandı: maliyet reçetesi, ödeme (tutar+kur), numune ücreti, marj/yüzde ayarları.
  **+7 birim test.**

### 1.12 Katalogdan talep oluşturma
- Talep formunda "Katalogdan seçim"de **çoklu ürün** seçici; ilk ürün kategori/tür/kompozisyonu
  **otomatik doldurur**; seçilenler operasyona bağlanır (`operation_catalog_items`).

### 1.13 Katalog
- Ürün detay görseli `object-contain` (kırpma yok). Düzenlenebilir alanlara **Renkler** eklendi
  (kod/ad/kompozisyon/MOQ/beden/kategori/koleksiyon/açıklama zaten vardı). custom_margin virgül düzeltmesi.

### 1.14 Kur bilgisi
- `RateBadge` eklendi: Finans başlığı + belge editörü (fiyat teklifi). Maliyet/katalog ekranında
  zaten vardı; ödeme formu zaten ödeme-günü kurunu gösteriyor.

### 1.15 Finans + görev arayüzü
- Finans soluk rakamları 1.6 ile çözüldü + RateBadge. Boş durum kartları `EmptyState` `compact`
  varyantıyla küçültülebilir hale getirildi (py-12→py-10, dar alanlar için compact).

### Ek bulunan/düzeltilen
- `text-danger`/`text-warning` soluk kullanımları (1.6 kapsamında ~35 yerde düzeltildi).
- PricingSettings + CatalogProductForm ondalık virgül düzeltmesi (1.11 kapsamı dışı ek yerler).

---

## 2. Akış basitleştirmeleri
- **Sipariş belgesi:** artık sekmeden tek tıkla üretilir (yükleme zorunluluğu kalktı, opsiyon).
- **Talep + katalog:** katalogdan çoklu ürün seçince kategori/tür/kompozisyon otomatik → daha az alan.
- **Fiyat teklifi:** talep görseli otomatik gelir (elle yükleme adımı kalktı).
- **Müşteri kartı:** özet sayımlar tıklanır → ilgili sekmeye 1 tıkla ulaşım.

## 3. Bulunan ama düzeltilmeyen / kısmi
- **Liste görünümünde iletişim ikonları (1.2 alt-madde):** kart tıklanabilir; liste sorguları
  iletişim noktası çekmediğinden liste-ikonları eklenmedi (ayrı join gerek). Düşük öncelik.
- **Storage'daki 22 demo objesi:** `.env` service-role placeholder olduğu için Storage API'den
  fiziksel silinemedi (DB kayıtları silindi, uygulamada görünmez). Gerçek anahtarla
  `scripts/reset-demo-data.mjs` tekrar çalıştırılınca temizlenir.
- **Görev penceresi ince düzen:** işlevsel; EmptyState compact hazır, geniş yeniden-tasarım yapılmadı (öznel).
- **BULUNAN (senaryo C):** `create_sample_revision` yeni numuneyi `revision_of_sample_id` ile zincirliyor ama
  `revision_round`'u ARTIRMIYOR (hep 1 kalıyor). NumunelerListPage "3+ revizyon" filtresi/rozeti `revision_round>=3`
  koşuluna dayandığından **bu rozet asla tetiklenmeyebilir**. Öneri: `create_sample_revision`'da revision_round =
  kaynak.revision_round+1 yazılmalı VEYA liste filtresi zincir derinliğini saymalı. (Bu turda düzeltilmedi —
  şema/iş-kuralı kararı; onayla düzeltilir.)

## 4. Tavsiyeler (onay gerektirir)
- Gerçek `SUPABASE_SERVICE_ROLE_KEY` girilmeli (storage temizliği, edge fn yerel testleri için).
- Bundle 1.29 MB (>500 KB uyarısı) — route bazlı `React.lazy` kod bölme performansı artırır.
- Teklif/sipariş belgeleri ile `quotes/orders` tablolarını ilişkilendirme (belge total→liste)
  düşünülebilir (şu an belge ve tablo ayrı).

## 5. Test kapsamı

### 5.1 A–J senaryoları — DB katmanı (`scripts/e2e-senaryolar.mjs`) — **19/19 PASS**
Her senaryo kendi verisini üretir, iş kuralını doğrular, `ROLLBACK` ile iz bırakmadan temizlenir.
| Senaryo | Doğrulanan | Sonuç |
|---|---|---|
| A Basit yol | numune→aşama Numune, sipariş→aşama Sipariş, ödeme→bakiye −600 | ✅ |
| B Çoklu ürün | 1 talepte 8 katalog ürünü bağlı | ✅ |
| C Revizyon | teklif v1→v3 (v1 korunur), numune 3 kayıt / 2 revizyon bağı | ✅ |
| D Çoklu dosya | 3 dosya bağlı; biri silinince 2 bağımsız kalır | ✅ |
| E Kısmi ödeme | $3000 + 120.000₺@34 + $1500 → bakiye **−1.970,59** (borç $10k) | ✅ |
| F İptal/geri al | sipariş iptal→ters kayıt bakiye 0; ödeme sil→alacak iade | ✅ |
| G Eşzamanlılık | sahipli talebi ikinci `claim` reddeder ("başkası aldı") | ✅ |
| H Sınır değer | kademe 49→yok,50/51/199→25, 200/201/499→20, 500/501→10; 504 kr.+TR; ±2 yıl tarih | ✅ |
| I Boş sistem | boş sorgular hatasız 0 döner | ✅ |
| J Yoğun | 500 operasyon toplu ekleme | ✅ |

### 5.2 A–J senaryoları — Arayüz (`scripts/e2e-ui-senaryolar.mjs`, Playwright) — **PASS**
Gerçek Chromium + gerçek giriş (`ui.test@tekstilas.com`):
- **Giriş:** başarılı.
- **13 rota** (Gösterge/Müşteriler/Potansiyeller/Talepler/Teklifler/Numuneler/Siparişler/Katalog/
  Belgeler/Finans/Görevler/Hedefler/Raporlar): hepsi render **+ sıfır konsol hatası** (renk/dropdown/
  yeni liste sayfaları canlı doğrulandı) — Senaryo I arayüz karşılığı.
- **Talep oluştur (gerçek akış):** müşteri+kanal seçildi → kayıt → operasyon kartına yönlendi, **TAS kodu
  otomatik üretildi** (Senaryo A arayüz karşılığı). Test verisi sonrasında temizlendi (iz kalmadı).

### 5.3 Diğer
vitest 161/161; durum-makinesi 6/6; dedup senaryoları; dönüşüm regresyonu; RLS 78/78; build sır taraması;
yetim-kayıt 0; sessiz-hata denetimi (statik) temiz.

### 5.4 Kalan (arayüzden elle bakılmalı — otomasyon dışı)
1.9 belge görseli/tutar ve 1.12 çoklu ürünün belge çıktısı (PDF render), 1.7 kart tıklama navigasyonu —
mantık DB+UI-smoke ile kanıtlı ama görsel PDF çıktısı elle bakılmalı.

## 6. Risk listesi (canlı öncesi)
1. **UI-doğrulama borcu:** 1.9/1.12/1.7/1.14 arayüzden (gerçek veriyle) test edilmeli — mantık
   ve tipler doğru, ama görsel/akış kanıtı yok (veri boş).
2. **Service-role placeholder:** storage temizliği ve bazı sunucu işlemleri gerçek anahtar ister.
3. **Durum sözlüğü ikizliği:** quote/sample/order_statuses'te paralel iki anahtar seti var; liste
   görünümleri anahtar-kümesiyle eşlendi ama uzun vadede tekilleştirme önerilir.
4. **Bundle boyutu:** kod bölme yapılmazsa ilk yükleme yavaş kalır.

---
*Güvenlik özeti:* 78/78 public tablo RLS açık · build'de gerçek sır YOK (yalnız publishable anon
key) · maliyet/finans/iç-not YZ payload'una gitmiyor (aiGuard + izin-listesi) · müşteri özeti
ciro/bakiye yalnız finance.view · yetim kayıt 0.
