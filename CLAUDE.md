# Tekstil A.Ş. CRM — Proje Rehberi

> Bu dosya projenin canlı özetidir. **Her paket bitiminde güncellenir** (tamamlanan
> paket + sıradaki adım). Ajan ve geliştiriciler önce burayı okur.

Tekstil üretimi yapan bir firma için özel CRM. Süreç: **Potansiyel → Talep (operasyon,
TAS kodu) → Teklif → Numune → Sipariş → Üretim → Teslimat**. Web sitesinden (tekstilas.com)
gelen talepler otomatik düşer; katalog, belge motoru, finans, görev/hedef ve raporlama içerir.

---

## Teknoloji yığını

- **Önyüz:** React 19 + Vite 8 + TypeScript (strict). Tailwind CSS v4 (`@theme`) +
  shadcn/ui (radix). Yönlendirme react-router; sunucu durumu @tanstack/react-query;
  bildirimler sonner; komut paleti cmdk; ikonlar lucide-react; tarih date-fns.
- **Arka uç:** Supabase — Postgres (+ RLS + SECURITY DEFINER RPC), Edge Functions (Deno),
  Storage (özel bucket'lar), Realtime. Migrasyonlar `supabase/migrations/`.
- **Belge/PDF:** ayrı bir PDF servisi (`VITE_PDF_SERVICE_URL`); yoksa belge üretimi
  kapanır (bkz. `src/lib/env.ts` → `hasPdfService`).
- **Test/araçlar:** Vitest (161 birim testi), Playwright (arayüz e2e), çok sayıda
  `scripts/e2e-*.mjs` (psql tabanlı DB regresyonu), ESLint + Prettier + TypeScript.
- **Dağıtım:** önyüz statik SPA (Netlify — `docs/devir/netlify-test-dagitimi.md`);
  edge fn + secret kullanıcı tarafında deploy edilir.

## Tasarım dili

- **ikas paleti — vurgu MOR `#6e55ff`** (`--accent-primary`), hover `#5b43f0`, pale `#efedff`.
  Rozetler ikas pastelleri; metin `#131318`. Odak halkası mor. Kaynak: `src/index.css`.
- **Yazı tipi:** Inter (variable). **Arayüz dili: Türkçe** (tüm etiketler, tarihler `tr-TR`).
- Kontrast WCAG AA; sayısal değerler asla soluk; durum rozetleri renk **+ ikon** birlikte.
- ⚠️ **Not (çelişki):** Proje sahibi tasarım dilini bir ara "lacivert `#1F2A5C` / turuncu
  `#F5991F`" olarak tarif etti, ancak **uygulanan tasarım ikas morudur** (commit
  `4a902ef "ikas tasarımına geçiş"` — bilinçli geçiş). Canonical olan: **ikas moru**.
  Lacivert/turuncuya dönüş istenirse ayrı bir yeniden-stil işidir.

## Faz planı ve durum

| Faz | Kapsam | Durum |
|---|---|---|
| **P0** | İskele, DB temeli, auth/çalışan, rol/yetki, ayarlar, dosya, kod üreteci, tasarım sistemi, paylaşılan bileşenler | ✅ |
| **P1** | CRM temel: referanslar, iletişim noktaları/telefon, potansiyeller, müşteriler, etkileşim, not/etiket/dosya, zaman çizelgesi, dönüşüm, arama/mükerrer, içe aktarma | ✅ |
| **P3** | Operasyonlar: talep/teklif/numune/sipariş, durum makinesi + kapılar, SLA, operasyon ekranı, intake edge fn | ✅ |
| **P4A** | Belge motoru (5 belge tipi, TR/EN, iç-not sızıntı koruması) | ✅ |
| **P4B** | Katalog (ürün/görsel/koleksiyon), maliyet reçetesi, döviz kuru, marj kademeleri, maliyet belgesi, tek-tuş teklif | ✅ |
| **P5** | Finans: cari hesap, ödemeler, ön ödeme kapısı, vade takibi, ekstre, yetkilendirme | ✅ |
| **P6** | Görev/hedef + YZ (ai-assist tek kapı + izin-listesi + maliyet kontrolü) | ✅ |
| **P7** | Raporlar + Gösterge Paneli: `metrics.*` tek kaynak, çalışan+yönetici panel, 6 rapor + Excel/PDF, YZ yorum, yetki matrisi | ✅ |
| **Intake** | tekstilas.com talep entegrasyonu (intake_process RPC + edge fn + taslak teklif + birleştirme + eşleşmeyen kod çözümü) | 🟡 sunucu+UI bitti; **deploy sende** |
| **Düzeltme turu 2** | 6 (durum cascade) ✅, 5 (belgeden sipariş) ✅, 4 (yaklaşan süreler) ✅ | 🟡 1/2/3/7/8 kaldı |

## Sıradaki adım / bekleyenler

1. **Intake deploy (sende):** `INTAKE_SECRET`'i Supabase Secrets + `lead.php`'ye gir
   (`.secrets/intake-secret.txt`), `supabase functions deploy intake-request`, `lead.php`
   eklentisini yapıştır (`docs/api/lead-php-eklenti.md`).
2. **Tam üretim temizliği:** onay bekliyor (kullanıcı/veri silme planı hazır, parkta).
3. **Düzeltme turu 2 — kalan:** #1 LocationSelect (il+ilçe), #2 PhoneInput (ülke kodu),
   #3 ikon sistemi, #7 bildirim test ortamı (7-d cron kararı sorulacak), #8 kullanım kolaylığı.
4. **ai-assist redeploy:** `rapor_yorumu` prompt'u için (P7.11).

## Bilinen teknik notlar (kritik)

- ⚠️ **Git geçmişi P1.2'de donmuş** — P1.3'ten bugüne (~100 paket) commit edilmemiş
  (27 değişmiş + 250 izlenmeyen dosya). Migrasyonlar DB'ye uygulandı ama kod versiyonlanmadı.
- ⚠️ **Migration defter kayması:** 106 dosya diskte; CLI ledger'da 56. Son migrasyonlar
  `psql -f` ile uygulandı (DB'de var, ledger'da yok). `supabase db push` dikkatli kullanılmalı.
- **Gizli anahtarlar sohbete yazılmaz** → `.secrets/` (gitignore) veya terminal.
- Yeni RPC/kolon `database.types.ts`'te yoksa `as never` / `as unknown as` ile cast et.
- React purity: render'da `Date.now()`/`new Date()` yasak → `useState(() => Date.now())`.
- Para kur-donmuş: `account_transactions.amount_usd/try`. Zaman gruplama `app_timezone()`
  = Europe/Istanbul.

## Test komutları

```
npm run build           # tsc + vite build
npx vitest run          # 161 birim testi
node scripts/e2e-*.mjs  # DB regresyonları (durum-cascade, senaryolar, p7-raporlar, madde5, test-intake …)
```
