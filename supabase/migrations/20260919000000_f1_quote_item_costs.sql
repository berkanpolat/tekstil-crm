-- =====================================================================
-- PAKET F · F1 — Teklif opsiyonu başına maliyet/marj (maliyet tabanlı teklif zemini)
-- =====================================================================
-- KARAR: Maliyet/marj quote_items'e KOLON olarak EKLENMEDİ. Sebep sızıntı:
--   quote_items SELECT RLS'i is_active_user() → HER aktif kullanıcı satırı okur;
--   RLS satır-düzeyidir, kolon-düzeyi permission maskesi YOKTUR. quote_items.unit_cost
--   olsaydı `select unit_cost` ile herkes görürdü. Bu yüzden maliyet, product_costs
--   ile AYNI desende ayrı bir tabloda + costs.view SELECT RLS'i ile tutulur.
--   → costs.view olmayan kullanıcı hiçbir API yolundan maliyet göremez.
-- Yapısaldır (quote_items'e 1:1 FK) → raporlanabilir (F4 privileged join).
-- =====================================================================

create table if not exists public.quote_item_costs (
  quote_item_id  bigint primary key references public.quote_items(id) on delete cascade,
  unit_cost      numeric not null check (unit_cost >= 0),   -- opsiyon başına planlanan birim maliyet
  cost_currency  text    not null default 'USD',
  margin_percent numeric check (margin_percent >= 0),        -- hedef marj (null → maliyet var, marj hesaplanmadı)
  fabric_label   text,                                       -- hangi kumaş varyantı (F3 zemini)
  rate_snapshot  jsonb,                                      -- maliyet anındaki kur (opsiyonel)
  notes          text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.quote_item_costs is
  'Teklif opsiyonu (quote_items) başına planlanan maliyet + hedef marj. costs.view/edit kapılı; MÜŞTERİYE GİTMEZ. quote_items''e kolon eklenmedi (o RLS tüm aktif kullanıcıya açık → sızıntı).';

alter table public.quote_item_costs enable row level security;

-- Sızıntı kapısı: OKUMA yalnız costs.view, YAZMA yalnız costs.edit (product_costs ile aynı).
create policy quote_item_costs_select on public.quote_item_costs
  for select using (public.has_permission('costs.view'));
create policy quote_item_costs_write on public.quote_item_costs
  for all using (public.has_permission('costs.edit')) with check (public.has_permission('costs.edit'));

grant select, insert, update, delete on public.quote_item_costs to authenticated;

create trigger quote_item_costs_touch before update on public.quote_item_costs
  for each row execute function public.touch_updated_at();

notify pgrst, 'reload schema';
