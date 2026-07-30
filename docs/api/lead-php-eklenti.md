# `lead.php` — CRM Eklentisi (kopyala-yapıştır)

Bu kod, siteden gelen talebi CRM'e iletir. **Mevcut akışa dokunmaz.**

> Gerçek dosya incelendi; kod dosyanın mevcut değişkenlerine göre uyarlandı:
> `$rec['name']`, `$d['selected_products']`, `$d['image_base64']`, `$imgNote`.

---

## 0. Önce yedek al

```bash
cp public_html/lead.php public_html/lead.php.yedek-$(date +%Y%m%d)
```

## 1. Nereye yapıştırılacak — DOSYANIN EN SONUNA

Dosyanın sonunda zaten şu var:

```php
fastcgi_finish_request();   // (mevcut) yanıtı kullanıcıya gönderir
lead_queue_process();       // (mevcut) e-posta kuyruğunu işler
```

CRM bloğu **`lead_queue_process();` çağrısından SONRA, dosyanın en sonuna** gelir.
Böylece yanıt kullanıcıya zaten gitmiştir (mevcut `fastcgi_finish_request()` sayesinde) ve
CRM çağrısı arka planda koşar. **Kendi `fastcgi_finish_request()` çağrımızı EKLEMİYORUZ —
tek çağrı mevcut olan kalır.**

## 2. Eklenecek kod (dosyanın en sonu)

```php
// ============================================================
// CRM'e talep ilet (best-effort) — mevcut akışa DOKUNMAZ.
// Konum: dosyanın EN SONU, lead_queue_process();'ten sonra.
// Yanıt zaten mevcut fastcgi_finish_request() ile gönderildi;
// burada ikinci bir fastcgi_finish_request() ÇAĞRILMAZ.
// ============================================================
try {
    $CRM_URL    = 'https://<PROJE-REF>.supabase.co/functions/v1/intake-request';
    $CRM_SECRET = 'BURAYA_INTAKE_SECRET';   // Supabase Secrets'taki INTAKE_SECRET ile AYNI değer

    // $rec: leads.jsonl'e yazılan kayıt. $d: siteye gelen ham istek gövdesi.
    $phone = $rec['phone'] ?? '';
    $client_reference = ($rec['ts'] ?? time()) . '-' . substr(sha1($phone), 0, 8);  // idempotency

    // Ek: leads_private (0700, web kökü dışı) dışarıdan erişilemez → URL yerine base64.
    // Küçük görseli gönder; büyükse atla ve notta sunucu yolunu bırak.
    $note = $rec['note'] ?? null;
    $image_base64 = null;
    $b64 = $d['image_base64'] ?? null;
    if ($b64 !== null && strlen($b64) <= 8 * 1024 * 1024) {   // ~6 MB dosya sınırı
        $image_base64 = $b64;
    } elseif ($b64 !== null) {
        $note = trim(($note ?? '') . ' [Büyük ek CRM\'e gönderilmedi; sunucuda: leads_private/uploads/' . ($imgNote ?? '') . ']');
    }

    $payload = [
        'client_reference'  => $client_reference,
        'full_name'         => $rec['name'] ?? null,          // dikkat: name
        'city'              => $rec['city'] ?? null,
        'phone'             => $phone,
        'email'             => $rec['email'] ?? null,
        'mode'              => $rec['mode'] ?? null,
        'source'            => $rec['source'] ?? null,
        'note'              => $note,
        'selected_products' => $d['selected_products'] ?? [], // ham dizi ($rec['products'] değil)
        'image_base64'      => $image_base64,
    ];

    $ch = curl_init($CRM_URL);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'X-Intake-Secret: ' . $CRM_SECRET,
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 6,          // zaman aşımı 6 sn
        CURLOPT_CONNECTTIMEOUT => 4,
    ]);
    $resp = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    // curl_close ÇAĞRILMIYOR (PHP 8'de gerekli değil)

    $line = date('c') . ' | ref=' . $client_reference . ' | HTTP ' . $code . ' | ' . ($resp !== false ? $resp : $err) . "\n";
    if ($code >= 200 && $code < 300) {
        @file_put_contents(__DIR__ . '/crm_response.log', $line, FILE_APPEND);
    } else {
        @file_put_contents(__DIR__ . '/crm_failed.log', $line, FILE_APPEND);
    }
} catch (\Throwable $e) {
    @file_put_contents(__DIR__ . '/crm_failed.log', date('c') . ' | EXCEPTION | ' . $e->getMessage() . "\n", FILE_APPEND);
}
```

### Doldurulacak iki yer
- `<PROJE-REF>` → Supabase proje referansınız.
- `BURAYA_INTAKE_SECRET` → gerçek değer sohbette gösterilmez; CRM tarafındaki
  `.secrets/intake-secret.txt` dosyasında. Bu değeri **hem** Supabase → Edge Functions →
  Secrets'a `INTAKE_SECRET` olarak **hem de** buraya birebir aynı girin.

### Ek dosya kararı (gizlilik)
`leads_private/uploads/` **0700 + web kökü dışı** olduğu için dışarıdan erişilemez;
bu **kasıtlı** (müşteri ekleri gizli). Bu yüzden URL yerine **`image_base64`** kullanılır:
küçük görseller gönderilir, ~6 MB üstü dosyalar CRM'e gönderilmez ve talebin notuna
sunucudaki yol yazılır (talep yine oluşur). Büyük dosyaların da CRM'e gelmesi ileride
gerekirse doğru yol **token korumalı bir indirme ucu**dur (dosyaları herkese açmadan);
`public_html` altına kopyalamak gizlilik sızıntısı olacağından önerilmez.

## 3. Test

1. Siteden bir deneme talebi gönderin.
2. Sunucuda logları kontrol edin:
   ```bash
   tail -n 5 public_html/crm_response.log   # başarı: HTTP 201, {"ok":true,"code":"TAS-…"}
   tail -n 5 public_html/crm_failed.log     # hata varsa buraya düşer
   ```
3. CRM'de **Talepler → havuz**'da yeni TAS kodunu görün.
4. Aynı talebi tekrar gönderin → log'da `idempotent: true`, CRM'de **tek** kayıt.

## 4. Geri alma

```bash
cp public_html/lead.php.yedek-YYYYMMDD public_html/lead.php
```
(veya eklediğiniz bloğu silin). Mevcut akış bağımsız olduğu için site çalışmaya devam eder.
