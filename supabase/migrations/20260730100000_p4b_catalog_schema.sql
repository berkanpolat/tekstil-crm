-- =====================================================================
-- P4B.1 — KATALOG ŞEMASI (onaylandı)
-- Birden fazla katalog + koleksiyon + ürün + görsel. Ürün kategori/tip Faz 3 ağacına (product_categories)
-- FK. Kodlar elle girilir (ST-26SS190009); format doğrulaması yumuşak. Maliyet/fiyat AYRI paketlerde
-- (P4B.4/P4B.6) — bu şema yalnızca ürün verisini taşır, maliyet içermez.
-- =====================================================================

create table public.catalogs (
  id            bigserial primary key,
  name          text not null,
  season        text,                       -- '26SS', '26AW'
  year          int,
  currency      text not null default 'USD',
  is_active     boolean not null default true,
  published_at  timestamptz,
  cover_file_id bigint references public.files(id),
  description   text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.catalog_collections (
  id          bigserial primary key,
  catalog_id  bigint not null references public.catalogs(id) on delete cascade,
  name        text not null,
  code        text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index catalog_collections_catalog_idx on public.catalog_collections (catalog_id);

create table public.catalog_products (
  id              bigserial primary key,
  catalog_id      bigint not null references public.catalogs(id),
  collection_id   bigint references public.catalog_collections(id),
  code            text not null unique,           -- ST-26SS190009 (elle, yumuşak doğrulama)
  name            text not null,
  name_normalized text generated always as (public.normalize_tr(name)) stored,
  category_id     bigint references public.product_categories(id),   -- Faz 3 ağacı (Grup/Dal)
  type_id         bigint references public.product_categories(id),   -- tür
  composition     text,                            -- "%95 Pamuk %5 Elastan Süprem 160-180 gr/m²"
  description     text,
  moq             int not null default 50,
  size_system     text,                            -- Alfa | Numara | Özel
  sizes           text[] not null default '{}',
  colors          jsonb not null default '[]',     -- [{ad, kod}]
  sort_order      int not null default 0,
  is_active       boolean not null default true,
  deleted_at      timestamptz,
  deleted_by      uuid references auth.users(id),
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index catalog_products_catalog_idx on public.catalog_products (catalog_id) where deleted_at is null;
create index catalog_products_collection_idx on public.catalog_products (collection_id) where deleted_at is null;
create index catalog_products_category_idx on public.catalog_products (category_id) where deleted_at is null;
create index catalog_products_name_trgm on public.catalog_products using gin (name_normalized gin_trgm_ops);
comment on column public.catalog_products.code is 'Ürün kodu (elle, ör. ST-26SS190009). Kataloglar arası format değişebilir; doğrulama uyarır, engellemez.';

create table public.catalog_product_images (
  id          bigserial primary key,
  product_id  bigint not null references public.catalog_products(id) on delete cascade,
  file_id     bigint not null references public.files(id),
  image_type  text not null default 'diger' check (image_type in ('ana','detay','arka','yan','diger')),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index catalog_product_images_product_idx on public.catalog_product_images (product_id);

-- updated_at trigger
create trigger catalogs_touch before update on public.catalogs for each row execute function public.touch_updated_at();
create trigger catalog_collections_touch before update on public.catalog_collections for each row execute function public.touch_updated_at();
create trigger catalog_products_touch before update on public.catalog_products for each row execute function public.touch_updated_at();

-- RLS: ürün verisi tüm aktif kullanıcılara AÇIK (maliyet AYRI tabloda, P4B.4 daha sıkı).
do $$ declare t text;
begin
  foreach t in array array['catalogs','catalog_collections','catalog_products','catalog_product_images'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_active_user())', t, t);
    execute format('create policy %I_write on public.%I for all to authenticated using (public.is_active_user()) with check (public.is_active_user())', t, t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
