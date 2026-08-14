-- =====================================================================
-- Reddedilen teklif sebeplerine 4 yeni seçenek ekler.
-- CSV aktarımı (data/red-sebepleri.csv) için gerekli sebep anahtarları.
-- Mevcut sebeplerle çakışmaz; idempotent (on conflict do nothing).
-- ELLE uygulanır — canlı DB'ye ONAY ile.
-- =====================================================================
insert into public.quote_rejection_reasons (key, label, sort_order, is_system) values
  ('moq_fazla',              'MOQ Fazla',              7, true),
  ('sonra_degerlendirecek',  'Sonra Değerlendirecek',  8, true),
  ('numune_ucreti_fazla',    'Numune Ücreti Fazla',    9, true),
  ('yanlis_numara',          'Yanlış Numara',         10, true)
on conflict (key) do nothing;
