# Faz 5 — Cari Hesap ve Ödeme: Ekranlar

> Not: Aşağıdaki ekranlar canlı arayüzden (`:5173`) doğrulanacak; görüntüler
> `docs/assets/faz-5/` altına eklenir. DB mantığı `scripts/test-finance-p5.mjs`
> (18/18) ve ekstre PDF (TR+EN, `/render`) ile kanıtlandı.

## Finans ekranı (`/finans`)
Özet kartları: **Açık alacak** (USD/TRY) · **Vadesi geçen** · **Bu ay tahsil** ·
**Ön ödemesi eksik sipariş**. Sekmeler:
- **Ödemeler** — filtre (müşteri/tarih/yöntem/banka/para birimi) + CSV dışa aktar
- **Açık Bakiyeler** — bakiyesi ≠ 0 müşteriler, en borçlu üstte, karta link
- **Vadesi Gelenler** — ön ödeme/bakiye vadeleri, kalan gün (geçen kırmızı)
- **Hareketler** — tüm cari hareketler (denetim), borç/alacak/ters kayıt

![Finans ekranı](assets/faz-5/finans-ozet.png)

## Ödeme ekleme (her yerden)
Müşteri (aranabilir) · tutar + para birimi · **kur otomatik** (ödeme günü TCMB, elle
değişebilir) · TL/USD karşılık önizleme · tarih (geçmişe girilebilir) · yöntem · banka
hesabı · referans no · **Ön ödeme** işareti · not. Finans ekranı, müşteri kartı ve
sipariş kartından açılır.

![Ödeme formu](assets/faz-5/odeme-formu.png)

## Müşteri kartı — Cari sekmesi
Üstte **USD/TRY bakiye** (borçlu kırmızı) · **Ödeme ekle** · **Ekstre indir**.
Hareket listesi: tarih, açıklama, borç, alacak, **yürüyen bakiye**. Filtre: tarih
aralığı, hareket tipi. Hatalı hareket satırında **ters kayıt** düğmesi (gerekçeli).

![Cari sekmesi](assets/faz-5/cari-sekme.png)

## Sipariş kartı — ödeme durumu + ön ödeme kapısı
Ödeme durumu bandı (finans yetkili): tutar / alınan / kalan / ön ödeme yüzdesi;
yetersizse sarı "Ön ödeme eksik". Vade tarihleri (ön ödeme / bakiye) elle girilir.
Durum **uretimde**'ye geçerken ön ödeme yetersizse **gerekçe penceresi** (engel yok,
yöneticiye bildirim).

![Sipariş ödeme durumu](assets/faz-5/siparis-odeme.png)
![Ön ödeme kapısı](assets/faz-5/on-odeme-kapisi.png)

## Ayarlar → Finans
Ön ödeme oranı (%) · **Banka hesapları** (banka/hesap/IBAN/para birimi, aktif) ·
**Ödeme yöntemleri** (havale/nakit/kart/diğer; çek-senet yok).

![Finans ayarları](assets/faz-5/finans-ayarlar.png)

## Cari ekstre belgesi (PDF)
Belge motoruna `cari_ekstre` tipi: şirket + müşteri bilgisi, dönem, hareket tablosu
(borç/alacak/yürüyen), dönem başı/sonu bakiye, USD veya TRY seçimi, **TR ve EN**.
Diğer belgelerle tutarlı tipografi.

![Cari ekstre TR](assets/faz-5/ekstre-tr.png)
![Cari ekstre EN](assets/faz-5/ekstre-en.png)

---

Hesap ayrıntıları: `docs/faz-5-hesaplar.md`. Testler: `scripts/test-finance-p5.mjs`
(bakiye/kur/ters kayıt/fark/ön ödeme/yetki), `tests/unit/money.test.ts` (biçim).
