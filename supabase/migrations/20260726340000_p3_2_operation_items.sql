-- =====================================================================
-- P3.2 — operation_items (bir operasyondaki ürün kalemleri). Doküman 6.7.
-- Faz 4'te katalog gelince catalog_product_id eklenecek (yapı buna hazır).
-- =====================================================================
create table public.operation_items (
  id                bigint generated always as identity primary key,
  operation_id      bigint not null references public.operations (id) on delete cascade,
  name              text not null,
  description       text,
  fabric            text,               -- kumaş
  colors            text[],             -- renkler
  sizes             jsonb,              -- beden/adet dağılımı {"S":100,"M":200,...}
  quantity          int,
  print_embroidery  text,               -- baskı/nakış talebi
  label_request     text,               -- etiket isteği
  packaging_request text,               -- ambalaj talebi
  technical_notes   text,
  sort_order        int not null default 0,
  deleted_at        timestamptz,
  deleted_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index operation_items_op_idx on public.operation_items (operation_id) where deleted_at is null;

comment on table public.operation_items is
  'Operasyon ürün kalemleri. Faz 4''te catalog_product_id eklenecek.';

create trigger operation_items_touch before update on public.operation_items
  for each row execute function public.touch_updated_at();
create trigger operation_items_audit after insert or update or delete on public.operation_items
  for each row execute function public.audit_trigger();

alter table public.operation_items enable row level security;
create policy operation_items_select on public.operation_items for select to authenticated using (public.is_active_user());
create policy operation_items_insert on public.operation_items for insert to authenticated with check (public.is_active_user());
create policy operation_items_update on public.operation_items for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
revoke all on public.operation_items from anon;
grant select, insert, update on public.operation_items to authenticated;
