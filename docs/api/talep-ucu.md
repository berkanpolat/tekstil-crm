# Talep Ucu — `intake-request`

tekstilas.com'dan gelen taleplerin CRM'e düştüğü uç. Site (`lead.php`) mevcut
akışını tamamladıktan **sonra** bu uca "best-effort" POST atar. Site tarafı için
kopyalanacak kod: `docs/api/lead-php-eklenti.md`.

## Uç adresi

```
POST https://<PROJE-REF>.supabase.co/functions/v1/intake-request
```

## Kimlik doğrulama

- Başlık: `X-Intake-Secret: <INTAKE_SECRET>`
- Anahtar Supabase → Edge Functions → Secrets içinde `INTAKE_SECRET` olarak tutulur;
  site tarafında aynı değer `lead.php`'ye girilir. Yanlış/eksikse **401**.
- Supabase anon anahtarı gerekmez (`verify_jwt = false`).

## İstek gövdesi (sitenin gönderdiği yapı)

```json
{
  "client_reference": "1722250000-ab12cd",
  "full_name": "HG WEAR ANONİM ŞİRKETİ",
  "city": "Isparta",
  "phone": "5304567890",
  "email": "hgwear@example.com",
  "mode": "upload",
  "source": "deneme-landing",
  "note": "Ekte görseller eklidir.",
  "selected_products": [{ "code": "ST-26SS130010", "name": "Askılı Elbise" }],
  "file_url": "https://tekstilas.com/leads_private/uploads/abc.jpg",
  "image_base64": "data:image/jpeg;base64,…"
}
```

| Alan | Zorunlu | Açıklama |
|---|---|---|
| `client_reference` | önerilir | Idempotency anahtarı. Aynı değer ikinci kez gelirse yeni kayıt açılmaz. `ts` + telefon karması önerilir. |
| `full_name` | evet* | Müşteri/firma adı. (`full_name` veya `phone`'dan en az biri gerekli.) |
| `city` | hayır | İl adı; sistemdeki il listesiyle eşleştirilir. |
| `phone` | evet* | Başında sıfır olmadan gelebilir; E.164'e normalize edilir (`+90…`). |
| `email` | hayır | İletişim noktası olarak eklenir. |
| `mode` | hayır | `upload` → görsel yükleme; başka değer → katalogdan seçim. |
| `source` | hayır | Açılış sayfası; `operations.landing_source`'a yazılır (rapor grafiği). |
| `note` | hayır | Talep açıklaması. |
| `selected_products[]` | hayır | `{code, name}` — katalog kodu ile eşleştirilir. |
| `file_url` | hayır | **Büyük dosyalar için tercih edilen.** CRM arka planda indirir (≤ 50 MB). |
| `image_base64` | hayır | Küçük görseller için `data:` URL. |

\* `full_name` **veya** `phone` gerekli.

## Davranış

1. `X-Intake-Secret` doğrulanır (yanlışsa 401).
2. `client_reference` varsa **idempotency**: mevcut operasyon dönerse yeni kayıt açılmaz.
3. Telefon normalize edilir; **önce müşteriler sonra potansiyeller** taranır.
   Eşleşme varsa mevcut kayda bağlanır; yoksa **potansiyel açılır → müşteriye çevrilir**.
4. Aynı müşterinin **açık talebi** varsa yeni talep yine oluşur; kartında **birleştirme
   önerisi** çıkar (`possible_merge_with`).
5. Operasyon oluşur: **TAS kodu + SLA sayacı** trigger'larda; **sahipsiz** (havuz);
   kanal/kaynak `web_sitesi`; `landing_source`, `product_source` set edilir.
6. `selected_products` **koda göre** kataloğa bağlanır; eşleşmeyen kodlar nota yazılır.
7. Katalogdan seçimde **taslak fiyat teklifi** hazırlanır (operasyon durumu değişmez;
   çalışan Teklif sekmesindeki banttan inceleyip onaylar → gerçek teklif olur).
8. `file_url` indirilir / `image_base64` çözülür → Storage'a yüklenir, operasyona bağlanır.
   İndirme başarısızsa nota yazılır — **talep yine oluşur, kayıp yok.**

## Yanıt

**201** (yeni kayıt):
```json
{ "ok": true, "code": "TAS-ZESXD3", "operation_id": 3831, "files_saved": 1, "warnings": [] }
```

**200** (idempotent — aynı `client_reference`):
```json
{ "ok": true, "code": "TAS-ZESXD3", "operation_id": 3831, "idempotent": true }
```

## Hata kodları

| Kod | Anlam |
|---|---|
| 400 | `invalid_json` (bozuk gövde) veya `contact_required` (ad ve telefon boş) |
| 401 | `unauthorized` (gizli anahtar yanlış/eksik) |
| 405 | POST dışı yöntem |
| 500 | `intake_failed` (beklenmeyen; detay `detail` alanında) |

## Idempotency

Aynı `client_reference` ile ikinci istek yeni kayıt açmaz; ilk operasyonun TAS kodunu
ve `idempotent: true` döner. Site 6 sn zaman aşımı içinde yanıt alamayıp yeniden
denerse çift kayıt oluşmaz.

## Örnek istek (curl)

```bash
curl -X POST "https://<PROJE-REF>.supabase.co/functions/v1/intake-request" \
  -H "Content-Type: application/json" \
  -H "X-Intake-Secret: <INTAKE_SECRET>" \
  -d '{"client_reference":"test-1","full_name":"Deneme AŞ","city":"Isparta","phone":"5304567890","mode":"upload","source":"deneme-landing","note":"Test"}'
```

> Yerel/deploy'suz test: iş mantığı `public.intake_process(jsonb)` RPC'sindedir;
> `node scripts/test-intake.mjs` tüm senaryoları siteye dokunmadan doğrular.

## Mimari notu

Edge function ince bir sarmalayıcıdır: gizli anahtarı doğrular, `intake_process`
RPC'sini çağırır (tüm eşleştirme/kayıt/katalog/taslak-teklif mantığı), sonra dosyaları
indirip Storage'a bağlar. Böylece iş mantığı deploy'suz test edilebilir.
