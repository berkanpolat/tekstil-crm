# Faz 4A — Belge Motoru (özet / devir)

Eski tek-dosya HTML belge/etiket uygulamasının (`docs/kaynak/studyo-belge-uygulaması.html`)
ürettiği 5 belgeyi CRM içine taşır. **Tasarım birebir korunur**, **iç notlar belgeye asla
girmez**, her belge `files` + `documents`'a kaydedilir, sürüm zinciri korunur, kod formatı
`TAS-XXXXXX` (harfli). Sunucu tarafı PDF (tarayıcı yazdırma değil). Hedef: **< 2 sn** (render ~50 ms).

## Mimari — "taşı ve sarmala"

PDF servisi orijinal `studio.html`'i sıcak bir Playwright Chromium sayfasına yükler; orijinal
üretici fonksiyonları (`tkQuoteDoc`, `soDoc`, `siparisDocHTML`, `numuneHTML`, `stickerHTML`)
`page.evaluate` ile çağırır, durumu enjekte eder, HTML alır ve `page.pdf` ile A4 render eder.
Sıfır yeniden yazım → birebir garanti.

- **Durum değişkenleri lexical** (`let norder/sip/soS/order/numuneler`) → window'a düşmez;
  `window.eval` ile atanır. **Kırılgan** olduğu için açılışta **boot self-check** 5 değişkenin
  erişilebilirliğini doğrular, aksi halde yüksek sesle hata verir (sessiz boş belge yok).
  Ayrıntı: `docs/specs/pdf-servisi-lexical-state.md`.
- **STD- → TAS-** ikamesi ve **İngilizce** (fiyat teklifi native `tkS.dil`, diğer dördü
  `services/pdf-renderer/i18n.mjs` sözlüğüyle — 6 iş-akışı gövde paragrafı dâhil) render'da uygulanır.
- **Üretici bilgileri** `settings.company.*` → `document_uretici()` → render'da gömülü şablon
  değerlerinin üzerine yazılır (Kabul 11; koda gömülü değil).

## Kullanıcı akışı (P4A.4)

**Tam sayfa editör** — kendi rotası var, modal değil:
`/belgeler/yeni/:tip` (yeni · `?op=<id>` opsiyonel) ve `/belgeler/:id/duzenle` (mevcut belge).
AppShell dışı, kendi üst çubuğuyla (başlık · dil · İptal · Üret ve indir).

1. Belge tipi seçilir (operasyon kartından **"… hazırla"** → `?op` ile, ya da Belgeler >
   **Yeni belge** → tip + opsiyonel operasyon seçici).
2. Sistem bildiği alanları doldurur — `build_document_data(operation_id, type, language)`
   (SECURITY DEFINER, **internal_notes okumaz**). Bağımsız belgede boş şablon + `document_uretici()`.
3. Kullanıcı eksikleri tamamlar / düzenler — **SOL sütun (%40)**, gruplu form (`editorForms.tsx`):
   Temel Bilgiler · Ticari Koşullar · Üretim Seçenekleri · Notlar; iki sütunlu ızgara; tarihler
   TR biçimli DatePicker; çoklu satırlar (seçenek/renk/numune/koli) eklenir, silinir, sıralanır.
4. **Canlı önizleme** — **SAĞ sütun (%60)**, tüm belge görünür, zoom %50/%75/%100, çok sayfada
   kaydırılır; yazarken (~350 ms debounce) `POST /preview`. Mobilde Form/Önizleme sekmeli.
5. Onayda **`POST /render`** → PDF → Storage → `documents` kaydı → `/belgeler`'e döner. Fiyat
   teklifinde ayrıca `quotes` + dosya (durum → `teklif_iletildi`).

**Bağımsız belge:** operasyon bağlantısı opsiyonel; `documents.operation_id` NULL olabilir.
Sipariş-onay sert kapısı yalnızca operasyona bağlı belgeleri sayar → bağımsız belge kapıyı **açmaz**.

## Kapılar ve akış kuralları (P4A.5)

- **Sipariş onay formu her durumda zorunlu** — numune/sipariş öncesi sert kapı
  (`require_siparis_onay` + BEFORE INSERT trigger).
- **Numune revizyonu aynı kayıtta** (`revise_sample` RPC: `revision_round`+`reason`, 3+ tur uyarısı).
- **Ödeme kontrolü** yumuşak (payments; engelleme yok).
- **Havuz modeli**: intake talepleri sahipsiz; "Üstlen" (`claim_operation`, atomik yarış koruması).

## İdempotency

`data_hash = sha256(JSON(data) + '|' + language + '|' + TEMPLATE_VERSIONS[type])`. Aynı
operasyon+hash varsa yeniden üretilmez; mevcut dosya döner.

## Dosyalar

| Katman | Dosya |
|---|---|
| PDF servisi | `services/pdf-renderer/{server.mjs, render.mjs, i18n.mjs, templates/studio.html, Dockerfile, fly.toml}` |
| Şema | `supabase/migrations/2026072712…–16…_p4a_*.sql` |
| Veri/hook | `src/hooks/{useDocuments.ts, useDocumentsList.ts}` |
| UI | `src/pages/documents/{DocumentEditorPage, editorForms, NewDocumentButton, BelgelerListPage}.tsx`, `src/pages/operations/GenerateDocButton.tsx`; rotalar `src/App.tsx` |
| Testler | `scripts/{test-belge-p4a9, test-generate-doc-ui, benchmark-pdf, faz4a-ekranlar}.mjs` |
| Docs | `docs/{faz-4a-performans, faz-4a-ekranlar, faz-4a-belge-motoru}.md`, `docs/devir/{pdf-servisi, uygulama-dagitimi}.md`, `docs/specs/pdf-servisi-lexical-state.md` |

## Testler (P4A.9) — hepsi yeşil

- **`test-belge-p4a9.mjs`** (servis): iç-not sızıntısı yok (5 tip × build+render) · harfli barkod
  (TAS-) · EN çeviri tam (4 tip, TR etiket sızıntısı yok) · yeniden üretim birebir (HTML + PDF
  sha eşit) · idempotency hash.
- **`test-generate-doc-ui.mjs`** (tarayıcı): editör açılır + canlı önizleme + yazılan değer anlık
  yansır → onayda üretir → belge verisine yazılır · sert kapı açılır → numune · fiyat teklifi →
  quote+durum · **bağımsız belge (operation_id null)** üretir ve sert kapıyı açmaz.
- **`benchmark-pdf.mjs`**: render ~30–75 ms (bkz. `faz-4a-performans.md`).
- Birim testler: `vitest run` → 99/99.

## Dağıtım

- PDF servisi: **Fly.io fra** (Frankfurt, Supabase ile aynı bölge), always-on. `docs/devir/pdf-servisi.md`.
- React uygulaması: Hostingdünyam cPanel (statik build + SPA `.htaccess`). `docs/devir/uygulama-dagitimi.md`.
- Dağıtım sonrası uçtan uca performans ikinci tablosu: `docs/faz-4a-performans.md` (Fly rakamlarıyla doldurulacak).

## P4B — Editör ve genel düzeltmeler (sonradan)

- **TAS kodu doğrulama** (`src/lib/tasCode.ts`): Talep/Sipariş No/Ürün Kodu alanları `TAS-`+6 karakter
  (A-Z/2-9, I/O/0/1 yok), "Oto üret" (`generate_operation_code`). Öneksiz 6 karakter saklanır
  (şablon öneki ekler) — bu, talep no'nun belgede "—" çıkması bug'ının köküydü.
- **Açılır menüler**: Ürün Grubu (Grup/Dal) + Türü kategori ağacından; Para/Geçerlilik/KDV/Beden Sistemi.
- **Varsayılanlar** (`settings`): KDV %20, ödeme "%50 Ön Ödeme %50 Sevkiyat Öncesi". Fiyat alanları
  sayısal + para birimi; toplam adet sayısal.
- **Sipariş onay**: düzenleme+form tarihi, imza (ad/unvan/tarih), otomatik toplam tutar.
- **Numune**: çoklu müşteri tek çıktıda (render.mjs her etikette `norder`'ı ayarlar); barkod
  `TAS-KOD|BEDEN|RENK` (müşteri hariç, ~22 karakter — CODE128 güvenli).
- **Sipariş formu**: oto sipariş no + ürün kodu TAS; 9 bakım talimatı onay kutusu (BAKIM, def işaretli).
- **Kategori ağacı** (`20260728110000`): 30 üst kategori (Grup/Dal) + 180 tür, eski pasif.
- **B1 döviz**: para ≠ TRY ise PDF servisi `/rates` (TCMB Döviz Satış, sunucu-taraflı, CORS'suz);
  belgede TL karşılığı + kur kaynağı/tarihi. **B2 fotoğraf**: `tkS.foto` data URL + oran (fotoAR).
- **Belge silme** (A8): `useDeleteDocument` mantıksal siler; fiyat teklifinde bağlı teklif de silinir →
  `quotes_sync_operation_status` operasyonu `teklif_bekliyor`a döndürür. **Realtime** (A9): documents
  publication'a eklendi, Belgeler listesi anlık.
- **H1** teklif SLA 24 takvim saati (iş-saati kalktı, ayardan). **H2** talep kartında büyük görsel.
  **H3** talepler tablosu kolon seçici + varsayılan gizli kolonlar. **H4** müşteri listesinde vergi no
  kolonu kalktı. **H5** sektör alanı UI'dan tamamen kaldırıldı. **H6** teklif "Olumlu — Beklemede":
  sebep + tekrar-bak tarihi zorunlu (`quotes.follow_up_at/reason`), zamanı gelince arayüzde hatırlatılır
  (`due_quote_followups()`).

Testler: `scripts/test-belge-h6-a8-ui.mjs` (H6+A8 arayüzden), `test-belge-p4a9.mjs`, `test-generate-doc-ui.mjs`.

## Bilinçli sapma

Örnek PDF'lerdeki üretici verisi (Vergi No `612181028` vb.) artık `settings.company.*`'tan gelir
(`6121811028` vb.) — **tasarım birebir**, yalnızca doğru şirket verisi farklı (Kabul 11 gereği).
