# Faz 6 — Görevler, Hedefler ve Yapay Zekâ

> Canlı ekran görüntüleri `docs/assets/faz-6/` altına eklenecek. DB mantığı
> `scripts/test-tasks-p6.mjs` (6 grup) + `tests/unit/{goals,ai-guard}.test.ts` ile kanıtlı.
> **YZ AKTİF:** `ai-assist` deploy edildi, `ANTHROPIC_API_KEY` girildi — YZ özellikleri çalışıyor.

## Görevler (`/gorevler`)
Hazır görünümler (Bana atananlar/Bugün/Bu hafta/Geciken/Oluşturduklarım) · **Liste** + **Pano**
(sürükle-bırakla durum değişir) · filtre (durum/öncelik/sorumlu/arama) · **Yeni görev** (hızlı ekle +
iş yükü göstergesi). Görev kartı: durum/öncelik/sorumlu/tarih · **bağımlılık** (yumuşak kapı: bekleyen işi
tamamlanmadan başlanınca uyarır, engellemez) · **sorumluluk geçmişi** · not/dosya. Alt görev düz liste
(hiyerarşi UI yok — kullanıcı kararı).

![Görevler](assets/faz-6/gorevler.png)

## Otomatik öneriler + iş akışları (operasyon kartı → Görevler)
Olaya göre görev **önerisi** (yeni talep→teklif hazırla, teklif→geri dönüş al, numune→onay takip,
teslim yaklaşıyor, uzun işlemsiz) + iş akışı adımları (sipariş üretime geçti → kumaş/baskı/etiket/kalite/
paketleme). Öneri **otomatik oluşmaz**; Kabul/Reddet. Reddedilen tekrar gelmez.

![Öneriler](assets/faz-6/oneriler.png)

## Hedefler (`/hedefler`)
Kart: gerçekleşen / hedef / % + ilerleme çubuğu + renk (Yolunda/Risk/Gerçekleşmeyecek, süreye göre).
**Gerçekleşen otomatik hesaplanır** — ciro tipi Faz 5 `account_transactions`'tan (kur donmuş; çok para
birimi doğru, ham toplama yok). Dashboard'da kişisel hedefler + görevler ayrı bölümde.

![Hedefler](assets/faz-6/hedefler.png)

## Yapay zekâ — güvenlik ve özellikler

**Tek kapı `ai-assist` edge fn.** Maliyet/finans/iç-not modele ASLA gitmez: (1) **izin-listesi**
(`aiPayloads` yalnız izinli alan) + (2) **guard** (`aiGuard` yasak anahtar reddi). `input_summary`
yapısal (fields_sent/record_counts/payload_hash; metin saklanmaz). Sızıntı testi zorlamalı:
cari+iç not+maliyetli müşteri özetinde bunların hiçbiri payload'da geçmez.

Özellikler (kullanıcı önceliği):
- **Sipariş bilgisini çekme — öncelik BELGEDEN (YZ değil).** Sipariş formunu sistem üretir; veri zaten
  `documents.data`'da JSON'dur → "**Belgeden çek**" bunu okur (ücretsiz, `extraction_source='belge'`), en
  pahalı YZ kullanımı ortadan kalkar. Doğrulama ekranı: her alan + kaynak ("Belge: Sipariş Onay Formu"),
  onaya kadar DB'ye yazılmaz. **"AI ile çek" yedek** (yüklü PDF'i modele; ≤20MB boyut kontrolü, kaynak
  snippet, boş=sarı, uydurmaz). Düzeltilen alanlar `ai_requests.corrected_fields`'e.
- **Müşteri özeti** ("bu müşteriyle ne oldu") + **Talep analizi** — mor **öneri kartı** kalıbında (kıvılcım +
  "Öneri" etiketi + gerekçe + Kabul/Reddet). Hiçbir öneri otomatik uygulanmaz.

![Bilgi çekme doğrulama](assets/faz-6/siparis-cikarma.png)
![Öneri kartı](assets/faz-6/oneri-kart.png)

## Bildirimler
task_assigned (ses) · task_due_soon (sessiz) · task_overdue (ses) · task_blocked (ses, bekleyen iş bitince)
· goal_at_risk (sessiz) · ai_budget_alert. useNotifications aralıkla process_task_due_warnings +
process_goal_notifications çağırır. Muhafazakâr varsayılan; profilden kapatılabilir.

## Ayarlar → Yapay Zekâ (maliyet kontrolü)
Bugünkü/aylık **harcama** (sınıra göre çubuk) · **özellik** bazında + **en çok kullanan** dağılımı ·
sınır/fiyat düzenleme (günlük çağrı, günlük/aylık $ sınırı, 1M-token fiyatları). Tahmini maliyet her
çağrıda token×fiyattan hesaplanır. Günlük/aylık/özellik sınırı aşılınca çağrı reddedilir. **Aylık %80**
aşımında yöneticiye bildirim.

![YZ ayarları](assets/faz-6/yz-ayarlar.png)

---

## Devreye alma durumu
`ai-assist` **deploy edildi** + `ANTHROPIC_API_KEY` **girildi** → YZ özellikleri aktif. (Erişilemezse edge
fn `available:false` döndürür ve özellik sessizce kapanır — dayanıklılık korunur.) Sipariş bilgisi öncelikle
**belgeden** okunduğu için tipik akışta YZ maliyeti oluşmaz; YZ yalnız özet/analiz/AI-yedek çıkarmada devreye girer.

Testler: `scripts/test-tasks-p6.mjs`, `tests/unit/goals.test.ts`, `tests/unit/ai-guard.test.ts` (sızıntı),
`tests/unit/documents.test.ts`.
