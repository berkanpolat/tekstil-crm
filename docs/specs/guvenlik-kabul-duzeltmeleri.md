# Güvenlik — Kabul Testi Düzeltmeleri

Kabul testinde çıkan dört bulgunun TEŞHİSİ (gerçek davranış ölçülerek) ve düzeltmesi.

## Teşhis sonuçları

| # | İddia | Ölçülen gerçek | Kök neden |
|---|---|---|---|
| 1 | Şifre değişince ekran değişmiyor (döngü) | Backend `must_change_password` doğru `false` oluyor | İSTEMCİ: `/sifre-degistir`'de `useCurrentUser` inaktif → `invalidateQueries` refetch etmez → guard bayat `true` okur |
| 2 | Çalışan kendi rolünü değiştirebiliyor | KENDİ rolü trigger ile **engelli**; ama **BAŞKASININ** rolü/durumu geniş RLS ile **AÇIK** | `users_update` RLS = `is_active_user()` (çok geniş) |
| 3 | Yetkisiz çalışan kullanıcı ekliyor | `create-user` → Satış için **403** (zaten güvenli); rol de doğru yazılıyor | Görünürlük BUG 4'ten |
| 4 | Arayüz yetkiye göre gizlemiyor | Menü + ayar sayfaları role-gate'siz | UI gate eksik |

## Düzeltmeler

**BUG 1 (istemci):** `ChangePasswordPage` artık cache'i doğrudan yamalar
(`setQueryData` ile `must_change_password=false`), guard anında yeni değeri görür.
Ayrıca `must_change` update hatası kontrol edilir.

**BUG 2 (gerçek açık — migration `20260725190000`):**
- `users_update` RLS: `is_admin_or_owner() OR id = auth.uid()` — admin herkesi,
  normal kullanıcı yalnızca kendi satırını.
- `users_insert` RLS: `is_admin_or_owner()`.
- `users_prevent_self_role_change` genişletildi: kullanıcı kendi `role_id`,
  `is_active`, `deleted_at` alanını değiştiremez (savunma katmanı).

**BUG 3:** Zaten güvenliydi (requireRole). INSERT RLS admin'e kısıtlandı; regresyon eklendi.

**BUG 4 (UI):**
- `Ayarlar` menü öğesi `adminOnly`; sidebar role'e göre filtreler.
- `/ayarlar` rotaları `RequireManager` guard'ı ile sarıldı → yetkisizde
  `NoAccessPage` ("Bu sayfaya erişiminiz yok"), adres elle yazılsa da.
- (Gerçek sınır BUG 2 & 3'teki RLS/Edge; bu görsel katman.)

Ayrıca çalışan düzenleme formu artık rol/departman/pozisyonu ön-doldurur (düzenlemede
sıfırlama/veri kaybı önlendi).

## Kalıcı regresyon testleri

- `scripts/security_regression.mjs` (11 PASS): rol yazımı, Satış→create-user 403,
  Satış kendi rolü red (trigger), Satış BAŞKASININ rolü/durumu red (RLS), Satış kendi
  profili OK, must_change→false.
- `scripts/ui_security.mjs` (4 PASS): Satış Ayarlar görmez, `/ayarlar`→erişim yok,
  ilk-giriş şifre değişimi döngüsü kırıldı.

Bunlar geçici test kullanıcılarıyla çalışır, gerçek owner'a dokunmaz, sonunda temizler.
