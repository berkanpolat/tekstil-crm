# Faz 5 — Cari Hesap ve Ödeme: Bakiye ve Kur Mantığı

Bu belge cari bakiyenin **nasıl** hesaplandığını, **kur** çevriminin hangi kuralla
yapıldığını ve ön ödeme kontrolünün mantığını **sayılarla** anlatır. Hesap çekirdeği
DB'dedir (`account_transactions`, `customer_balance`, `order_advance_check`) ve
`scripts/test-finance-p5.mjs` (18 doğrulama) ile test edilir.

## 1. Temel ilkeler (tartışmaya kapalı)

- **Bakiye saklanmaz, türetilir.** `customer_balance(customer_id, as_of)` hareketlerden
  hesaplar. Saklanan bakiye er geç hareketlerle uyuşmaz.
- **Hiçbir hareket silinmez.** Yanlış kayıt **ters kayıtla** düzeltilir (`reverses_id`),
  orijinal durur. Muhasebe temel kuralı.
- **Her harekette kur kayıtta donar** (`exchange_rate`, `usd_rate`, `amount_try`,
  `amount_usd`). Sonradan yeniden hesaplanmaz.
- Tüm tutarlar `numeric(14,2)`; `float` yok → yuvarlama hatası yok.

## 2. Bakiye formülü

Tek tabloda (`account_transactions`) `direction` alanı ayrımı sağlar:
- `borc` = müşterinin borcu (sipariş tutarı)
- `alacak` = müşteri lehine (ödeme)

```
bakiye = Σ(alacak) − Σ(borc)      (hem USD hem TRY cinsinden)
```

**Negatif bakiye = müşteri borçlu** (arayüzde kırmızı). Pozitif = fazla ödeme / avans.

## 3. Kur nasıl uygulanıyor

Teklif/sipariş USD üzerinden; tahsilat TL veya USD gelebilir (kullanıcı kararı).
Her harekette iki kur saklanır:

- `exchange_rate` — işlem para biriminin **TRY** karşılığı (TRY için 1).
- `usd_rate` — işlem anındaki **USD→TRY** (USD karşılığını hesaplamak için).

```
amount_try = round(amount × exchange_rate, 2)
amount_usd = round(amount_try / usd_rate, 2)
```

**TL tahsilatta ödeme günü TCMB kuru** kullanılır (kullanıcı kararı): formda **ödeme
tarihine göre** otomatik gelir, elle değiştirilebilir; kaydedilince donar.

**Geçmiş tarihli ödeme:** ödeme günü seçilince o günün TCMB bülteni çekilir
(`/rate-on-date` → `www.tcmb.gov.tr/kurlar/…`). Hafta sonu/tatil gibi bülten olmayan
günlerde **en yakın önceki iş gününün** bülteni kullanılır ve formda açıkça yazılır:
"25.07 kuru kullanıldı (TCMB 24.07 yayını)". Çekilen kur `exchange_rates`'e
(`rate_date` ile) önbelleğe alınır; servis erişilemezse `rate_on_date()` saklı
kayıttan verir. **Kur hiç bulunamazsa alan boş kalır, kullanıcı elle girer** — bugünün
kuru sessizce KONMAZ. (`test-finance-p5.mjs [8]`)

### Kritik senaryo (sayılarla)

> 1000 USD borç + 32.000 TRY ödeme, USD kuru **32**

| Hareket | amount | ccy | exchange_rate | usd_rate | amount_try | amount_usd |
|---|---:|---|---:|---:|---:|---:|
| Borç (sipariş) | 1000 | USD | 32 | 32 | 32.000 | 1.000 |
| Alacak (ödeme) | 32.000 | TRY | 1 | 32 | 32.000 | 1.000 |

Bakiye USD = 1.000 − 1.000 = **0** · Bakiye TRY = 32.000 − 32.000 = **0** ✓

> Aynı borç, ama ödeme günü kuru **30** olsaydı

Ödeme amount_usd = 32.000 / 30 = **1.066,67** → USD bakiye = 1.066,67 − 1.000 =
**+66,67** (müşteri 66,67 $ fazla ödemiş), TRY bakiye = 0.
Kur farkının kimde kaldığı böylece **kayıtta görünür**. (`test-finance-p5.mjs [1]`)

## 4. Otomatik hareketler (trigger)

- **Sipariş → borç.** `orders.total`, kalemlerden türeyip değiştikçe **fark kaydı**
  yazılır (mevcut satırlar değişmez):
  - Oluşur (10.000) → borç 10.000 "Sipariş tutarı"
  - 12.000 olur → borç **+2.000** "Sipariş tutarı güncellendi: 10.000 → 12.000"
  - 8.000 olur → alacak **−2.000**
  - İptal/silme → aktif sipariş hareketleri **ters kayıtla** kapanır.
  (`test-finance-p5.mjs [5]`)
- **Ödeme → alacak.** `payments` (gelen) girilince alacak hareketi; ödeme soft-delete
  edilince ters kayıt (borç). (`test-finance-p5.mjs [4]`)

## 5. Ön ödeme kontrolü (yumuşak kapı)

Sipariş `uretimde` durumuna **geçerken** (oluşturmada değil — kullanıcı kararı):

```
alınan ön ödeme (is_advance, USD) / sipariş tutarı (USD) ≥ finance.advance_payment_percent ?
```

`finance.advance_payment_percent` varsayılan **%50**. "Alınan ön ödeme" = yalnız
**"Ön ödeme" işaretli** tahsilatlar (kullanıcı kararı).

- **Yeterliyse** geçiş sorunsuz.
- **Yetersizse** uyarı: "Bu sipariş için $X ön ödeme bekleniyor, $Y alınmış." Gerekçe
  **zorunlu**, `event_log`'a `gate.overridden` (gate=`on_odeme_yetersiz`) yazılır,
  **yöneticilere bildirim** gider. **Engel yok** (doküman esneklik şart koşar).

**Sınır testleri:** gerekli−1 $ → yetersiz; tam gerekli → yeterli; gerekli+1 $ →
yeterli. (`test-finance-p5.mjs [6]`)

### Örnek

Sipariş 12.000 ₺, USD kuru 40 → `order_total_usd = 12.000 / 40 = 300 $`.
Gerekli ön ödeme = 300 × %50 = **150 $**. 150 $ (ya da fazlası) ön ödeme alınmışsa
üretime geçiş serbest; altındaysa gerekçe istenir.

## 6. Vade takibi

`orders.advance_due_date` / `balance_due_date` (payment_terms'ten türetilebilir, elle
değiştirilebilir). `process_payment_due_warnings()` (istemci aralıkla çağırır):
- Vade `alerts.payment_warning_days` (vars. 3) gün kala → `payment_due_soon` (uyarı)
- Vade geçince → `payment_overdue` (kritik)
- Yalnız ödemesi eksik ve aktif siparişler; alıcı = operasyon sahibi + yöneticiler.

## 7. Yetkilendirme (sızıntı koruması)

- `finance.view` / `finance.edit` / `finance.export`. owner/admin/manager/finance tam;
  **sales yalnız `finance.view`** ve **yalnız sorumlu olduğu müşteriyi** görür, ödeme
  kaydedemez. operations/viewer finansal veri göremez.
- `account_transactions` ve `payments` RLS `finance.view`/`finance.edit`'e bağlı;
  `finance_customer_visible()` sales'i kendi müşterisiyle sınırlar.
- Finans yetkisi olmayan: Finans menüsünü görmez, müşteri kartı Cari sekmesi görünmez,
  sipariş kartı ödeme durumu bandı gizli. (`test-finance-p5.mjs [7]`)

## 8. Varsayımlar ve tereddütler (kullanıcı kontrol edebilir)

1. **USD-karşılık kuru.** Her satır kendi `usd_rate`'iyle donar. Geçmişe girilen ödemede
   **ödeme gününün** TCMB kuru otomatik çekilir (§3); bulunamazsa boş kalır, elle girilir.
   *(Çözüldü — eski "bugünün kuru" davranışı kaldırıldı.)*
2. **Ön ödeme sayımı.** Yalnız `is_advance` işaretli tahsilat sayılır; işaretlenmemiş
   erken ödeme orana girmez (kullanıcı kararı — disipline bağlı).
3. **Fark kaydı kuru.** Sipariş tutarı sonradan değişince fark, **değişiklik anındaki**
   kurla yazılır (siparişin ilk kuruyla değil) — gerçek tarihi yansıtır.
4. **Ekstre bakiye yönü.** Ekstre belgesinde bakiye "borç−alacak" (pozitif = müşteri
   borçlu) konvansiyonuyla gösterilir; uygulama içi bakiye ise "alacak−borç"
   (negatif = borçlu). İkisi aynı gerçeği farklı işaretle sunar.
5. **Tedarikçi (giden) ödemeleri.** Şema destekler ama bu fazda arayüz yalnız geleni
   açar (kullanıcı kararı).
