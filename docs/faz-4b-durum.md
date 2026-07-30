# Faz 4B — Durum ve Devir (mola noktası)

> Bu oturum üç işi kapsadı: **Faz 4A belge düzeltmeleri (A–H)** → **Bildirim sistemi (B.1–B.10)**
> → **Faz 4B başlangıcı (P4B.1–P4B.2)**. Yeni oturumda buradan temiz devam edilir.

## Nerede kaldık

**Tamamlanan (Faz 4B):**
- **P4B.1 — Katalog şeması** ✅ onaylı + uygulı (`20260730100000_p4b_catalog_schema.sql`):
  `catalogs`, `catalog_collections`, `catalog_products` (kod unique, name_normalized gin_trgm,
  category_id/type_id → Faz 3 `product_categories` FK), `catalog_product_images`. Maliyet AYRI (P4B.4).
- **P4B.2 — İçe aktarma (script)** ✅ ürünler+görseller:
  - `scripts/import-catalog.mjs` — pdftotext parser + kategori eşleme + upsert (idempotent) +
    `--dry-run` + `--images` (+`--limit N`). Tekrar çalıştırılabilir.
  - **143/143 ürün** yüklendi. Koleksiyon: CASUAL 51 / PREMIUM 55 / TESETTÜR 37 (143/143).
    Kategori eşleşen: **105/143** (38 eşleşmeyen — aşağıda). Kompozisyon `/m²` birleşiyor,
    2-satır adlar birleşiyor, PREMİUM (Türkçe İ) yakalanıyor.
  - **Görseller: 143/143 ürün, 504 görsel** (ürün başına ~3-4: detay/arka/yan/diger), 2 üründe
    kompozit görsel fallback ('ana'). `documents/catalog/<kod>/` altında.

**Katalog verisi hazır → P4B.3 (arayüz) bunun üzerine kurulacak.**

## Sıradaki adım

**P4B.3 — Katalog arayüzü** (henüz başlanmadı): ızgara+liste, filtre (katalog/koleksiyon/kategori/
tip/beden/aktiflik + maliyet var/yok), arama (normalize), ürün kartı (galeri + teknik + maliyet/fiyat
sekmeleri yetkiye bağlı + "teklif oluştur"), elle ürün ekle/düzenle. `/katalog` rotası şu an yer tutucu.

Sonra sırayla: **P4B.4** maliyet reçetesi → **P4B.5 (⏸ ONAY DURAĞI)** döviz kuru → **P4B.6 (⏸ ONAY
DURAĞI)** marj/kademe → P4B.7 maliyet belgesi → P4B.8 tek-tuş teklif → P4B.9 operasyon FK → P4B.10 test.

## Verilen kararlar

- **Katalog şeması onaylı** (yukarıdaki 4 tablo).
- **§5 döviz kuru:** kaynak **TCMB Döviz Satış** (Faz 4A `/rates` altyapısı hazır) · güvenlik payı
  **%0** (ayar alanı olacak, varsayılan 0) · tazeleme **6 saatte bir** (cron yok, okuma anında yaş).
- P4B.5/P4B.6 uygulanmadan önce onay alınacak (§7).

## 38 kategori-eşleşmeyen ürün — çözüm planı

PDF "Ürün Tipi" alanı bazı ürünlerde ağaçtaki tür adıyla birebir değil:

| Adet | PDF Ürün Tipi | Çözüm |
|---:|---|---|
| 32 | **Tesettür** | Ağaçta "Kadın Giyim / Tesettür" **grubu var**. Tip "Tesettür" jenerik → **gruba eşle** (category_id = grup, type_id null). import script'e alias. |
| 4 | **Atlet ve Body** | Ağaçta "Atlet" + "Body" türleri var (Kadın/Üst Giyim). Birleşik yazım → **alias** ("atlet ve body" → Body). |
| 1 | **Palto** | Ağaçta yok → Kadın/Dış Giyim'e **"Palto" türü ekle** (G migration'a). |
| 1 | **Takım Elbise** | Ağaçta "İkili Takım" var → **alias** ("takım elbise" → İkili Takım). |

Uygulama: `scripts/import-catalog.mjs` içindeki `ALIAS` map'e ekle + `mapType`'a "grup adına eşleşme"
(tip bir dal/grup adıysa category_id=grup) kolu ekle; "Palto" için kategori ağacı migration'ına tür
ekle. Sonra `node scripts/import-catalog.mjs` (idempotent) yeniden → 143/143 kategori eşleşir.

## Doğrulama durumu (bu oturum sonu)

- tsc + vite build: yeşil (son src değişikliğinde) · eslint temiz · vitest 99/99.
- Katalog: DB'de 143 ürün + 504 görsel doğrulandı (SQL). Katalog **arayüzü henüz yok** (P4B.3).

---

## Bu oturumda tamamlananların EKSİK/HAFİF kalan maddeleri (kullanıcı kontrolü öncesi)

### Faz 4A belge düzeltmeleri (A–H) — hepsi tamam
- Kod eksiği yok. **Dağıtım-zamanı:** Fly.io PDF servisi deploy + `docs/faz-4a-performans.md` ikinci
  tablo (uçtan-uca) gerçek fra rakamlarıyla doldurulacak (deploy sonrası; kod hazır).

### Bildirim sistemi (B.1–B.10) — çekirdek tamam, iki hafif kalan
1. **B.7 talep listesi "hazır görünümler"** (Açık dosyalarım / Süresi dolanlar / Ertelenenler /
   Sahipsiz) + satır-içi açık-dosya göstergesi / kırmızı zemin. Rozet linkleri `?view=` taşıyor ama
   `OperationsListPage` bu filtreyi henüz uygulamıyor (open_files join gerekli).
2. **B.6 kademe-başına ayrıntılı alıcı kuralları editörü.** `notification_rules` seed'li ve motor
   çalışıyor; ayar UI'ında eşikler + tek "havuz rolü" var, ama her kademe için kişi/departman/rol
   bazlı düzenleyici yok (kurallar DB'de).

### Faz 4B (P4B) — başlangıç yapıldı, gerisi açık
3. **P4B.2 arayüz içe-aktarma** (Kabul 4): PDF/Excel yükle → alan eşle → önizle → aktar. Şu an yalnızca
   `scripts/import-catalog.mjs` var (komut satırı). Arayüz kısmı yapılmadı.
4. **38 ürün kategori-eşleşmesi** (yukarıdaki tablo) — alias/tür ekleme bekliyor.
5. **P4B.3–P4B.10** başlanmadı (katalog UI, maliyet, kur, marj, maliyet belgesi, tek-tuş teklif,
   operasyon FK, testler). P4B.5 ve P4B.6 onay durakları.

### Genel
- `src/lib/database.types.ts` **elle** güncelleniyor (supabase gen types docker istiyor, colima kapalı).
  Yeni tablo/RPC ekl=> types'a elle eklenmeli. Katalog tabloları henüz types'a EKLENMEDİ (P4B.3'te
  client sorguları yazılırken eklenecek).
