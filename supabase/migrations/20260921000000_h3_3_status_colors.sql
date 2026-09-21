-- =====================================================================
-- PAKET H · H3.3 — Durum renkleri (ton). stage_statuses.color H1'de eklendi ama boştu.
-- =====================================================================
-- Şema (kullanıcı kararı): bekleyen/başlangıç=neutral(gri-mavi), ilerleyen=info(aşama
-- mavisi), olumlu sonuç=success(yeşil), olumsuz/iptal=danger(kırmızı), revize=warning(turuncu).
-- Aynı aşamanın durumları böylece renk + metinle ayrışır (Teklif·Bekliyor gri ≠ Teklif·İletildi mavi).
-- Renk DESTEKLEYİCİ: metin her zaman "Aşama · Durum" gösterir; anlam yalnız renge yüklenmez.
-- Renkler DB'de tutulur (kodda sabit değil) → H5'te ayarlardan düzenlenebilir olacak.
-- Idempotent: yalnız UPDATE; yeniden koşulabilir.
-- =====================================================================
update public.stage_statuses set color = c.color from (values
  ('st_teklif_bekliyor','neutral'),
  ('st_teklif_iletildi','info'),
  ('st_num_hazirlaniyor','neutral'),
  ('st_num_kargoda','info'),
  ('st_num_teslim','info'),
  ('st_num_revize','warning'),
  ('st_num_onaylandi','success'),
  ('st_num_reddedildi','danger'),
  ('st_sip_alindi','info'),
  ('st_sip_hazir','neutral'),
  ('st_ur_uretimde','info'),
  ('st_ur_bekletiliyor','neutral'),
  ('st_tes_kargoda','info'),
  ('st_tes_teslim','success'),
  ('st_kap_tamamlandi','success'),
  ('st_kap_iptal','danger'),
  ('st_kap_reddedildi','danger')
) as c(key, color) where public.stage_statuses.key = c.key;

notify pgrst, 'reload schema';

-- GERİ ALMA (down): update public.stage_statuses set color = null;
