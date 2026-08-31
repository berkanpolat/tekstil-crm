# Değişiklik Günlüğü

Bu projenin tüm önemli değişiklikleri bu dosyada tutulur.
Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) esaslıdır ve
sürümleme [Semantic Versioning](https://semver.org/lang/tr/) izler.

> **Kural:** Her paket sonunda bu dosyaya bir girdi eklenir, `package.json`
> sürümü artırılır ve `git tag` atılır (bkz. CLAUDE.md → "Sürüm & değişiklik günlüğü").
>
> **Not (defter kayması):** Migration dosyalarının tarih önekleri, commit
> tarihlerinden ileridir (CLAUDE.md'de belgelenen bilinen durum). Aşağıdaki
> tarihler **commit** tarihleridir; migration adları uygulanan dosyalardır.

---

## [1.24.0] — 2026-08-31

### M1.2 — Katalog özellik aktarımı: slug + kumaş sözlüğü canlıya işlendi
672 ürünün tamamı siteyle eşleştirildi ve kumaş sınıflandırması tamamlandı.
**Ürün taşınmadı** — hepsi zaten yeniCrm'deydi (bkz. 1.23.1); bu paket alanları doldurdu.

- **`slug` — 672/672 dolu, 672 benzersiz, 0 boş.** Katalog 2 **kod** ile (197/197),
  katalog 4 **ad** ile (475/475) eşleştirildi. Doğrulandı: **CRM slug kümesi ile sitenin
  slug kümesi birebir aynı** (672 ortak, 0 sapma). Site ↔ CRM bağı kuruldu.
- **Kumaş sözlüğü 196 kayıt** — Studio'dan 169 + `composition`'dan türetilen 27 konfeksiyon
  kumaşı. Katalog 4'ün **475 ürününün tamamı** kumaş tipine bağlandı (bağsız 0):
  Pamuk Keten 128 · Medine İpeği 52 · Modal 40 · Compact Penye 31 · İki İplik 29 …
- **Fit ataması 40 ürün** (Studio'da dolu olan tek öznitelik).
- Üretici: `scripts/m1-2-katalog-ozellik-aktar.py` (idempotent; eşleşme eksikse durur).

### Düzeltme — M1.1'de bırakılan şema kusuru
`20260831010000_m1_2a_fabric_key_grup_bazli.sql`: `fabric_types.key` M1.1'de **küresel**
benzersiz tanımlanmıştı. Yanlış — aynı kumaş adı birden çok gruba meşru biçimde ait
oluyor (`Polyester` 4 grupta, `Kanvas`/`Keten` 3'er grupta; toplam 21 ad çakışıyor).
Bu kısıt 169 kumaş tipinden 27'sinin girmesini engelliyordu. Kaynak sistemdeki
`UNIQUE(group_id, name)` kuralına dönüldü. Tablo boş olduğu için veri kaybı olmadı.

### Uygulama ve doğrulama
- Önce **canlıda `rollback`'li kuru koşu** yapıldı; sayımlar doğrulandıktan sonra
  `commit`'li gerçek uygulama. İkisi de tek transaction.
- **Veri bütünlüğü:** ürün 672 (değişmedi), müşteri 432→433 (oturum sırasında sisteme
  düşen gerçek kayıt — müşteri tablosuna dokunulmadı).
- Migration'lar `schema_migrations` defterine işlendi.

### Sınıflandırma notu
Konfeksiyon kumaşları Dokuma/Örme/Denim gruplarına elle sınıflandırıldı. Eşleştirme
**yalnız bu üç grupta** yapılıyor — konfeksiyon ürünü döşemelik kumaşa bağlanmasın diye.
`Süet` ve `Dantel` kaynak sözlükte yalnız döşemelik/perdelik gruplarındaydı, konfeksiyon
karşılıkları eklendi. **Üç ad belirsiz** (`Oysho`, `Sandy`, `Gübür`) — panelden düzeltilebilir.

### Bulgu
- **Studio'nun ürün öznitelikleri neredeyse boş:** 197 üründe gramaj 0, kumaş tipi 1,
  baskı 0, fit 40. Zengin olan yalnızca sözlükler. 18 Ağu matrisindeki "katalog master
  Studio'da" varsayımı ürün verisi için geçersiz.
- **Gramaj hiçbir kaynakta yok.** Katalog 4'ün `composition` alanı yalnız kumaş adı
  taşıyor (`Pamuk Keten`, `Compact Penye (%100 Pamuk)`) — gr/m² bilgisi yok. Gramaj
  kolonu boş kalıyor, elle girilecek.

## [1.23.1] — 2026-08-31

### M1.1 migration'ı canlıya uygulandı + katalog envanteri
`20260831000000_m1_1_katalog_ozellikleri.sql` Supabase Management API üzerinden
**tek transaction** içinde canlıya (`kkxvoxeqfsaqzklrtgrw`) uygulandı. Migration ayrıca
`supabase_migrations.schema_migrations` **defterine işlendi**.

- **Uygulama öncesi:** ön koşullar denetlendi (hedef tablo/kolon yok, yardımcı fonksiyonlar
  yerinde), durum kaydedildi, günlük fiziksel yedek doğrulandı (31 Ağu 04:37, COMPLETED).
- **Doğrulama:** 4 tablo (tohum 9/0/6/5) · 8 kolon (`has_print` NOT NULL, kalanı nullable) ·
  RLS açık, tablo başına 2 politika · `anon`'a hiç yetki yok · `catalog_slugify` canlıda
  sitenin slug'ını birebir üretti.
- **Veri bütünlüğü:** 672 ürün / 672 aktif / 2 katalog / 432 müşteri — uygulama öncesiyle
  **birebir aynı**, hiçbir mevcut kayda dokunulmadı.

### Katalog envanteri — M1.2'nin kapsamını küçültüyor
Canlı veri incelendi: **672 ürünün tamamı zaten yeniCrm'de.** M1.2 ürün taşımayacak,
yalnızca alan doldurup kod eşleştirecek.

| | CRM | Site (`products.json`) |
|---|---|---|
| Katalog 2 | 197 ürün, `ST-26SS…` kodlu | `cat` boş olan 197 |
| Katalog 4 | 475 ürün, `YS-…` kodlu | `cat` dolu olan 475, `ST-26SS3…` kodlu |

- **Eşleştirme kanıtlandı:** katalog 2 → kod ile **197/197**; katalog 4 → ad ile **475/475**.
- `source_code` sitenin `ST` kodlarını taşımıyor (CSV kodları: `004_takimi-kirmizi`),
  bu yüzden katalog 4 köprüsü **ad** üzerinden kurulacak.
- Katalog 2'de `composition` ve `source_code` tamamen boş (197/197) — kumaş bilgisi
  yalnız katalog 4'te var.

### Not
- **Migration defteri kayması ölçüldü:** diskte 124 dosya, defterde 56 (+bu paket).
  Temmuz sonundan beri uygulananlar deftere yazılmamış. `supabase db push` hâlâ
  dikkatli kullanılmalı; ayrı bir temizlik paketi gerekiyor.
- **5 Supabase projesi var, 3 değil:** CRM, Studio, lead'e ek olarak `tekstilascom`
  (`qtyqnozxvaheftlylybi`) ve `kzcehftnppgljaqxmoad` (ayrı organizasyon).

## [1.23.0] — 2026-08-31

### M1.1 — Katalog özellik şeması (birleştirme programı: ürün master)
Studio'daki (uretimCrm) ürün sözlüklerini ve yapısal alanları yeniCrm'e taşıyabilmek için
**şema** hazırlandı. Bu paket veri taşımaz — 672 ürünün alan doldurması M1.2'dedir.

- **Migration `20260831000000_m1_1_katalog_ozellikleri.sql`** — önce yerel PostgreSQL 17'de
  sınandı, ardından **canlıya uygulandı** (bkz. 1.23.1).
- **4 sözlük tablosu:** `fabric_groups` (9, tohumlandı), `fabric_types` (grubuna bağlı,
  169 kayıt M1.2'de gelecek), `fit_types` (6, tohumlandı), `print_types` (5, tohumlandı).
  Studio'nun şeması **kopyalanmadı**, yeniCrm ev kalıbına uyarlandı: uuid yerine
  `bigint identity`, `name` yerine `key`/`label`, `has_role()` yerine
  `is_active_user()` (okuma) / `is_admin_or_owner()` (yazma), `is_system` bayrağı.
- **`catalog_products` + 8 kolon** (hepsi nullable, mevcut ürünler etkilenmez):
  `slug`, `fabric_group_id`, `fabric_type_id`, `fit_type_id`, `print_type_id`,
  `gramaj` (>0 kısıtı), `has_print`, `print_details`.
- **`catalog_slugify(text)`** — site uyumlu slug üreteci (Türkçe→ASCII).
  `slug` kısmi benzersiz indeks (`deleted_at is null`): arşivlenen ürünün slug'ı
  yeniden kullanılabilir, canlı ürünlerde çakışma engellenir.

### Doğrulama (yerel PostgreSQL 17, 10 sınav)
- **`catalog_slugify`, sitenin gerçek 672 slug'ından 664'ünü birebir üretti.**
  Sapan 8 kayıt algoritma hatası değil: 7'si sitenin çakışma için eklediği `-2` soneki,
  1'i adında olmayan kelime taşıyor. **Sonuç: slug addan türetilemez, kaynaktan
  alınmalı** — M1.2 slug'ları site verisinden okuyacak, üreteci yalnız yeni ürün için
  ve doğrulama amaçlı kullanacak.
- Çift slug reddedildi · birden çok NULL slug kabul edildi · arşiv sonrası slug yeniden
  kullanılabildi · `gramaj=0` reddedildi · `has_print` varsayılanı false ·
  kumaş tipi silinince ürün `NULL`'a düştü, kumaş grubu silinemedi (restrict) ·
  tohumlama tekrar çalıştırılabilir · `updated_at` tetikleyicisi çalışıyor.

### Keşif notu (M1.2'yi ilgilendirir)
- **Site iki kataloğu birleştiriyor:** `products.json` 672 üründen **197'sinde `cat`
  alanı boş** (Studio'nun aktif ürün sayısıyla birebir), **475'inde dolu**. Yani dosya
  iki kaynağın elle birleşimi — üreten hiçbir script yok, 10 script onu okuyor.
  "Çift katalog" sorununun somut hali; M1.4 bunu tek kaynağa bağlayacak.

## [1.22.0] — 2026-08-31

### Kendi sunucumuzda yayına alma: crm.tekstilas.com (cPanel + Cloudflare)
CRM ilk kez yayında. Netlify **kullanılmıyor** — dağıtım hedefi baştan cPanel'di
(`docs/devir/uygulama-dagitimi.md`), uygulama kendi sunucumuzda alt alan adında duruyor.

- **Teşhis:** `panel.tekstilas.com` ile Netlify projesi *aynı* içeriği veriyordu; ikisi de
  yanlış uygulamayı (Koli Etiket Oluşturucu) gösteriyordu. Hesaptaki 4 Netlify projesinin
  hiçbirinde CRM yoktu — DNS/SSL sorunu sanılan durum aslında **CRM'in hiç deploy edilmemiş
  olmasıydı**. Netlify'a dokunulmadı.
- **Altyapı:** cPanel alt alan adı `crm.tekstilas.com` → `/home/tekstila/crm`
  (`public_html` DIŞINDA, site dosyalarıyla karışmaz). Cloudflare `A crm → 91.151.95.70`,
  proxy açık — `studio` ve `lead` kayıtlarıyla aynı desen.
- **`public/.htaccess`:** Netlify `_redirects` karşılığı. SPA yönlendirmesi (alt sayfa
  yenilemede 404 yok), hash'li varlıklara `immutable` 1 yıl önbellek, `index.html` +
  `version.json` için `no-store`, `nosniff`/`SAMEORIGIN`/`Referrer-Policy` başlıkları,
  dizin listeleme kapalı. cPanel'in ürettiği PHP günlük bloğu korundu.
- **`scripts/release.sh`:** 6 adımlı sürümlü dağıtım — yayındaki sürümü
  `~/tekstil-crm-yedekler/crm-web/` altına yedekle → build + çıktı doğrulaması →
  `/crm/_versions/vX.Y.Z/` kalıcı arşiv → canlıya `lftp mirror` → **yayın doğrulaması**
  (HTTP 200 + `version.json` eşleşmesi + SPA alt sayfa testi) → `git tag`.
  `KURU=1` ile kuru koşu, `--geri-al vX.Y.Z` ile tek komutta geri alma.
  cPanel'in `.user.ini`/`php.ini` dosyaları `--delete`'ten korunuyor.
- **Doğrulandı:** `/`, `/musteriler`, `/teklifler`, `/raporlar` → HTTP 200;
  `/assets/` dizin listeleme → 403; `index.html` `no-store`, `assets` `immutable`;
  JS paketinde doğru Supabase projesi (`kkxvoxeqfsaqzklrtgrw`) gömülü.

### Bilinen eksik
- **PDF servisi kapalı.** `tekstil-pdf-renderer.fly.dev` DNS'te çözülmüyor (Fly.io
  uygulaması silinmiş/askıda). `VITE_PDF_SERVICE_URL` bilerek **boş** bırakıldı: ölü adres
  yerine `hasPdfService=false` → arayüz özelliği düzgünce kapalı gösterir, istek hatası
  vermez. Kaynak `services/pdf-renderer/` altında duruyor, ayrı pakette geri alınacak.

### Not
- Birim test sayısı **214** (CLAUDE.md'de 161 yazıyordu — düzeltildi).
## [1.21.0] — 2026-08-28

### Belge motoru: otomatik sayfalama (çok sayfalı PDF) — kırpma sorunu giderildi
Fiyat teklifi ve diğer `.qsheet` tabanlı belgeler sabit yükseklikli tek sayfa +
`overflow:hidden` kullanıyordu; 12+ üretim seçeneği olan teklifte tablo taşıyor,
taşan satırlar **kırpılıp kayboluyordu** (eski `tkFit` içeriği %40'a kadar küçültüp
yine kırpıyordu). `bulkDoc` parçalama mantığı, satırların iki satırlık olabildiği
gerçeğine uyarlanarak **yükseklik ölçümlü otomatik sayfalayıcıya** (`qxPages`)
dönüştürüldü:

- Gizli ölçüm DOM'unda her parçanın (antet, tablo başlığı, her satır, alt bloklar,
  footer) gerçek yüksekliği okunur; parçalar sabit `.qsheet` sayfalarına sığdırılır.
- **İlk sayfa tam antet** (logo + künye + meta), **devam sayfalarında kısa antet**
  (belge no + müşteri + "devam"); tablo başlığı her sayfada tekrarlanır.
- Her sayfada **"Sayfa X / Y"** rozeti.
- `tkFit` yerine hafif `qxFitSheet` (taban **0.9**, kırpma yok) — yalnız birkaç
  piksel taşmaya karşı emniyet.
- Aynı motor **sipariş onay (`soDoc`)**, **maliyet hesabı (`mlDoc`)** ve **ürün
  özeti (`ozDoc`)** belgelerine de uygulandı (hepsi aynı kırpma riskini taşıyordu).
- **Sunucu (`render.mjs`) kritik düzeltmesi:** print-media'da `body>*{display:none}`
  ölçüm düğümünü gizleyip tüm yükseklikleri 0 yapıyor, sayfa yeniden kullanılınca
  içerik tek sayfaya biniyordu → ölçüm düğümü `display:block !important` ile
  güvenceye alındı; ayrıca tüm HTML değişikliklerinden sonra hafif fit geçişi eklendi.

Playwright + `pdfinfo`/`pdftotext` ile doğrulandı: 3 seçenek → 1 sayfa, 15 → 3 sayfa
(15 satırın tümü görünür), 30 → 4 sayfa; `soDoc` uzun alanlarla → 2 sayfa; taşma yok.
**Migration yok.** ⚠️ PDF servisi (studio.html + render.mjs) yeniden dağıtılmalı.

---

## [1.20.0] — 2026-08-18

### Eşleşmeyen web lead'lerinin sisteme alınması (34 potansiyel + 34 talep)
`data/leads.csv` içindeki, hiçbir mevcut müşteri/potansiyele eşleşmeyen gerçek web
formu gönderimleri canlı DB'ye aktarıldı. **Migration yok** — tek seferlik veri
aktarımı (idempotent script, tek transaction, yazma öncesi tam `pg_dump` yedeği).

- **Canlı yeniden doğrulama:** offline 13 Ağu snapshot yerine canlı
  `customers`+`leads`+`contact_points` ile eşleştirildi. Aradan müşteri eklendiği
  için eşleşmeyen 69→50 düştü; test/çöp elenince **34 gerçek kişi** kaldı.
- **Model (mevcut 44 landing kaydıyla birebir):** her kişi **potansiyel (lead)** →
  `convert_lead_to_customer` ile **müşteriye** dönüştürüldü → her gönderim **talep
  (operation)**. Kanal `web_sitesi` (id=2), `landing_source='deneme-landing'`,
  `stage/request_status=9` (Teklif Bekliyor). Sonuç: **+34 lead, +34 müşteri
  (264→298), +34 talep (268→302)**, +68 iletişim noktası.
- **Notlar** operasyonun `description` alanına birebir yazıldı. **created_at /
  requested_at** kaynak form zaman damgasından (Temmuz–Ağustos).
- **Katalog:** 6 talepteki **32 ST-26SS kodu** ürüne bağlandı
  (`operation_catalog_items.catalog_product_id` dolu; mevcut 44 kayıtta boştu).
- **Görseller:** dosyalar elde olmadığı için yalnız **dosya adı** kaydedildi
  (`files` bucket `intake-pending`, yer tutucu yol) — sonra bağlanacak (28 kayıt).
- **Sınıflandırıcı düzeltmesi:** test/çöp filtresine `Not`/`Ürünler` alanı junk
  kontrolü eklendi → çalışan test gönderimi (affan ergül 3 satır) elendi.
- **İdempotency:** `leads.external_id`=telefon(son10) + `operations.client_reference`
  = `denemelanding:<tel>:<zaman>`. Tekrar çalıştırma kopya oluşturmaz (kanıtlandı:
  reuse 34 / skip 34 / +0). Mevcut 264 müşteri / 268 talebe dokunulmadı.
- **Yeni scriptler:** `scripts/leads-eslesmeyenler-canli-kuru-kosu.mjs` (canlı
  doğrulama), `scripts/paket-leads-payload.mjs` (payload üretici),
  `scripts/paket-leads-aktar.sql` (idempotent yazma, `-v do_commit` ile kuru/gerçek).

## [1.19.0] — 2026-08-18

### Gösterge paneli tasarım iyileştirmesi (aciliyet sıralı panel)
Panel "durum raporu"ndan "bugün neye müdahale etmeliyim" ekranına dönüştürüldü.
Yeni dikey öncelik: **aksiyon şeridi → metrik nabzı → günlük listeler → katlanır takip.**

- **Aksiyon şeridi (yeni, en üstte):** gecikmiş HER şey kaynağından bağımsız tek
  kırmızı şeritte toplanır — SLA'sı geçen teklif bekleyen talep + termini geçen
  sipariş + süresi dolan görev. **Tip ağırlığı** ile sıralanır (sipariş > numune >
  teklif > görev; aynı ağırlıkta en çok geciken üstte). **En fazla 5 satır**,
  altında "ve N tane daha →" ile açılır/kapanır. Toplam 20'yi aşınca dürüst başlık:
  "45 iş gecikti — en acil 5'i:". Hiç gecikme yoksa yeşil "her şey yolunda" kartı.
- **Metrik nabzı:** eski 3 akış kartı + 2 anlık durum kartı, tek kompakt Kpi sırasına
  birleşti (5 sütun). Akış metriklerinde değişim oku (↑/↓ %) eklendi. Kartlar
  tıklanır (ilgili sayfaya gider).
- **2×2 ızgara yeniden düzenlendi:** "Teklif bekliyor" + "Hatırlatıcılar" günlük
  aksiyon listeleri olarak üstte yan yana kaldı. "Numuneler", "Siparişler",
  "Teklif iletildi" **katlanır "Takip listeleri"** bölümüne indi — Numuneler ve
  Siparişler varsayılan **açık**, Teklif iletildi **kapalı** gelir.
- **ReportKit tutarlılığı:** panel artık raporlarla aynı `Kpi` bileşenini kullanır
  (`onClick` ile tıklanabilir hale getirildi). `MiniCharts.tsx` kaldırıldı:
  `TrendLine` + `BarList` (raporlarda kullanılıyordu) **ReportKit'e taşındı**,
  kullanılmayan `MiniCharts.Funnel` silindi. Panel ile raporlar tek grafik dilinde.
- **Renk disiplini:** kırmızı yalnız gecikmiş/kritik işler için (aksiyon şeridi).
- Migration yok (yalnız önyüz). `npm run build` ✓, 214 birim testi ✓.

## [1.18.0] — 2026-08-18

### Güvenlik (parola politikası sertleştirme — min 12 + harf/rakam)
- **`supabase/config.toml`:** `minimum_password_length` 6 → **12**,
  `password_requirements` "" → **`letters_digits`** (en az harf + rakam).
  ⚠️ **Canlıya YANSITILMADI** (`supabase config push` yapılmadı — proje sahibi
  Dashboard'dan uygulayacak: Authentication → Sign In / Providers → Password).
  Config yalnız yeni parolalara etki eder; mevcut parolalar geriye dönük denetlenmez.
- **`src/lib/password.ts` (yeni):** sunucu politikasıyla HİZALI istemci kontrolü —
  `MIN_PASSWORD_LENGTH=12`, `passwordError(pw)` (min 12 + harf+rakam → TR hata/null),
  `PASSWORD_HINT`. Tek kaynak; sunucu-istemci uyuşmazlığı (istemci "tamam" der,
  sunucu reddeder) önlenir.
- **5 önyüz noktası 8 → 12 + harf/rakam:** `ChangePasswordPage`, `ProfilePage` (şifre
  değiştir), `StaffFormDialog` (geçici şifre create), `StaffListPage` (şifre sıfırla) —
  hepsi `passwordError`/`PASSWORD_HINT` kullanır; sabit "en az 8" metinleri kalmadı.
- **Doğrulama:** `npm run build` (tsc strict + vite) temiz, 214 birim testi geçer.

## [1.17.0] — 2026-08-18

### Güvenlik (ui.test hesabı — sabit şifre kaldırıldı + garantili teardown)
- **Sorun:** ~20 UI test scripti, sabit `TestPass1!` şifreli bir **admin** hesabını
  (ui.test) canlı DB'ye kuruyor, çoğu silmiyordu → üretimde bilinen admin arka kapısı.
- **`scripts/lib/ui-test-user.mjs` (yeni, paylaşılan helper):**
  - Şifre **her koşuda rastgele** (`randomBytes` → base64url, tırnaksız/SQL-güvenli).
    Kaynakta artık sabit şifre yok.
  - Import edilince **idempotent kurar** (`ensureUiTestUser`): önce temizler, sonra
    `auth.users` + `auth.identities` + `public.users` (admin rolü, `must_change_password=false`).
  - **Teardown process ÇIKIŞINDA garanti:** `process.on('exit'|'SIGINT'|'SIGTERM'|`
    `'uncaughtException'|'unhandledRejection')` → senkron psql silme. Script çökse,
    Ctrl-C ile kesilse, exception atsa bile hesap silinir.
  - Bağlantı kendine yeter: scriptin PG* env'i varsa onu, yoksa `.env` pooler'ını kullanır.
  - FK notu: `created_by/owner_id … on delete set null` → silme FK bloklamaz; sıra
    `public.users` → `auth.users` (users.id → auth.users `on delete restrict`).
- **20 script helper'a geçirildi:** sabit `const TEST = {…TestPass1!…}` → `import { UI_TEST as TEST }`.
  "Var olduğunu varsayan" ~14 script artık hesabı kendi kurar (import = auto-ensure);
  kuran 6 setup scripti de artık rastgele şifre kullanır + çökme-anında teardown kazanır.
  `import-catalog.mjs` yalnız `--images` yolunda dinamik import ile kurar. `e2e-senaryolar.mjs`
  (senaryo G owner'ı ui.test) yan-etkili import ile kurar/siler.
- **Doğrulama:** 22 dosya `node --check` geçti. Canlı duman-testi (kur→çıkışta sil) ve
  ui.test'in üretimde kalıp kalmadığı **Supabase pooler kesintisi bitince** yapılacak (parkta).
- **Kapsam dışı (takip önerisi):** `ui_security.mjs` / `security_regression.mjs` kendi sabit
  şifreli test kullanıcılarını (`uisec.*`/`sec.*`, `AdminPass1!` vb.) kuruyor — aynı sınıf risk,
  ayrı temizlik. Ayrıca parola politikası sertleştirmesi (min 8→12, letters_digits) **onay bekliyor**.

## [1.16.0] — 2026-08-18

### Eklendi (Yerel otomatik yedekleme + doğrulama)
- **`scripts/yedek-al.sh`** — günlük yerel yedek (yalnız okuma, canlı DB'ye yazmaz):
  - **DB:** `pg_dump -Fc -Z6` → `~/tekstil-crm-yedekler/db/YYYY-MM-DD.dump` (proje DIŞINDA).
    Yanında `YYYY-MM-DD.counts.tsv` (dump anındaki canlı satır sayıları — doğrulamanın
    referansı; sabit sayı gömülmez, veri büyümesine dayanıklı).
  - **Storage (artımlı):** `storage.objects` psql ile listelenir, service-role key ile
    REST üzerinden **yalnız eksik/boyutu değişen** nesneler indirilir (paralel, `xargs -P8`).
    Bucket başına döner (documents/avatars). rclone/S3 anahtarı GEREKMEZ — sadece `.env`.
  - **Rotasyon:** `db/` altında 30 günden eski `*.dump` + `*.counts.tsv` silinir. Storage
    canlı ayna olduğu için budanmaz (silinen uzak dosya yedekte kalır — kurtarma lehine).
  - **Log:** `~/tekstil-crm-yedekler/logs/yedek.log` (tarih, boyut, dosya sayısı, sonuç).
  - **Hata görünürlüğü:** başarısızlıkta macOS bildirimi (`osascript`) + `logs/SON-HATA.txt`
    işaret dosyası (sonraki başarılı koşuda silinir). Sessiz başarısızlık yok.
  - **Dayanıklılık:** `pg_dump` ve psql çağrıları geçici pooler hatalarına (Supavisor
    `tenant not found`) karşı retry (`pg_dump` 5×30sn, psql 5×20sn).
- **`scripts/yedek-dogrula.sh`** — son dump'ı **izole yerel Postgres**'e (Postgres.app,
  `localhost`) geçici DB'ye geri yükler, sayıları `.counts.tsv` ile karşılaştırır
  (customers/operations/catalog_products/storage.objects), yerel storage dosya sayısını
  sayar, raporlar; uyuşmazlıkta çıkış kodu 1. Canlıya dokunmaz; bash 3.2 uyumlu.
- **`scripts/com.tekstilcrm.yedek.plist`** — launchd ajanı (versiyon-kontrollü kopya).
  Kanonik konum `~/Library/LaunchAgents/`'a kurulu ve yüklü. Her gün **09:00**;
  o an Mac kapalı/uykudaysa `StartCalendarInterval` işi bir sonraki açılışta telafi eder.
- **Doğrulandı (2026-08-18):** ilk tam koşu — DB dump 23M + 3226 storage nesnesi (0 hata,
  ~5,5 dk). `yedek-dogrula.sh` izole geri yükleme: 264/268/672/3226 satır **tam eşleşti**.
  Not: yerelde 3807 storage dosyası — 581'i 30 Tem'den kalma eski katalog `.jpg`'leri
  (zararsız, yedeğe dahil).

> **Bağlam:** Supabase **Pro** planı günlük fiziksel yedek alıyor (7 gün saklama) ama
> **PITR kapalı** ve **Storage (3226 görsel) yedeklenmiyor** — bu yerel yedek özellikle
> Storage boşluğunu ve daha uzun/granüler DB geçmişini kapatır.

## [1.15.0] — 2026-08-18

### Eklendi (Raporlar yenileme — Paket C: profesyonel rapor PDF'i)
- **Belge motoruyla aynı görünümde rapor PDF'i.** `window.print()` yerine PDF servisi
  (`template: 'rapor'`) — antet/font/sayfa çerçevesi `studio.html` → `window.reportDoc()`
  içinde; gövde (KPI + açıklayıcı cümle + SVG grafik + tablo) istemcide kurulup
  `data.rapor.bodyHtml` olarak gönderiliyor.
- **Paylaşılan tek kaynak `src/lib/reportChartSvg.ts`** (Strateji A): SVG grafik geometrisi
  (funnel/donut/histogram) saf string üreten fonksiyonlar. **Hem ekran (`ReportKit`,
  `dangerouslySetInnerHTML`) hem PDF aynı fonksiyonları kullanır** → grafikler tanım gereği
  birebir aynı, serviste sıfır grafik kodu, kayma yok. Ekran çıktısı değişmedi (aynı SVG).
- **`src/lib/reportPdf.ts`:** rapor modelini (`ReportPdfModel`: KPI + blok listesi) inline-stilli
  HTML gövdeye çevirir (`buildReportBodyHtml`) ve servise yollar (`fetchReportPdf`).
- **`ReportProps.setPdf` sözleşmesi:** 5 rapor (Talep/Teklif/Dönüşüm/Finans/Ekip) yazdırılabilir
  modelini bildirir; PDF butonu servise gider, **servis kapalı/hatalıysa Excel (CSV) indirmeye düşer**
  (sonner bildirimi).
- **Çok sayfa güvenli:** `reportDoc` sabit yükseklikli `.sheet` (overflow:hidden → kırpma)
  KULLANMAZ; akan kapsayıcı + gömülü `@page{margin:14mm}` (print-root her istekte temizlendiği
  için stil kendini temizler). Yerel doğrulama: 60 satırlık tablo → 3 sayfa, kırpma yok.
- **Testler:** `reportChartSvg.test.ts` (13 test) — SVG geometrisi, kaçış, model serileştirme.
  Tüm suite 214 test geçer.
- **render.mjs:** `rapor` şablon dispatch'i eklendi.
- Yan (önceden bekleyen, ilişkisiz): `studio.html` sipariş formu beden listesi künye özeti
  (5'ten uzunsa "…+N" kısaltma) — izlenmeyen değişikliğin commit'i.

> **Deploy (SENDE):** PDF servisi yeniden dağıtılmalı (studio.html + render.mjs değişti).
> `cd services/pdf-renderer && fly deploy`. Önyüzde `VITE_PDF_SERVICE_URL` zaten tanımlı;
> tanımsız ortamda PDF butonu otomatik CSV'ye düşer.

## [1.14.0] — 2026-08-18

### Eklendi (Raporlar yenileme — Paket B: dönüşüm hunisi RPC + rapor gövdeleri)
- **`metric_pipeline(p_from, p_to, p_scope_user)` RPC** (migration
  `20260818120000_p7b_metric_pipeline.sql`, **canlıya uygulandı**): huninin 6 adımı
  (Talep → Teklif → Numune → Sipariş → Üretim → Teslimat) için her adımda
  **ilerleyen (advanced) · bekleyen (waiting) · düşen (dead, red/iptal)** sayısı.
  Özdeşlik: `reached = advanced + waiting + dead`. `metrics.guard` ile yetki, dönem
  parametresi diğer `metric_*` ile birebir (talep açılış tarihine göre). `metrics.pipeline_step`
  yardımcı kurucu + `public.metric_pipeline` köprüsü + grant/revoke.
- **Doğrulama:** son-3-ay için özdeşlik her adımda tuttu; `talep.reached (251)` =
  `metric_requests.total`; `teklif.reached (199)` = `metric_funnel.quotes`;
  `dead (151)` ≈ `metric_quotes.rejected (155)` (operasyon-hunisi vs teklif-belgesi merceği).
- **Rapor gövdeleri:** 5 raporda (Talep/Teklif/Dönüşüm/Finans/Ekip) gerçek sayılarla
  **açıklayıcı cümleler**. Dönüşüm Hunisi artık `metric_pipeline`'ın **gerçek bekleyen/düşen**
  sayılarını kullanıyor (eski "değer − sonraki adım" yaklaşımı kaldırıldı); her adım notu
  "N ilerledi · M bekliyor · K düştü" verir.
- **Az veri uyarıları (`LowDataNotice`):** numune/sipariş adım başına <~20 kayıtta
  "anlamlı oran için ~20 kayıt gerekiyor" notu.
- **Ölçülemeyenler notu (`variant='none'`):** Talep raporunda "ilçe kırılımı toplanmıyor",
  Dönüşüm Hunisi'nde "teslimat termin uyumu bu huniye dahil değil".

## [1.13.0] — 2026-08-18

### Eklendi (Raporlar yenileme — Paket A: önyüz iskelet, DB'ye dokunulmadı)
- **Yeni saf-SVG grafik/bilgi bileşenleri (`ReportKit`):** PDF şablonunda (studio.html)
  birebir yeniden çizilebilsin diye Tailwind/React'e özel kod gömülmeden, açık hex
  (ikas paleti) ve SVG `<text>` ile yazıldı:
  - `Insight` — büyük rakam + altında açıklayıcı cümle (ör. "199 talebin 103'üne 24 saatte yanıt").
  - `Funnel` — yatay dönüşüm hunisi; her adımda ilerleyen (mor) vs takılıp geçmeyen (amber).
  - `HourHistogram` — 0–23 saat dağılımı (eksik saatler 0 çizilir).
  - `Donut` — merkezde toplam; legend ayrı (`SwatchLegend`, ortak palet/sıra).
  - `LowDataNotice` — az veri (amber) / veri toplanmıyor (nötr) durumları.
- **Dönem seçici yenilendi:** ön tanımlar **Bugün / Son 7 gün / Bu ay / Bu çeyrek**;
  **"Özel"** seçilince tarih **ve saat** aralığı girişi (`datetime-local`). `useMetrics`:
  `last7` + `quarter` PeriodKey + `computeRange` (eski `week`/`last_month`/`last2`
  anahtarları URL uyumluluğu için korundu, ön tanım butonu olarak gösterilmez).
- **Raporlar 6 → 5:** Numune + Sipariş raporları tek **"Dönüşüm Hunisi"** raporunda
  birleştirildi (Talep → Teklif → Numune → Sipariş; şu-an-numunede güncel durumu,
  sığ veri uyarısı). Talep raporuna saat histogramı, Teklif raporuna sonuç halkası eklendi.

> Not: Yeni RPC/migration yok. Adım-adım BEKLEYEN kesinliği (`metric_pipeline`) ve
> PDF servis şablonu Paket B/C'ye bırakıldı; Dönüşüm hunisinde bekleyen şimdilik
> "değer − sonraki adım" ile yaklaşık gösteriliyor.

---

## [1.12.0] — 2026-08-18

### Eklendi
- **Teklif atıfı — çalışan bazlı teklif raporu artık dolacak.** Yeni tekliflerde
  `created_by` ve `sent_at`/`sent_by` bugünden itibaren otomatik toplanır:
  - `quotes_before_insert` trigger'ına `created_by := auth.uid()` eklendi (client
    insert yolları tek tek düzeltilmeden tek noktadan kapandı).
  - Yeni `quotes_mark_sent` trigger'ı (BEFORE INSERT OR UPDATE OF `quote_file_id`):
    teklif dosyası ilk kez atandığında `sent_at=now()`, `sent_by=auth.uid()` yazar
    (idempotent; `sent_at` doluysa dokunmaz).
  - `auth.uid()` null ise (RPC/script/servis rolü) ilgili kolon boş bırakılır, trigger patlamaz.
  - Migration: `20260822000000_quote_attribution.sql` (uygulandı).
- **Rapor ekranı türetme notu.** Ekip ve Teklif raporlarında görünür açıklama:
  geçmiş tekliflerin `created_by`'ı operasyon sahibinden türetildiğini belirtir.

### Değiştirildi
- **Geriye dönük teklif atıfı.** `created_by` NULL olan 202 mevcut teklife
  `operations.owner_id` yazıldı (12 sahipsiz teklif bilinçli boş bırakıldı).
  Türetilmiş veridir → rapor notu ile işaretlendi.
  Migration: `20260822000100_quote_created_by_backfill.sql` (uygulandı).

### Not
- **Kanal (%17 dolu) ve ilçe (~%0 dolu) için düzeltme YAPILMADI (bilinçli).** Kanal
  boşluğu geçmiş aktarımdan kaynaklı (manuel form kanalı zorunlu tutuyor, intake
  otomatik `web_sitesi` atıyor → bugünden dolacak). Uydurma backfill dürüstlüğü bozar.
  İlçe alanı formda mevcut ve opsiyonel; zorunlu yapılmadı.

---

## [1.11.1] — 2026-08-17

### Düzeltildi
- **Müşteri silme/arşivleme RPC'leri hiç commit edemiyordu (kritik).** `customer_archive`,
  `customer_unarchive`, `customer_hard_delete` audit'e `source='rpc'` yazıyordu ama
  `audit_source` enum'unda bu değer yoktu → her çağrı son adımda `invalid input value
  for enum audit_source: rpc` ile **rollback** oluyordu (kalıcı silme sessizce başarısız,
  arşiv operasyonları gizlemiyordu). Düzeltme: enum'a `rpc` değeri eklendi (audit izini
  bozmamak için `source='user'`'a düşürülmedi).
- **Arşivli müşterinin operasyonları yönetici havuzunda görünüyordu.**
  `manager_pending_requests` ve `manager_pending_quotes` `customers` join'ine
  `and c.deleted_at is null` eklendi (left join korundu — müşterisiz operasyonlar geçer).
- **Backfill:** eski toplu "Sil" ile arşivlenmiş 8 müşterinin 16 aktif operasyonu
  gizlendi + `archived_with_customer=true` bayraklandı (idempotent UPDATE). Böylece
  havuzdan düştüler ve ileride "Arşivden çıkar" doğru geri getirir.
- Migration `20260821000001_customer_delete_fixes.sql` (enum ADD VALUE transaction'sız
  `psql -f` ile uygulandı). Arşivle→gizle / arşivden çıkar→geri getir / preview
  akışları owner JWT'siyle BEGIN…ROLLBACK içinde doğrulandı.

## [1.11.0] — 2026-08-17

### Eklendi
- **Müşteri silme — arayüz.** v1.10.0 backend RPC'lerinin UI'si.
  - Müşteri kartında **"Arşivle"** (mevcut yetki) — onay sonrası müşteri + açık
    operasyonları gizlenir, listeye döner.
  - Müşteri kartında **"Kalıcı Sil"** yalnız `customers.delete` yetkisiyle görünür.
    Akış: önizleme (talep/teklif/numune/sipariş/belge/etkileşim/dosya dökümü) →
    cari/ödeme varsa buton kapalı + "arşivleyin" uyarısı → **müşteri adını yazarak**
    onay → `customer_hard_delete` → dönen storage yolları bucket'tan temizlenir → toast.
  - Müşteri listesinde **"Arşiv"** toggle'ı: arşivlenenleri gösterir; seçip
    **"Arşivden çıkar"** ile geri alınır (yalnız birlikte arşivlenen operasyonlar döner).
  - Hook'lar: `useArchiveCustomer`, `useUnarchiveCustomer`, `useCustomerDeletePreview`,
    `useHardDeleteCustomer` (`useCustomers.ts`); `CustomerDangerActions` bileşeni.

## [1.10.0] — 2026-08-17

### Eklendi
- **Müşteri silme — iki aşamalı altyapı (backend).** Yanlış/deneme müşterilerin
  raporları kirletmemesi için canlı öncesi temizlik.
  - **Arşivle (soft-delete, geri alınabilir):** müşteri + o an açık operasyonları
    `deleted_at` ile gizlenir. Birlikte arşivlenenler `operations.archived_with_customer`
    ile işaretlenir; arşivden çıkarınca **yalnız** onlar geri gelir (önceden ayrı
    silinmişler kalır).
  - **Kalıcı sil (`customers.delete` yetkisi = owner+admin):** `SECURITY DEFINER`
    RPC, tek transaction, sıralı silme. Cari hareketi/ödemesi olan müşteri kalıcı
    silinemez (muhasebe izi) — arşivle yetinilir. Storage yolları çağırana döndürülür
    (istemci `storage.remove` ile temizler).
  - **Önizleme RPC:** silmeden önce talep/teklif/numune/sipariş/belge/etkileşim/dosya
    sayıları + `cari_hareket`/`odeme` + `can_hard_delete`.
  - Migration `20260821000000_customer_two_stage_delete.sql`: `operations.archived_with_customer`
    kolonu, `customers.delete` yetkisi (owner+admin), 4 RPC (`customer_delete_preview`,
    `customer_archive`, `customer_unarchive`, `customer_hard_delete`). Canlıya `psql -f`
    ile uygulandı; guard'ın `false` yolu rollback'li denemeyle doğrulandı. UI ayrı pakette.

## [1.9.0] — 2026-08-17

### Eklendi
- **Yeni Sezon katalog maliyet aktarımı (469 ürün).** `data/maliyet.csv` →
  `product_costs` + `product_cost_items`. Eşleştirme `catalog_products.source_code`
  ile (katalog 4). Kur canlı okundu (TCMB 2026-08-17, USD=47.8066) ve `rate_snapshot`'a
  kayıt anı kuru olarak donduruldu; canlı görünüm zaten `sumCost` ile güncel kurdan
  hesaplıyor (v1.6.0).
  - 469 `product_costs` + 1407 `product_cost_items` (ürün başına kumaş USD +
    işçilik TRY + aksesuar TRY).
  - Kumaş kalemi: `fabric_name` = katalog `composition`, `name` = `"Kumaş — <CSV orijinal>"`.
  - **Maliyetsiz kalan 6 ürün** (kasıtlı atlandı): `BB_C_01`, `BB_C_03`, `BB_P_02`
    (boş), `E_P_14` (yalnız kumaş adı), `K_P_07` (işçilik girilmemiş),
    `004_takimi-kirmizi` (CSV'de yok). "Beyaz Yelekli Takım" kod değil ürün adı
    olduğu için eşleşmedi.
  - `scripts/maliyet-aktar.mjs`: idempotent (source_code, hedef 469 ürünle sınırlı),
    tek transaction (hata → tam rollback), 4 katman doğrulama (çapraz kontrol,
    aykırı değer taraması, elle kontrol listesi, marj doğrulaması). `--write`
    olmadan kuru koşu. Migration gerekmedi.

### Değiştirildi
- **Marj kademeleri artırıldı:** 50 adet %25→**%40**, 200 adet %20→**%30**,
  500 adet %10→**%25** (`margin_tiers`). *Ayarlar → Fiyatlandırma* ekranından
  düzenlenebilir; yardım metnindeki eski örnek güncellendi.

## [1.8.2] — 2026-08-17

### Düzeltildi
- **Karışık en/boy oranlı katalog görselleri artık kesilmiyor.** Yeni katalog
  kaynak dosyaları 15 farklı en/boy oranında (çoğunluk 0.746; 363 dosya 0.558 çok
  uzun; bazıları kare). Arayüz eski tekdüze 2:3 kataloğa göre yazıldığından yeni
  görseller kırpılıyordu.
  - Izgara kartı: `aspect-[2/3]` → `aspect-[5/7]`, `object-contain` (kırpma yok;
    boşluk nötr `bg-muted/30` ile dolar). Eski 2:3 görseller de bozulmadan sığar.
  - Liste satırı thumbnail (`size-10`) ve detay galeri thumbnail (`size-14`):
    `object-cover` → `object-contain` (`contain` prop → Supabase transform de
    `resize: contain`).

### Not
- **4 düşük çözünürlüklü kaynak görsel** tespit edildi (gerekirse Drive'dan
  yeniden indirilecek):
  - `P_C_10` → **YS-0171** Çizgili Cepli Pamuk Keten Kapri Pantolon — 1.webp, 2.webp (400×533)
  - `TK_T_011` → **YS-0365** Modal Etek Takım Haki — 2.webp (326×489)
  - `ET_T_14` → **YS-0115** Pamuk Keten Uzun Kot Etek Kahverengi — 2.webp (326×489)

## [1.8.1] — 2026-08-17

### Değişti
- **Yeni katalog ürün kodları sıralıdan rastgeleye.** `YS-0001…YS-0475` sıralı
  formatı, `YS-` + 6 rastgele karakter (`YS-XXXXXX`) formatına taşındı. Alfabe
  `generate_operation_code` ile aynı: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
  (karışıklık yaratan I/O/0/1 hariç). 475 ürünün tamamı taşındı, çakışma 0.
  - **Storage'a dokunulmadı:** `files.storage_path` (`catalog/YS-0001/N.ext`)
    donuk kaldı; yol ile `code` arasında join olmadığından yalnız
    `catalog_products.code` değişti. 2452 görsel bağı korundu (id FK üzerinden).
  - **Eşleme/rollback logu:** kalıcı `catalog_yscode_migration` tablosu
    (`source_code ↔ old_code ↔ new_code`). Geri alma tek UPDATE ile mümkün.
  - Ön-kontrol: hiçbir teklif/belge/operasyon YS kodunu metin olarak
    kopyalamamıştı (0 kayıt) → taşıma yan etkisiz. Mevcut 197 ST- ürünü etkilenmedi.
  - Migration: `20260820000000_catalog_ys_random_code.sql`.

## [1.8.0] — 2026-08-17

### Eklendi
- **Yeni Sezon Katalog aktarımı (475 ürün + 2452 görsel).** `data/yeni-katalog.csv`
  ve `data/yeni-katalog-gorseller/` kaynaklarından, mevcut 197 ürünlük katalog ile
  342 kayıtlık kategori ağacına dokunmadan ayrı bir sezon kataloğu oluşturuldu:
  - Yeni `catalogs` kaydı "Yeni Sezon Katalog" (season `26SS`, year `2026`).
  - Yeni kategori ağacı: kök `ys_root` "Yeni Sezon" + 14 çocuk (Elbise, Tunik,
    Ferace, Pantolon, Etek, Gömlek, Ceket, Tulum, Sweatshirt, T-Shirt,
    Kimono & Panço, Alt Üst Takım, Bluz & Büstiyer, Ev Giyim).
  - 3 koleksiyon (katalog-scoped): Tesettür (175), Premium (156), Casual (144).
  - 475 ürün: kod `YS-0001…YS-0475`, CSV "Kodlar" değeri `source_code`'ta saklandı
    (maliyet eşleştirme + idempotent koruma), kumaş 52 ham yazımdan 36 kanonik
    değere normalize edildi (küratörlü sözlük; Crep+Krep→Krep, Viscon+Viskon→Viscon,
    Tencel+Tensel→Tencel, Cupra+Kupra→Kupra; İ/I 'en' locale ile Denim/Viscon).
  - 2452 görsel Storage'a (`documents/catalog/YS-*`) + `files` + `catalog_product_images`
    olarak yüklendi; `1.webp` → ana görsel, diğerleri diğer.
- `scripts/yeni-katalog-aktar.mjs` — katalog→kategori→koleksiyon→ürün, idempotent
  (`(catalog_id, source_code)` çakışmasında günceller), tek transaction.
- `scripts/yeni-katalog-gorsel-yukle.mjs` — görsel yükleyici; idempotent (yüklenmiş
  dosyayı atlar), her 100 dosyada ilerleme, art arda 5 hata devre kesici.

### Uygulanan migration
- `20260819000000_catalog_source_code.sql` — `catalog_products.source_code text`
  kolonu + kısmi unique index (`catalog_id, source_code` — idempotent içe aktarma).

## [1.7.0] — 2026-08-17

### Eklendi
- **Katalog görsel indirme araçları (kimlik-gerektirmeyen, idempotent).**
  Önceki indirmede Drive oturumu koparak 367 ürün "klasör erişilemedi" hatası
  almış, log yanıltıcı biçimde "BİTTİ: 475" yazmıştı. Yeni araç seti bunu
  onarır ve tekrarlanabilir kılar:
  - `scripts/katalog-eksikleri-bul.mjs` — `data/yeni-katalog.csv` ile diski
    karşılaştırıp eksik ürünleri bulur; klasör kaynağını iki biçimden
    (yardımcı klasör-kimliği kolonu veya `GÖRSEL LİNKİ` içindeki
    `/folders/` ya da `/file/d/` URL'si) çözer.
  - `scripts/katalog-manifest-derle.mjs` — çözülen parent klasörleri
    `scripts/katalog-manifest.json`'a (kod→klasör eşlemesi) derler.
  - `scripts/katalog-gorsel-indir.mjs` — **public** Drive URL'leriyle
    (kimlik/oturum yok) klasör kazır, görselleri indirir, md5 ile mükerrer
    eler, genişlik >1200 ise 1200'e küçültüp lossy `cwebp -q 80` ile
    `.webp`'e çevirir. İdempotent (inmiş ürünü atlar), 3 kez yeniden deneme
    (5-10-20 sn), art arda 5 hatada **devre kesici**, sonda dürüst rapor
    (başarılı/atlandı/hatalı).
  - `scripts/katalog-manifest.json` — 367 eksik ürünün kod→klasör eşlemesi.

### Düzeltildi
- Eksik 367 katalog ürünün görselleri indirildi; katalog **475/475 ürün tam**
  (2.452 webp, boş klasör yok). Canlı DB'ye dokunulmadı; yalnız
  `data/yeni-katalog-gorseller/` yazıldı.

## [1.6.0] — 2026-08-14

### Değişti
- **Katalog maliyeti artık GÜNCEL kurla hesaplanır (iç görünüm).**
  `CatalogProductPage` → Fiyat sekmesi (birim maliyet + fiyat kademeleri) ve
  Maliyet sekmesi toplamı, donmuş `total_cost_usd`/`total_cost_try` yerine
  kalemlerin kendi para birimi + **canlı kur** ile `sumCost` üzerinden yeniden
  hesaplanır. TL kalemler TL saklanır (`product_cost_items.currency='TRY'`),
  toplam bugünün kuruyla değerlenir. "Bugünkü maliyetim ne?" sorusu güncel yanıt verir.
- Ortak `toCostItem` yardımcısı: kayıtlı kalemi (`CostItemRow`) pricing
  çekirdeğinin `CostItem` biçimine çevirir (görüntü + fiyat aynı kaynaktan).

### Korundu (bilinçli)
- **Teklif/maliyet belgesi kuru DONUK.** `CostDocButton` ve belge üretimi
  `cost.total_cost_usd`/`_try`'yi **kayıt anındaki** kurla kullanmaya devam eder;
  müşteriye verilen fiyat sonradan değişmez. Belgede kullanılan kur + tarih
  zaten görünür (`usdRate` / `rateDate`).
- **`total_cost_usd`, `total_cost_try`, `rate_snapshot` şemada kalıyor** —
  audit/geçmiş değeri; silinmedi. Migration **yok**.

### UI
- Katalog maliyet görünümlerine "**Güncel kurla hesaplandı**" notu; Maliyet
  sekmesinde kayıt anı değeri de parantezde gösterilir (kullanıcı iki rakam
  farkında şaşırmasın).

Bu paket kod-only; migration yok.

---

## [1.5.0] — 2026-08-14

### Eklendi
- **Gösterge paneli — satır kısayolları (madde 3).**
  - **Teklif iletildi:** satır sonunda onayla/reddet ikonları. Onaylamada
    "Sıradaki aşama" seçimi (Numune varsayılan · Sipariş · "Şimdilik sadece
    işaretle"); seçime göre hem teklif sonucu hem operasyon aşaması güncellenir
    (aşama geçişi `useAdvanceStage` ile — QuotesTab'ın kanonik kabul yolu).
    Reddetmede **red sebebi zorunlu** (sebepsiz red engellendi).
  - **Numuneler / Siparişler:** satır sonunda durum güncelleme menüsü
    (`useUpdateSample` / `useUpdateOrder`). Mevcut durum işaretli/pasif.
  - İkonlar küçük ve satır sonunda; satır tıklamasını (`stopPropagation`) bozmaz.
- **Paylaşılan `QuoteAcceptDialog` / `QuoteRejectDialog`**
  (`src/components/operations/QuoteResultDialogs.tsx`). QuotesTab ve gösterge
  paneli aynı diyaloğu kullanır — iki kopyanın iki farklı davranışa dönüşmesi
  önlendi. Red diyaloğu artık her iki yerde de sebebi **zorunlu** kılar.

### Değişti
- **Gösterge paneli yerleşimi (madde 2).** Dört ana bölüm (Teklif bekliyor ·
  Teklif iletildi · Numuneler · Siparişler) **2×2 ızgara**da, her biri **sabit
  yükseklikte** (`h-72`) ve **kendi içinde kaydırılır**; başlık + toplam sayı
  sabit kalır. Kullanıcı sayfayı kaydırmadan dördünü birden görür.
  **Hatırlatıcılar** ızgaradan çıkıp altta tam genişlik ayrı bölüme alındı.

Bu paket kod-only; migration yok.

---

## [1.4.0] — 2026-08-14

### Eklendi
- **Gösterge paneli — Anlık durum kartları.** "Numunede" ve "Siparişte"
  kartları artık dönemden **bağımsız**, operasyonun **güncel aşamasına**
  (`operations.stage_id` → `operation_stages.key`) bakar. Kartlar dönem
  seçicisinden görsel olarak ayrık, "Anlık durum" başlığı altında; dönem
  değiştiğinde değişmezler.
  - Numunede = `stage 'numune'`; Siparişte = `stage 'siparis' + 'uretim'`
    (üretimdeki iş de "siparişte" sayılır). Terminal aşamalar ve silinenler hariç.
  - Yeni RPC: `metric_active_funnel()` (tarih parametresiz) + public köprü.

### Düzeltildi
- **"Numunede" kartı 0 gösteriyordu.** Kart eskiden `metric_funnel`'den
  besleniyordu; o RPC operasyonu **açılış tarihine** (`requested_at/created_at ∈
  dönem`) göre kesip "aşamaya ulaşmış operasyon" (kümülatif huni) sayıyordu.
  Operasyonlar dönemden önce açıldıysa şu an numunede olsalar bile 0 çıkıyordu.
  Artık anlık durum sorgusundan (`metric_active_funnel`) beslenir.

### Değişti
- **Akış kartları** ("Gelen talep", "Verilen teklif", "Girilen aksiyon")
  döneme bağlı kalmaya devam eder; her kartın altında aktif dönem etiketi
  ("bugün", "son 2 gün" vb.) gösterilir. Akış vs durum karışıklığı böylece
  görsel olarak ayrışır.

### Migration (ELLE uygulanacak — sende)
- `20260818000000_p7_active_funnel.sql`: `metric_active_funnel()` RPC + public
  köprü + grant. Uygulanana kadar "Numunede/Siparişte" kartları veri çekemez
  (RPC yok → 0/boş). Diğer kartlar etkilenmez.

---

## [1.3.3] — 2026-08-14

### Düzeltildi
- **Sipariş Formu — Bedenler alanına noktalı virgül yazılamıyordu.** Alan
  değeri `bedenler.join('; ')` ile filtrelenmiş diziden türetiliyordu; kullanıcı
  ayraç (`;`) yazınca boş son eleman `filter(Boolean)` ile atılıyor, ayraç bir
  sonraki render'da siliniyordu (bir sonraki bedeni asla ekleyemiyordunuz). Alan
  artık **ham metin** olarak tutuluyor (`sip.bedenlerText`); diziye **yalnız
  çıkışta** (matris kolonları + `normalizeForRender` dışa aktarımı) çevriliyor.
  Eski (dizi biçimli) kaydedilmiş belgelerle geriye uyumlu.
- **Payload tutarsızlığı:** `useDocuments` alan-eşleme çıktısı bedenleri
  `', '` ile birleştiriyordu; ondalık beden (`40,5`) virgül belirsizliği
  yaratıyordu. Artık `'; '` ile birleştiriliyor.

### Değişti
- **Bedenler etiketi seçili beden sistemine göre değişiyor:** Alfa'da
  "XS; S; M", Numara'da "40; 40,5; 41", Özel'de "S; M; L" örneği gösterilir.

### Not (ayrı iş — kod değişmedi)
- PDF şablonu (`services/pdf-renderer/templates/studio.html:2408`) "Beden
  Sistemi" **künye özet satırında** bedenleri `sistem (ilk–son)` uç-nokta
  aralığı olarak basıyor (önizlemedeki "Alfa (30–30)" bundan). **Renk×Beden
  dağıtım tablosu ve barkodlar TAM listeyi** gösterir — ara bedenler
  kaybolmaz; yalnız künye özeti uç noktaları gösterir. Uç noktalar dizi
  sırasına göredir (sayısal min–max değil). Künye özetini tam listeye çevirmek
  isterse ayrı bir şablon işidir.

## [1.3.2] — 2026-08-14

### Düzeltildi
- **Belge formlarında "Ürün Grubu" (ve türevleri) seçilemiyordu** — tıklanıyor ama
  değer forma yazılmıyordu. Kök neden: `CategorySelect` tek olayda **iki** state
  güncellemesi yapıyor (grup seç + tür sıfırla), ama form `up`'ları snapshot
  tabanlıydı (`set({ ...data, soS: { ...s, ...patch } })`; `data`/`s` render'dan
  sabit). İkinci güncelleme aynı eski snapshot'tan türeyip ilkini **eziyordu** →
  grup seçimi kayboluyordu. (Katalog formu aynı deseni fonksiyonel `setF((s)=>…)`
  ile kullandığından etkilenmiyordu — fark buydu.)
- **Kalıp çözüm:** yeni saf yardımcı `patchSection` (`src/lib/formPatch.ts`) +
  belge formlarındaki tüm snapshot-tabanlı güncellemeler **fonksiyonel setState**'e
  çevrildi (ardışık çağrılar artık birikir, ezmez). Değişen yerler (`editorForms.tsx`):
  `up` × 3 (fiyat_teklifi/soS·siparis_onay/sip·siparis_formu), `recompute`
  (sipariş onay fiyat/tutar), `upO` (koli sipariş), `setList` × 2 (numune/koli),
  döviz kuru efekti, iç-not alanı. Form bileşenlerinin `set` prop tipi
  `Dispatch<SetStateAction<Data>>`'e genişletildi.
- **Regresyon testi:** `src/lib/formPatch.test.ts` — art arda iki güncellemede
  ilkinin korunduğunu doğrular + eski snapshot deseninin kaybettiğini karşıt
  kanıtla gösterir (4 test).

### Notlar
- Migration yok. `npm run build` + **197 birim testi** yeşil (yeni 4 test dahil).

## [1.3.1] — 2026-08-14

### Düzeltildi
- **Referans dropdown'ları boş gelme sınıf hatası** (ör. Sipariş Onay belgesinde
  "Ürün Grubu" seçilemiyor): oturum tam kurulmadan çalışan bir referans sorgusu,
  **paylaşılan statik query key**'e 0-satır sonucu yazıyordu; `staleTime` (30sn)
  penceresi boyunca aynı key'i kullanan tüm tüketiciler o boş listeyi alıyor, yeni
  istek gitmiyordu (RLS/veri/token değil — react-query bellek-içi önbelleği).
  Teşhis: soğuk açılışta `getSession()` süresi dolmuş token döndürebiliyor; token
  yenilenmeden giden ilk istek PostgREST'te anon sayılıp RLS `is_active_user()`
  false → 0 satır.
- **Kalıp çözüm** — yeni `useReferenceQuery` sarmalayıcısı (`src/hooks/useReferenceQuery.ts`,
  `useSessionReady` ile): oturum hazır **ve** `useCurrentUser` (getUser ile token'ı
  doğrular) çözülüp kullanıcı gelene kadar sorguyu göndermez (`enabled=false`).
  Böylece oturum öncesi boş sonuç hiç önbelleğe girmez. RLS'e bağlı statik-key'li
  **29 referans/lookup sorgusu** (13 hook dosyası) bu korumaya alındı: ürün
  kategorileri, talep/teklif/numune/sipariş durum & kanal seçenekleri, iller,
  rol/departman/pozisyon, görev durum/öncelik, ödeme yöntemi/banka, müşteri
  seçenekleri, rapor filtreleri, genel referans tablosu.

### Notlar
- Migration yok. `npm run build` + 193 birim testi yeşil.

## [1.3.0] — 2026-08-14

### Eklendi
- **4 yeni teklif red sebebi** (`quote_rejection_reasons`, migration
  `20260817000000_red_sebepleri_yeni.sql`): `moq_fazla` (MOQ Fazla),
  `sonra_degerlendirecek` (Sonra Değerlendirecek), `numune_ucreti_fazla`
  (Numune Ücreti Fazla), `yanlis_numara` (Yanlış Numara). Idempotent
  (`on conflict do nothing`).
- **Reddedilen tekliflere red sebebi atandı** (`scripts/red-sebep-yaz.mjs`,
  kaynak `data/red-sebepleri.csv` — 118 kayıt): `teklif_reddedildi`
  aşamasındaki operasyonların quote'larına `rejection_reason_id` yazıldı.
  Eşleşme müşteri markası üzerinden DB `normalize_tr` ile (JS/SQL sapması yok),
  yalnız `rejection_reason_id IS NULL` olanlara, `rejection_note`'a
  dokunulmadan. **118 quote** güncellendi (116 otomatik + 2 elle: "Ayaz Atlas"→
  AYAZ ALTAS, "Mahir Tuğanatay"→Mahir Tuğantay yazım farkları). Dağılım:
  Ulaşılamadı 53, Fiyat Yüksek 34, Müşteri Vazgeçti 10, MOQ Fazla 8,
  Sonra Değerlendirecek 6, Numune Ücreti Fazla 5, Yanlış Numara 2.
  CSV'de olmayan 37 quote boş bırakıldı. "Melike Hanım" `numune` aşamasında
  olduğu için (reddedilmemiş) atlandı.
- Kuru koşu scripti `scripts/red-sebep-kuru-kosu.mjs` (yalnız okuma).

### Notlar
- Uygulanan migration: `20260817000000_red_sebepleri_yeni.sql` (`psql -f` ile;
  defter kayması sürüyor). Toplu güncelleme öncesi yedek alındı
  (`~/tekstil-crm-yedekler/quotes_operations_20260814_redsebep.sql`).
- Bildirim gürültüsü **0**: yazma yalnız `rejection_reason_id`'ye dokunduğu,
  `status_id`/`sent_at` değişmediği için notify/timeline/hard_gate trigger'ları
  tetiklenmedi (`notifications` 212→212, `event_log` 9081→9081). `sync_operation_status`
  koşulsuz çalıştı ama 155 op zaten `teklif_bekliyor` olduğundan net değişiklik yok.

## [1.2.0] — 2026-08-13

### Eklendi
- **Süreç Takip Sistemi verilerinin CRM'e aktarımı** (`scripts/surec-takip-aktar.mjs`):
  **222 müşteri**, **224 talep** (operations), **275 durum geçmişi olayı** (event_log),
  **196 etkileşim** (interactions). İki kademeli müşteri eşleşmesi (telefon-önce,
  sonra marka; `normalize_tr`/telefon-son-10-hane), kaynak tarihlerin korunması
  (`created_at`/`requested_at`/`occurred_at`), tüm adımlar idempotent. Satış rolünde
  3 kullanıcı oluşturuldu (affan.ergul, ayse.duzgun, hakan.akgun); polat.cetiner
  mevcut hesaba eşlendi. Telefonlar `contact_points`'e (187), notlar tek
  `interactions` kaydı olarak (`[Süreç Takip aktarımı]` etiketli).
- **"Teklif Reddedildi" terminal aşaması** (`operation_stages.teklif_reddedildi`,
  migration `20260816000000_teklif_reddedildi_terminal_stage.sql`): reddedilen
  teklifler artık "İptal" ile karışmaz; ayrı `danger` terminal aşamada. Aktarımdan
  gelen **155 iptal → teklif_reddedildi** taşındı, quote'ları `reddedildi` durumuna
  çekildi (gerekçe + yanıt tarihi), `quotes_close_op_on_reject` trigger'ı yeni
  aşamaya yönlendirildi (bugünden sonraki gerçek redler de buraya gider).
- **214 quote üretimi** (`scripts/surec-takip-quotes.mjs`): teklif verilmiş
  aşamalardaki (teklif_iletildi/numune/siparis/tamamlandi/iptal) operasyonlara
  quote kaydı (`sent_at` kaynak durum-değişim tarihinden). "Teklif bekliyor"
  panelindeki şişme düzeldi (70 → 12).
- **Etkileşim→operasyon backfill** (`scripts/surec-takip-etkilesim-operasyon-backfill.mjs`):
  196 ithal etkileşime `interactions.operation_id` yazıldı → operasyon ekranında
  da görünür oldular (`entity_type`/`entity_id` korunarak).
- `cancellation_reasons`'a **"Teklif reddedildi"** (`teklif_reddedildi`) referansı.

### Notlar
- Uygulanan migration: `20260816000000_teklif_reddedildi_terminal_stage.sql`
  (`psql -f` ile; defter kayması sürüyor). Toplu güncelleme öncesi yedek alındı
  (`~/tekstil-crm-yedekler`).

## [1.1.0] — 2026-08-13

### Eklendi
- **Ortak `Pagination` bileşeni** (`src/components/shared/Pagination.tsx`):
  konum bilgisi ("1–24 / 197"), sayfa boyutu seçici ve ileri/geri düğmeleri.
  `DataTable`'ın gömülü sayfalama bloğu buraya çıkarıldı (tek kaynak).
- **Katalog ızgara görünümüne sayfalama:** ızgara kolunda yalnızca "{toplam} ürün"
  metni vardı, sayfa geçişi yoktu (`page` 1'de kilitliydi). Artık ızgara ve liste
  görünümleri aynı sayfalama çubuğunu kullanır; sayfa boyutu seçenekleri 24/48/96.
  Görünüm değiştirince (ızgara↔liste) sayfa numarası korunur.

### Değişti
- `DataTable` sayfalama arayüzü davranışça aynı; ortak `Pagination` bileşenini
  render eder (kod tekrarı kaldırıldı).

## [1.0.0] — 2026-08-13

Canlı kullanıma hazırlık. İlk üretim temeli.

### Eklendi
- **Sürüm takibi:** `CHANGELOG.md` (bu dosya) + `package.json` sürümü `1.0.0`.
  Bundan sonra her paket: changelog girdisi + sürüm artışı + `git tag`.
- **Tam sıfırlama (katalog dahil) hazırlığı:** `scripts/uretim-sifirlama.sql`
  genişletildi — operasyon + CRM + **katalog** (ürün/görsel/koleksiyon/katalog/
  maliyet) + tüm `files` satırları silinecek; storage `catalog/` öneki de
  temizlenecek. Ayarlar, referanslar, roller, workflow'lar ve 3 kullanıcı korunur.

### Bekleyen (onay/deploy sende)
- Sıfırlama scriptinin prova + gerçek çalıştırması (ayrı onaylar; script
  ROLLBACK-kilitli).
- P9 bildirim migration'ı (`20260815000000_p9_notifications.sql`) elle uygulanacak.
- Gösterge paneli migration'ı (`20260813000000_p7_pending_requests_image.sql`) elle uygulanacak.
- Intake edge fn deploy + `INTAKE_SECRET`.

---

## [0.9.3] — 2026-08-12 — P11 Sipariş belge işleme

### Eklendi
- Belge/dış-PDF siparişinde `extracted_data`'dan tek kalemlik `order_items` yazımı.
- Görsel/numune/YZ-yorum düzeltmeleri.

### Migration
- `20260816000000_p11_order_extraction_source_belge.sql`

---

## [0.9.2] — 2026-08-12 — P10 Görsel ve erişim iyileştirmeleri (madde 10/12/13)

### Değişti
- Zaman çizelgesi sadeleştirme (kanal ikonu + tarih grubu + katlanır detay, son 3 açık).
- Müşteri **Dosyalar** sekmesi (üretilen belgeler tip+tarih + yüklenenler).
- Talep görseli tıkla-büyüt lightbox (Esc / ← / →).

### Migration
- Yok.

---

## [0.9.1] — 2026-08-12 — P9 Bildirimler (madde 16)

### Eklendi
- Ses politikası (3 sesli olay) + talep/teklif/numune/sipariş durum bildirimleri.
- Teklife 1 saat kala sesli uyarı; numune/sipariş termini dolunca sesli uyarı.

### Migration
- `20260815000000_p9_notifications.sql` — **elle uygulanacak (beklemede).**

---

## [0.9.0] — 2026-08-12 — P8 Taslak köprüsü + eşleşmeyen katalog

### Eklendi
- **P8A** — Taslak → belge köprüsü: taslak teklifi dolu `fiyat_teklifi` belgesi olarak açma.
- **P8B** — Eşleşmeyen katalog kodu: görünürlük + tolerans + yakın eşleşme önerisi.

### Migration
- `20260814000000_p8b_catalog_match.sql`

---

## [0.8.2] — 2026-08-12 — Gösterge Paneli + düzeltme turu 2 (kısmi)

### Eklendi
- P7 Gösterge paneli: "bugün durum ne" — grafiksiz 6 bölüm (5 sayı + 5 liste).
- Durum cascade, belgeden sipariş, yaklaşan süreler düzeltmeleri.

### Migration
- `20260803000000_state_cascade.sql`, `20260803010000_fix_active_op_filter.sql`,
  `20260803020000_due_soon_interventions.sql`
- `20260813000000_p7_pending_requests_image.sql` — **elle uygulanacak (beklemede).**

---

## [0.8.1] — 2026-08-12 — Intake (tekstilas.com entegrasyonu)

### Eklendi
- `intake_process` RPC + edge fn + taslak teklif + birleştirme + eşleşmeyen kod çözümü.

### Migration
- `20260804000000_intake_integration.sql`, `20260804010000_approve_draft_quote.sql`,
  `20260805000000_unmatched_catalog.sql`

### Bekleyen
- Edge fn deploy + `INTAKE_SECRET` (sende).

---

## [0.8.0] — 2026-08-12 — P6 Görev/Hedef + YZ, P7 Raporlar

### Eklendi
- **P6** — Görev/hedef + YZ (ai-assist tek kapı + izin listesi + maliyet kontrolü);
  otomatik takip görevleri (durum geçişi / etkileşim → `source='otomatik'`); çakışma bloğu.
- **P7** — `metrics.*` tek kaynak, çalışan + yönetici panel, 6 rapor + Excel/PDF, YZ yorum.

### Migration
- `20260801100000_p6_1_tasks_goals.sql` … `20260801160000_p6_13_ai_cost.sql`,
  `20260801200000_state_machine_automation.sql`, `20260812120000_p6_11_otomatik_takip_gorevleri.sql`
- `20260801240000_p7_1_metrics.sql`, `20260802000000_metric_public_wrappers.sql`,
  `20260802010000_manager_dashboard.sql` … `20260802050000_role_permission_admin.sql`

---

## [0.6.0] — 2026-08-10 — P5 Finans

### Eklendi
- Cari hesap, ödemeler, ön ödeme kapısı, vade takibi, ekstre, yetkilendirme.
- Form kalitesi: ilk temas alanları, konum/telefon dropdown, beden ondalık, katalog/ürün silme.

### Migration
- `20260731100000_p5_1_account_transactions.sql` … `20260731170000_p5_8_sales_no_finance.sql`,
  `20260810000000_p5_first_contact_fields.sql`, `20260810010000_p5_catalog_soft_delete.sql`

---

## [0.5.0] — 2026-07-30 — P4B Katalog + maliyet

### Eklendi
- Katalog (ürün/görsel/koleksiyon), maliyet reçetesi, döviz kuru, marj kademeleri,
  maliyet belgesi, tek-tuş teklif. Uyarı motoru + açık dosyalar + snooze + günlük özet.

### Migration
- `20260728100000_p4b_document_settings.sql` … `20260729140000_p4b_daily_summary.sql`,
  `20260730100000_p4b_catalog_schema.sql` … `20260730160000_p4b_operation_catalog_fk.sql`

---

## [0.4.0] — 2026-07-27 — P4A Belge motoru

### Eklendi
- 5 belge tipi, TR/EN, iç-not sızıntı koruması, bağımsız belge üretimi.

### Migration
- `20260727120000_p4a_flow_and_documents.sql`, `20260727130000_pool_claim.sql`,
  `20260727140000_p4a_build_document_data.sql`, `20260727150000_p4a_documents_independent.sql`,
  `20260727160000_p4a_uretici_settings.sql`

---

## [0.3.0] — 2026-07-27 — P3 Operasyonlar

### Eklendi
- Talep/teklif/numune/sipariş, durum makinesi + kapılar, SLA, operasyon ekranı,
  intake edge fn temeli, rework şeması.

### Migration
- `20260726320000_p3_1_operation_reference_data.sql` … `20260726470000_p3_12_intake_and_sla_trigger.sql`,
  `20260727100000_p3_rework_schema.sql`, `20260727110000_p3_rework_categories.sql`,
  `20260726410000_system_timezone.sql`

---

## [0.2.0] — 2026-07-25 — P1 CRM temel

### Eklendi
- Referanslar, iletişim noktaları/telefon, potansiyeller, müşteriler, etkileşim,
  not/etiket/dosya, zaman çizelgesi, dönüşüm, arama/mükerrer, içe aktarma.

### Migration
- `20260726090000_p1_1_reference_data.sql` … `20260726310000_p1_10_undo_v2.sql`

---

## [0.1.0] — 2026-07-25 — P0 İskele + temel

### Eklendi
- Proje iskeleti (Vite + React 19 + TS strict, Tailwind 4, shadcn, test/lint zinciri).
- DB temeli (enum + yardımcı fn), denetim/olay kayıtları, kimlik + çalışan yönetimi,
  rol/yetki, ayarlar altyapısı, dosya depolama, operasyon kodu üreteci.
- Tasarım sistemi + AppShell, paylaşılan bileşenler, ikas tasarımına geçiş.
- Güvenlik: kabul testi açıkları düzeltmesi + kalıcı regresyon; hata görünürlüğü.

### Migration
- `20260725121441_p0_2_db_foundation.sql` … `20260725190000_p0_4_user_mgmt_rls_hardening.sql`

[1.0.0]: #100--2026-08-13
[0.9.3]: #093--2026-08-12--p11-sipariş-belge-işleme
[0.9.2]: #092--2026-08-12--p10-görsel-ve-erişim-iyileştirmeleri-madde-101213
[0.9.1]: #091--2026-08-12--p9-bildirimler-madde-16
[0.9.0]: #090--2026-08-12--p8-taslak-köprüsü--eşleşmeyen-katalog
[0.8.2]: #082--2026-08-12--gösterge-paneli--düzeltme-turu-2-kısmi
[0.8.1]: #081--2026-08-12--intake-tekstilascom-entegrasyonu
[0.8.0]: #080--2026-08-12--p6-görevhedef--yz-p7-raporlar
[0.6.0]: #060--2026-08-10--p5-finans
[0.5.0]: #050--2026-07-30--p4b-katalog--maliyet
[0.4.0]: #040--2026-07-27--p4a-belge-motoru
[0.3.0]: #030--2026-07-27--p3-operasyonlar
[0.2.0]: #020--2026-07-25--p1-crm-temel
[0.1.0]: #010--2026-07-25--p0-iskele--temel
