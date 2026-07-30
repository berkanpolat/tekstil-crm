# Bekleyen iş — TekLead `tr_il_bolge` içe aktarımı (İl/İlçe/Bölge)

## Durum

Şu an talep formunda **İl** 81 ilden seçilir (`provinces` tablosu), **İlçe**
serbest metin olarak girilir ve normalize edilip saklanır
(`operations.district` + `district_normalized`).

## Neden bekliyor

İlçe listesini hafızadan üretmek hata riskli (~970 ilçe). TekLead
veritabanında doğruluğu kanıtlanmış **`tr_il_bolge`** tablosu var; şu an çalışan
sistemde bölge filtresi bunu kullanıyor. O tabloda **bölge** bilgisi de var
(Faz 7 bölge raporları için gerekli).

- TekLead projesi: Supabase ref `sthmktgwcfttopqadjau` (region eu-central-1),
  ad "lead".

## Kullanıcı okuma erişimi sağlayınca yapılacaklar

1. `tr_il_bolge` tablosunu incele (il, ilçe, bölge kolonları).
2. CRM'e `districts` tablosu ekle: `province_id` FK + `name` + `region` (bölge).
   İlçeleri `tr_il_bolge`'den içeri aktar.
3. `operations.district` (serbest metin) → `operations.district_id` FK'ya taşı;
   mevcut serbest metinleri normalize eşleştirerek bağla (eşleşmeyenler serbest kalır).
4. Talep formunda İlçe'yi **il'e bağlı aranabilir seçici** yap (İl seçilince
   ilçeler gelir).
5. Faz 7: bölge bazlı raporlar (`region`) — "müşteriler bölge dağılımları".

## Şu anki geçici çözümün bıraktığı köprü

- `provinces` (81 il) hazır ve FK bağlı.
- İlçe serbest metin + normalize → veri kaybı yok; içe aktarımda eşleştirilebilir.
- `operations.province_id` zaten il bazlı raporu destekliyor.
