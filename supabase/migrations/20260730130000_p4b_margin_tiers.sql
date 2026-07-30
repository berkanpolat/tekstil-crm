-- =====================================================================
-- P4B.6 — KÂR MARJI VE FİYAT KADEMELERİ. Aralık mantığı: min_quantity ≤ adet olan en büyük kademe.
-- Maliyet üstü marj: birim fiyat = birim maliyet × (1 + marj/100). Hesap src/lib/pricing.ts'te (testli).
-- =====================================================================
create table public.margin_tiers (
  id            bigserial primary key,
  min_quantity  int not null unique,
  margin_percent numeric not null,
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.margin_tiers enable row level security;
create policy margin_tiers_select on public.margin_tiers for select to authenticated using (public.is_active_user());
create policy margin_tiers_write on public.margin_tiers for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
revoke all on public.margin_tiers from anon;
grant select, insert, update, delete on public.margin_tiers to authenticated;
create trigger margin_tiers_touch before update on public.margin_tiers for each row execute function public.touch_updated_at();

insert into public.margin_tiers (min_quantity, margin_percent, sort_order) values
  (50, 25, 1), (200, 20, 2), (500, 10, 3)
on conflict (min_quantity) do nothing;

-- Ürüne özel marj (null = kademeleri kullan).
alter table public.catalog_products add column if not exists custom_margin_percent numeric;

-- Varsayılan marj (kademe bulunamazsa / referans).
insert into public.settings (key, value, category, description) values
  ('pricing.default_margin_percent', '25'::jsonb, 'pricing', 'Varsayılan kâr marjı (%) — kademe yoksa.')
on conflict (key) do nothing;
