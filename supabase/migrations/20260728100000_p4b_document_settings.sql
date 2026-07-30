-- =====================================================================
-- P4B — Belge editörü ayarları.
--  A4: KDV varsayılanı %20 (quotes.default_tax_rate zaten 20) + seçilebilir KDV listesi.
--  A5: Ödeme koşulu varsayılanı "%50 Ön Ödeme %50 Sevkiyat Öncesi".
-- =====================================================================

-- A5 — ödeme koşulu metni
update public.settings
  set value = '"%50 Ön Ödeme %50 Sevkiyat Öncesi"'::jsonb
  where key = 'documents.default_payment_terms';

-- A4 — KDV varsayılanı %20 (varsa dokunma; yoksa oluştur)
insert into public.settings (key, value, category, description) values
  ('quotes.default_tax_rate', '20'::jsonb, 'quotes', 'Belgelerde varsayılan KDV oranı (%).')
on conflict (key) do update set value = excluded.value where public.settings.value is null;

-- A3/A4 — seçilebilir KDV oranları (ayarlardan yönetilir)
insert into public.settings (key, value, category, description) values
  ('quotes.tax_rate_options', '[0, 1, 10, 20]'::jsonb, 'quotes', 'Belge editöründe seçilebilen KDV oranları.')
on conflict (key) do nothing;
