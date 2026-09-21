# Genel istekler — mevcut durum ve plan (21 Eyl 2026)

Kaynak: Tuna'nın 21 Eyl 2026 listesi (9 madde + kâr marjı). Karşılaştırma canlı DB
(`kkxvoxeqfsaqzklrtgrw`) ve `canli` dalı (bu makine, v1.38 + sonrası) üzerinden yapıldı.
Berkan'ın `main` dalı (v1.58, bitmemiş) bazı maddeleri ayrıca ele alıyor; not düşüldü.

Durum: ✅ var · 🟡 kısmen · ❌ yok

| # | İstek | Durum | Boşluk / karar |
|---|---|---|---|
| 1 | Site talepleri otomatik düşsün, müşteri açılsın | ✅ | 21 Eyl'de iletim geri açıldı. **Karar (Tuna, 21 Eyl):** eşleştirme telefon + isim, telefon öncelikli. Bugünkü `find_duplicates` ikisine de bakıyor ama aynı sırada; "benzer isim" (%75 benzerlik) de otomatik bağlıyor → riskli. **✅ 21 Eyl 19:30 uygulandı** (migration `20260921190000`): telefon > tam isim (uyarı notu + numara ikincil telefon olarak eklenir) > benzer isim yalnız not, bağlamaz |
| 2 | WhatsApp/Instagram talepleri elle | ✅ | Kanallar: whatsapp, instagram, mail, telefon, telegram, manuel, web_sitesi |
| 3 | Teklif Bekliyor / İletildi / Reddedildi (sebepli) | 🟡 | Bekliyor+İletildi var. Reddedildi bugün **iptal** yoluyla (5 sebep). Ayrı durum olarak yok; Berkan'ın dalı (H-paketleri) bunu kuruyor ama bitmedi. **Karar:** onu bekle mi, `canli`'de yap mı |
| 4 | Numune: üretimde, kargoda, teslim, revize, onaylandı, reddedildi | ✅ | 16 durum var, istenen 6. **Karar:** fazlalar pasife çekilsin mi |
| 5 | Sipariş: üretimde, kargoda, teslim | ✅ | 15 durum var, istenen 3. Aynı karar |
| 6 | Numune/sipariş termini, ana ekranda | 🟡 | Alanlar var (`samples.target_date`, `orders.planned/promised_delivery`), panelde "yaklaşan süreler" var. **Numune hedef tarihi arayüzden yazılamıyor** — P9 bildirim migration'ı canlıya uygulanmadı (≈1 saat) |
| 7 | Teklif hazırlama; katalogda maliyet varsa otomatik teklif | ✅ | Çalışıyor (21 Eyl aktarımında 136 taslak açıldı). 1291 ürünün **489'unda maliyet var**; kalan 800'e otomatik teklif çıkmaz → veri işi |
| 8 | Müşteriye aksiyon girme/takip | ✅ | `interactions` (görüşme) + `tasks` (görev). Berkan'ın dalında ayrıca "aksiyon ekleme formu" (E-B). **Karar:** tek "aksiyon" ekranı mı |
| 9 | Tek rapor | 🟡 | 6 ayrı rapor var, tek sayfa yok. Ayrıntı aşağıda |
| 10 | Kâr marjı kademeleri + serbest giriş | 🟡 | Ayrıntı aşağıda |

## 9 — Tek rapor: hangi ölçüt hazır

| Ölçüt | Veri | Not |
|---|---|---|
| Talep adedi; teklif verilen/verilmeyen | ✅ | |
| 24 saat sözü tutma | ✅ | `metrics.metric_requests` → `sla_rate` zaten var |
| "Yapılamaz" işaretli talepler | ❌ | Sütun yok. Berkan E-C paketi (geçersiz talep işaretleme) bunu ekliyor |
| İl dağılımı | ✅ | `province_id` (site şehir adından) |
| Kanal dağılımı (Meta/FB, IG, Search, TikTok, Pinterest, Organik, Data, Dış/Gelen arama) | ❌ | Site formu `kaynak{kanal, utm_*, gclid, fbclid, ttclid}` topluyor ama **CRM'e göndermiyor**. `lead.php` payload'una eklenip `operations`'a yeni sütun/JSON; geçmiş `leads.jsonl`'den geri doldurulur (491 kayıtta var). Dış/Gelen arama elle giriş kanalı |
| Katalog / manuel ürün | ✅ | `product_source` |
| Gün ve saat sıklığı | ✅ | `requested_at` |
| Red sebepleri; red sebebi × il | 🟡 | Sebep var ama iptalle karışık (madde 3) |
| Kabul × il; teklif→numune; numune→sipariş; huni | ✅ | `metric_funnel`, `metric_active_funnel` |
| Numune / sipariş sayısı | ✅ | |

**Plan (rapor):** tek sayfa `Genel Rapor`: tarih aralığı + hazır aralıklar (3/7/30 gün), üstte
sayılar, altta dağılımlar. Var olan `metrics.*` fonksiyonları çağrılır, yalnız kanal ve "yapılamaz"
için yeni veri gerekir. Tahmin: kanal verisi 1 gün, rapor sayfası 1–2 gün.

## 10 — Kâr marjı

**İstek:** MOQ 50. 50'ye kadar %40 · 50–250 arası %30 · 250 üstü %20. Üç kademe.
Ayrıca müşteriye özel oran için **serbest marj girişi**.

**Mevcut:**
- `margin_tiers` (Ayarlar → Fiyatlandırma, owner/admin): `min_quantity ≤ adet` olan en büyük
  kademe. Bugün **50→%40 · 200→%30 · 500→%25**. Kademeler zaten 3; yalnız eşikler farklı.
- Ürüne özel marj: `catalog_products.custom_margin_percent` (katalog kartında).
- Teklif kaleminde `quote_item_costs.margin_percent` + `effective_margin_percent` alanları var,
  ama **teklif hazırlarken arayüzde marj girişi yok**; teklif diyaloğu kademeleri yalnız gösteriyor.

**Plan:**
1. Eşikleri ayarlardan değiştir (kod yok): `50→%40 · 51→%30 · 251→%20`. Tam 50 adet %40,
   51–250 %30, 251+ %20. **Karar:** 250 tam sınırda %30 mu %20 mi (varsayım: %30).
2. Teklif diyaloğuna ve belge editörüne **"Kâr oranı %" girişi**: varsayılanı kademeden gelir,
   üstüne yazılırsa `quote_item_costs.margin_percent` olarak kaydedilir, `effective_margin_percent`
   buna göre hesaplanır. Kalem bazında (ürün başına) — teklif geneli için tek alan + "hepsine uygula".
3. Raporda "kademe dışı marj verilen teklifler" satırı (isteğe bağlı).
Tahmin: 1 gün.

## Sıralama önerisi

1. Kanal verisini CRM'e taşı (rapor için ön koşul, reklam kararlarını etkiler) — 1 gün
2. Marj kademeleri (ayar) + serbest marj girişi — 1 gün
3. Numune hedef tarihi migration — 1 saat
4. Tek rapor sayfası — 1–2 gün
5. Reddedildi durumu ve "yapılamaz" işareti — Berkan'ın dalı bitince oradan alınır; gecikirse `canli`'de 1 gün
6. Durum listesi sadeleştirme — ekiple 1 saatlik karar, uygulaması yarım gün
