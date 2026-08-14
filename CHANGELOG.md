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
