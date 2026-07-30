# Faz 3 — Operasyon Zinciri: ekranlar ve kabul kriterleri

Talep → Teklif → Numune → Sipariş zinciri. Her talep bir operasyondur (TAS kodu),
teslimata kadar aynı kodla yürür.

## Kanıt kuralı

Bir kriter yalnızca **arayüzden test edilmişse** "kanıtlı" işaretlenir. Aşağıdaki
`scripts/test-*.mjs` betikleri Playwright ile arayüzü sürer ve sonucu DB'den
doğrular; birim testleri `pnpm test` ile koşar.

## Ekran görüntüleri → `docs/assets/faz-3/`

| Görüntü | İçerik |
|---|---|
| `talepler-liste-dolu.png` | 200+ operasyon, Tür kolonu, aşama çipleri, üst çubukta SLA rozeti |
| `talepler-suresi-dolanlar.png` | "Süresi dolanlar" hazır görünümü |
| `p3-3-revamp/B-sade-form.png` | Sade talep formu (foto, müşteri+yeni, kategori→tür, not, TR tarih) |
| `p3-3-revamp/C-kart-genel.png` | Operasyon kartı (auto-title) |
| `p3-3-revamp/E-mobil-kart.png` | Mobil kart düzeni (yatay kaydırma yok) |
| `p3-3-revamp/A-ayarlar-kategori.png` | Kategori/Tür ayarları (hiyerarşik) |
| `operasyon-ekrani.png` | **Operasyon ekranı** — 9 soru, özet paneli, tıklanabilir aşama, 10 sekme |
| `revizyon-gecmisi.png` | Değişiklik geçmişi (Türkçe: "adet 500 → 750") |
| `siparis-genel.png`, `siparis-termin-riski.png`, `siparis-teslim.png` | Sipariş: kalem, termin riski, teslim |
| `teklif-*.png` | Teklif: kalem, revize, silindi-boşluk |
| `numune-onay.png` | Numune onayı (kim/ne zaman/yöntem) |
| `yumusak-kapi.png` | Numune onayı yokken sipariş uyarısı + gerekçe |
| `durum-gecisleri.png` | Durum geçişleri ayar sayfası |
| `sla-rozet.png` | Üst çubuk SLA rozeti |

## 22 Kabul kriteri — kanıt

| # | Kriter | Kanıt |
|---|---|---|
| 1 | Talep eksik bilgiyle kaydedilebiliyor | `test-form-revamp-ui.mjs` — yalnızca müşteri zorunlu |
| 2 | Potansiyelden talep + müşteriye dönüştürme | Faz 1 dönüşüm + formda "Yeni müşteri" (`test-form-revamp-ui.mjs`) |
| 3 | TAS kodu otomatik/değişmez/aranabilir | `test-operations-ui.mjs` (kod + liste arama), `operations_guard_code` trigger |
| 4 | Operasyona çok ürün kalemi | `test-operations-ui.mjs` (Ürünler sekmesi) |
| 5 | SLA çalışma saatine göre (hafta sonu/tatil atlar) | `workingHours.test.ts` (12 senaryo) + `add_working_hours` SQL; `test-sla-ui.mjs` |
| 6 | Süresi dolan/dolacak talepler işaretli | `talepler-suresi-dolanlar.png`, SLA rozeti, `slaCell` |
| 7 | Teklif talep bilgisini taşıyor | Teklif operasyona bağlı (`QuotesTab`) |
| 8 | Revizyon önceki kalemleri kopyalıyor | `test-quotes-ui.mjs`, `test-e2e-chain-ui.mjs` |
| 9 | Eski versiyonlar korunuyor/görünüyor | `test-quotes-ui.mjs` — silinen "v2 (silindi)" boşluk |
| 10 | Süresi dolan teklif işaretli, durum otomatik değişmiyor | `QuotesTab` `isExpired` — yalnızca gösterim |
| 11 | İç notlar arayüzde ayrışıyor | `OperationTabs` — kilit ikonu/amber; `notes.is_internal` |
| 12 | Numune onayı kim/ne zaman/nasıl | `test-samples-ui.mjs`, `test-e2e-chain-ui.mjs` |
| 13 | Numune onayı yoksa sipariş → gerekçe | `test-gates-ui.mjs` — yumuşak kapı → `gate.overridden` event |
| 14 | Sipariş teklif/numune bilgisini taşıyor | `test-orders-ui.mjs` — kabul teklifinden kalem kopya |
| 15 | Durum geçişleri kurala uyuyor | `status_transitions` tablosu + `durum-gecisleri.png` |
| 16 | İptal/red gerekçesiz kaydedilemiyor | `test-gates-ui.mjs` — sert kapılar (DB doğrulandı) |
| 17 | Operasyon ekranı 9 soruyu tek ekranda | `operasyon-ekrani.png`, `test-operation-screen-ui.mjs` |
| 18 | Değişiklik geçmişi Türkçe/anlaşılır | `revizyon-gecmisi.png` — "adet 500 → 750" |
| 19 | Projeye özel etkileşimler doğru operasyonda | `test-operation-screen-ui.mjs` — `interactions.operation_id` |
| 20 | Müşteri kartı dört sekme gerçek veri | `CustomerOperationTabs` — Talepler/Teklifler/Numuneler/Siparişler |
| 21 | `intake-request` idempotent | `docs/api/talep-ucu.md`; iki çağrı → tek kayıt (doğrulandı) |
| 22 | Telefonda kullanılabiliyor | Mobil kart düzeni, yatay taşma 0px (`test-form-revamp-ui.mjs`) |

## Sert / yumuşak kapılar (P3.7)

- **Sert (engeller):** kalemsiz teklif gönderilemez · müşterisiz operasyon açılamaz
  (`customer_id NOT NULL`) · iptal/red gerekçesiz olamaz. Hepsi DB trigger'ında.
- **Yumuşak (uyarır):** numune onayı olmadan sipariş → gerekçe zorunlu →
  `event_log`'a `gate.overridden`.

## Saat dilimi

Tarih üreten/gün-bazlı gruplayan tüm SQL iş saat dilimini kullanır
(`system.timezone` ayarı + `app_timezone()`). Bkz. `docs/specs/zaman-dilimi-tuzagi.md`.

## Örnek veri

`node scripts/seed-operations.mjs` — ~200 operasyon (600 müşteriye dağılmış, farklı
aşama/durum, SLA dağılımı, teklif versiyonları, numune revizyonları, siparişler).
`--clean` ile temizlenir (`client_reference LIKE 'seed-op-%'`).

## Testler

- **Birim:** `pnpm test` — 99 test (iş saati 12 senaryo dahil).
- **Entegrasyon/E2E (arayüzden):** `scripts/test-*.mjs` — talep, teklif, numune,
  sipariş, kapılar, SLA, operasyon ekranı; ve `test-e2e-chain-ui.mjs` tam zincir
  (talep → teklif → revize → kabul → numune → onay → sipariş → sevk).
- **Idempotency:** `intake-request` aynı referansla iki kez → tek kayıt.
