# 1 Ağustos 2026'dan bugüne site taleplerinin CRM'e kayıpsız aktarımı — PLAN

**İstek (Berkan, 20 Eyl 2026):** tekstilas.com'dan 1 Ağustos'tan itibaren gelen
talepleri durumlarıyla CRM'e aktar. WhatsApp/e-posta gelenleri Affan elle giriyor,
kapsam dışı. Durumları elle düzeltmek kolay, öncelik kayıt kaybı olmaması.

## 1. Bugünkü durum (21 Eyl 2026 ölçümü)

CRM'de (`kkxvoxeqfsaqzklrtgrw`) **6 talep var**, hepsi 16 Eyl sonrası elle girilmiş.

Neden boş:

| Olay | Tarih | Kanıt |
|---|---|---|
| CRM'de toplu silme: 542 talep, 502 müşteri, 313 teklif, 1352 lead, 664 dosya, 202 görüşme… | **16 Eyl 2026 10:29 UTC**, `source='system'`, aktör yok (SQL ile) | `audit_log` |
| Site → CRM iletimi kesildi. Canlı `lead.php` artık yalnız Studio'nun `landing-submit-lead` fonksiyonuna gönderiyor | son CRM kaydı **8 Eyl 10:13**; canlı `lead.php` 13–18 Eyl'de yeniden yazıldı (`sms/uretim/lead.php`) | `crm_response.log` 367 satır, hepsi 201 |
| Eski Süreç Takip Sistemi hâlâ **günlük kullanımda** | son kayıt **19 Eyl** | 1 Ağu+ 350 kayıt: Affan 220 · Ayşe 80 · Polat 50 |

Yani Berkan'ın "durumlarıyla" dediği şey eski Süreç Takip'te; ham site talepleri
ise üç yerde birden duruyor.

## 2. Veri kaynakları envanteri

| # | Kaynak | Erişim | 1 Ağu+ kayıt | Ne taşıyor | Eksiği |
|---|---|---|---|---|---|
| A | **`audit_log.old_values`** (CRM'in kendisi) | Management API SQL | **542 talep** (Ağu 277 · Eyl 76 · Tem 189) + 502 müşteri + teklif/görüşme/not/dosya satırları | Silinen satırların **tam JSON'u**: kod, client_reference (318), legacy_code (224), aşama, durum, il, ürün kaynağı | Silme anındaki hâl; 8 Eyl'den sonra gelen siteyi görmez |
| B | **Sunucu `leads_private/leads.jsonl`** | FTP | **491** (Ağu 280 · Eyl 211), 431 tekil telefon | Ham form: ad, il, tel, e-posta, ürün kodları, not, görsel, kaynak/UTM, `istek_id` | Durum yok; Studio'ya giden `landing-submit-lead` yanıtı kaydedilmiyor |
| C | **Süreç Takip** (`hzqojhaepvvipwqlnbay`) | anon anahtar + `tunacardak@gmail.com` girişi (RLS geçiyor) | **350** (toplam 521), 541 müşteri, 1759 geçmiş satırı | **Durum** (8 değer), atanan, teklif fiyatı, adet, teslim, takip tarihi, günlük not, `record_history` | Site/WhatsApp ayrımı yok; kayıt tarihi elle |
| D | Studio `landing_leads` (`imobvzcddkhqgvkvjhir`) | Management API SQL | 506 (test kaynakları ayıklandıktan sonra) | B ile aynı form, `notes` içinde düz metin | B'nin kopyası; 27 telefon yalnız burada (B'de yok) |
| E | Studio `quote_requests` + `leads` | Management API SQL | 18 + 9 | Ayrıntılı teklif formu (kumaş, beden, adet) | Ayrı form, Berkan'ın kastı bu değil; yine de alınır |
| F | Günlük Supabase yedekleri | Management API | 14–21 Eyl arası 8 yedek, **15 Eyl yedeği silme öncesi** | Tam DB | PITR kapalı; geri yükleme tüm projeyi ezer, kullanılmaz. A zaten aynı veriyi veriyor |

Telefon kesişimi (1 Ağu+): site (B) 431 tekil ↔ Süreç Takip (C) 331 tekil → **289 ortak**.
Sitede olup eski sistemde olmayan **142** (hiç işlenmemiş ya da işlenip yazılmamış),
eski sistemde olup sitede olmayan **42** (WhatsApp/e-posta kökenli, kapsam dışı).

## 3. Yaklaşım — tek "gerçek liste", üç katman

Kayıpsızlığın referansı **B (leads.jsonl)**: siteden ne geldiyse orada.
A ile CRM'in eski kodları/ilişkileri geri gelir, C ile durumlar giydirilir.

```
B (491 ham talep) ──┐
                    ├─► birleşik liste (telefon + zaman anahtarı) ─► CRM
A (542 silinen)  ───┤        │
C (350 durumlu)  ───┘        └─► durum: C > A > "Yeni"
D/E (Studio)     ── B'de olmayan 27 + quote_requests 18 eklenir
```

Anahtarlar:
- A ↔ B: `client_reference` = `<ts>-<sha1(tel)[0:8]>` (318 kayıtta var, birebir)
- A ↔ C: `legacy_code` (224 kayıtta var, 13 Ağu aktarımından)
- B ↔ C: normalize telefon + ±3 gün (`records.date`); çoklu eşleşmede en yakın tarih
- B ↔ D: telefon + ±2 dk

## 4. Adımlar

### Adım 0 — Kanamayı durdur (kodsuz, 1 saat)
1. Canlı `lead.php`'ye CRM iletimini geri ekle (Studio'ya paralel; `sms/uretim/lead.php`
   tabanına, repodaki `services/site-intake/lead.php` eski). Sıra: önce
   `intake-request` kuru koşu, sonra `lead.php`. `INTAKE_SECRET` doğrulanır.
2. Repo kopyasını canlıyla eşitle (`services/site-intake/lead.php` 161 → 292 satır).
3. Berkan'a sor: **eski sistemdeki WhatsApp kökenli 42 kayıt da gelsin mi?** (Affan'ın
   elle tekrar girmesini önler.) Varsayılan: gelsin, `source='diger'`.

### Adım 1 — Kaynakları dondur ve yerelde topla (yarım gün)
- `scripts/talep-geri-yukleme/` altında `veri/` klasörüne: A (SQL → JSON),
  B (FTP), C (REST, sayfalı; 1000 satır sınırı var), D+E (SQL). Hepsi sha1'li.
- Test/yük kayıtlarını ayıkla: Studio `source in (yuk-testi, hiz-testi, gzip-testi,
  claude-*, kontrol, demo-lp-test, baslik-testi)`; B'de aynı telefonun 3+ tekrarı (10 numara) elle bakılır.

### Adım 2 — Eşleştirme raporu, yazmadan (1 gün)
`node scripts/talep-geri-yukleme/rapor.mjs` → Markdown:
- Her B kaydı için: A'da var mı, C'de var mı, D'de var mı, önerilen durum, önerilen müşteri
- Sayılar: tam eşleşen / yalnız sitede / yalnız eskide / belirsiz (birden çok aday)
- Belirsizler Berkan/Affan'a tek tablo hâlinde gider; **onaysız tahmin yazılmaz**
- Durum sözlüğü C → CRM `request_statuses` (8 → mevcut liste; `Teklif reddedildi` 377
  kaydın ne olacağı: "Kaybedildi" mi "İptal" mi — Berkan seçer)

### Adım 3 — Yazma (idempotent, tek işlem, `--apply`) (1 gün)
Sıra: müşteriler → talepler → talep kalemleri (ürün kodları `operation_catalog_items`)
→ teklifler (A'dan 313) → görüşmeler/notlar (C `note` + `record_history` → `interactions`/`event_log`) → dosyalar (B `image` → R2; A `files` 664 satırın R2 nesneleri duruyor mu kontrol).
- A'dan gelenler **aynı `code`, aynı `client_reference`, aynı `legacy_code`** ile yazılır → eski linkler çalışır.
- `created_at`/`requested_at` kaynak zamanı.
- Tekrar çalıştırınca kopya üretmez: `client_reference` / `legacy_code` / (tel+ts) anahtarları.
- Önce **yerel Supabase'de prova**, sonra canlı. Canlı öncesi manuel yedek alınır.

### Adım 4 — Doğrulama ve kapanış (yarım gün)
- Sayım: B 491 + D-only 27 + E 18 + C-only 42 (onaya bağlı) = hedef; CRM'de `source` ve ay bazında karşılaştır.
- 16 Eyl'den sonra elle girilen 6 talep ile çakışan var mı (telefon).
- Berkan'a rapor: kaç geldi, kaç durumlu, kaç "Yeni", belirsiz liste.
- **Süreç Takip'i salt-okunur yap** (aksi hâlde her hafta fark aktarımı gerekir) — bu Berkan kararı; teknik olarak `records` INSERT'i RLS ile kapatılır.

## 5. Kararlar / riskler

- **16 Eyl silmesi neydi?** `uretim-sifirlama.sql`'e benziyor ama aktör kaydı yok. Kim, niçin
  çalıştırdı bilinmeden aynı şey tekrar olabilir. Berkan'ın "içeri aktarın" isteği bu silmenin
  farkında olmadığını gösteriyor olabilir; açık konuşulmalı.
- A'yı geri yüklerken **id çakışması**: `operations.id` 4500'ler; yeni 6 kayıt hangi id'de? Sequence
  ileride ise sorun yok, değilse eski id'ler korunmaz (kod korunur).
- C'deki `Teklif reddedildi` 377 kaydın hedefi ve `Teslim edildi` 3 kaydın sipariş olup olmadığı.
- Geçici test hesabının şifresi (Süreç Takip + CRM, aynı şifre) sohbete düştü; iş bitince değiştirilmeli.

## 6. Süre

Adım 0 bugün. Adım 1–2 iki gün, Adım 3–4 iki gün. Belirsizler için Berkan/Affan'dan
yarım gün geri dönüş. **Toplam ~1 hafta, ilk sonuç (rapor) 2 gün içinde.**
