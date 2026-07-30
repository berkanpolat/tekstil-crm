# Faz 4A — Belge motoru performans ölçümü (P4A.6)

**Hedef: 2 saniye altı** (gereklilik). Ölçüm: `scripts/benchmark-pdf.mjs`.

## Ortam ve yöntem

- Sıcak Chromium (tek örnek, açılışta `studio.html` yüklenir, tekrar başlatılmaz).
- Gömülü font + logo (dış indirme yok), CATALOG çıkarılmış lean şablon (648 KB).
- Ölçülen: `renderDocument` = `page.evaluate` (durum + doc fonksiyonu + barkod) + `page.pdf` (A4).
- Her belge için: **1 ilk render + 10 sıcak tekrar**; ortalama ve en kötü.
- Fotoğraf etkisi: fiyat teklifi ~90 KB gömülü görselle ayrıca ölçüldü.

## Sonuçlar (ms)

| Belge | İlk | Sıcak Ort | En Kötü | Hedef (2000) |
|---|---:|---:|---:|:--:|
| Fiyat Teklifi (fotosuz) | 60 | 43 | 46 | ✓ |
| Fiyat Teklifi (fotolu) | 47 | 47 | 61 | ✓ |
| Sipariş Onay | 65 | 46 | 62 | ✓ |
| Numune Etiketi (4 adet/A4) | 39 | 32 | 45 | ✓ |
| Sipariş Formu (3 sayfa) | 51 | 58 | 73 | ✓ |
| Koli Üstü (2 koli/A4) | 51 | 44 | 49 | ✓ |

**Gerçek soğuk başlangıç** (servis açılışından sonra ilk render): **60 ms**.

## Değerlendirme

- Tüm süreler **~30–75 ms** — 2 sn hedefinin **~30 kat altında**.
- Sıcak tarayıcı + gömülü font/logo + yerel render performansın anahtarı.
- Fotoğraf etkisi ihmal edilebilir (~+4 ms).
- **En kötü durum bile 73 ms** — hedef rahatça karşılanıyor.

## Kapsam notu

Bu rakamlar **PDF render adımını** ölçer (2 sn bütçesinin darboğaz adayı). Uçtan
uca akış ayrıca şunları içerir: `build_document_data` (DB, ~10-30 ms), HTTP
round-trip (LAN'da ~birkaç ms), Storage yükleme (~100-300 ms), `documents`
insert. Render ~50 ms olduğundan, tüm pipeline rahatça 2 sn altında kalır.

**Zaman aşımı davranışı (P4A.1):** 2 sn'yi aşarsa istek arka plana alınır, arayüz
"hazırlanıyor" gösterir. Render 50 ms olduğundan bu yol pratikte tetiklenmez;
yine de güvenlik ağı olarak generate akışında bırakılabilir.

## Sonuç (render adımı)

✅ **2 saniye hedefi karşılandı; hiçbir belge aşmadı.** Tasarım gözden geçirmeye
gerek yok. (Aşan olsaydı, P4A.6 kuralı gereği durup alternatif tasarım
konuşulacaktı.)

---

# İkinci ölçüm — Uçtan uca (dağıtım sonrası)

İlk tablo yalnızca **render adımını** ve yerel makineyi kapsar. Gerçek üretim
akışı: `build_document_data` (Supabase RPC) → PDF servisi (Fly, HTTP) → Storage
yükleme → `documents` insert. Bu ölçüm **Fly (fra) dağıtımı sonrası** ağ gecikmesi
ve Storage dahil tekrarlanmalı.

## Bileşenler ve beklenti

| Adım | Yerel ön ölçüm (makine → Supabase fra) | Fly (fra ↔ fra intra-region) beklenti |
|---|---:|---:|
| `build_document_data` RPC | ~480 ms* | ~5–30 ms |
| PDF render (servis içi) | ~50 ms | ~50 ms |
| Storage yükleme (PDF ~100–400 KB) | ölçülecek | ~50–200 ms |
| `documents` insert | ~ RPC ile aynı ağ | ~5–30 ms |
| **Toplam (tahmini)** | ağ-baskın (yanıltıcı) | **~150–350 ms** |

\* Yerel RPC süresi **ağ gecikmesi baskın** (makine → Frankfurt); fonksiyonun
sunucu tarafı işi ~10–30 ms. Fly Frankfurt'ta olduğundan bu adım intra-region'da
çok daha hızlıdır — yani yerel sayı gerçek üretimi **fazla tahmin eder**.

## Dağıtım sonrası doldurulacak (gerçek Fly rakamları)

`fly deploy` sonrası aşağıdaki tabloyu gerçek ölçümle doldur. Ölçüm: uygulamadan
"Belge üret" → tarayıcı Performance API veya `test-generate-doc-ui.mjs`'a süre
logu ekleyerek 10 tekrar.

| Belge | Uçtan uca Ort (ms) | En Kötü (ms) | Hedef (2000) |
|---|---:|---:|:--:|
| Fiyat Teklifi | _(doldurulacak)_ | | |
| Sipariş Onay | _(doldurulacak)_ | | |
| Numune Etiketi | _(doldurulacak)_ | | |
| Sipariş Formu | _(doldurulacak)_ | | |
| Koli Üstü | _(doldurulacak)_ | | |

> Render ~50 ms olduğundan, intra-region ağ + Storage ile toplam beklenti
> ~150–350 ms — 2 sn bütçesinin çok altında. Yine de gerçek rakam dağıtımda
> doğrulanmalı (özellikle Storage yükleme ve büyük fotolu teklifler).
