# Site talep girişi — `lead.php`

`tekstilas.com` form gönderimlerinin girdiği nokta. Sunucuda `/public_html/lead.php`
olarak duruyor (cPanel, 91.151.95.70). **Buradaki kopya referanstır** — sürüm kontrolü
olsun diye tutulur; canlıdaki dosya FTP ile güncellenir.

> ⚠️ Bu dosyadaki `__INTAKE_SECRET__` ve `__STUDIO_ANON_KEY__` **yer tutucudur.**
> Gerçek değerler yalnız sunucudaki dosyada bulunur. Repoya asla gerçek anahtar girmez.

## Ne yapar (sırayla)

1. **`leads_private/leads.jsonl`'e yazar** — kara kutu, hiçbir CRM'e bağlı değil
2. **E-posta gönderir** — başarısızsa kuyruğa alır, `mail-retry.php` tekrar dener
3. **yeniCrm'e iletir** → `POST /functions/v1/intake-request`, `X-Intake-Secret` ile korunur

1 ve 2 **emniyet ağıdır**: CRM iletimi patlasa bile talep hem dosyada hem mailde durur.
18 Ağustos'ta bir DNS hatası tek talebi CRM'den düşürdü; `leads.jsonl`'den kurtarıldı.

## Studio iletimi kapalı

31 Ağustos 2026'da `$STUDIO_FORWARD = false` yapıldı. Sebep: aynı talep iki CRM'e
düşünce iki kişi ayrı ayrı arıyor, iki teklif çıkıyor, hangisinin gerçek olduğu
belirsizleşiyordu. Studio **kapatılmadı**, yalnız yeni talep almıyor; geçmiş verisi
yerinde. Geri açmak için bayrağı `true` yap.

## İdempotency

`client_reference = <gönderim zamanı>-<sha1(telefon)[0:8]>`. Aynı gönderim tekrar
iletilse (curl yeniden denemesi, geçmiş aktarımı) kopya talep oluşmaz —
`intake_process` bunu anahtar olarak kullanır ve `idempotent: true` döner.

## Sağlık kontrolü

```
node scripts/m2-intake-saglik.mjs --sunucu
```
CRM'e düşen talep sayısı, bağsız ürün kalemi, ve sunucudaki iletim logları.
**Studio logu 31 Ağu 18:15'ten sonra büyümemeli.**

## Değiştirme sırası (bozulursa talep kaybı olur)

1. Önce edge function'ı yayına al ve kuru koşuyla dene
2. Sonra `lead.php`'yi çevir
3. Asla tersi
