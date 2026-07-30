-- =====================================================================
-- P3.6 — Siparişler (orders + order_items). Onaylı teklif/numuneden doğar.
-- Termin AYRIMI (doküman 10.6): promised_delivery (müşteriye verilen) ≠ planned_delivery
-- (iç planlama); fark risk göstergesidir. Gecikme riski (10.12): promised yaklaşıp
-- durumu ilerlememiş siparişler işaretlenir (UI). Tutarlar order_items'tan türer.
-- Fiziksel silme yok, audit, RLS geniş.
-- =====================================================================

create table public.orders (
  id                bigint generated always as identity primary key,
  operation_id      bigint not null references public.operations (id) on delete restrict,
  quote_id          bigint references public.quotes (id) on delete set null,
  sample_id         bigint references public.samples (id) on delete set null,
  status_id         bigint references public.order_statuses (id) on delete restrict,
  order_date        date not null default current_date,
  promised_delivery date,                               -- müşteriye verilen tarih
  planned_delivery  date,                               -- iç planlama tarihi
  actual_delivery   date,
  currency          text not null default 'TRY',
  subtotal          numeric(14,2) not null default 0,
  tax_rate          numeric(5,2) not null default 0,    -- trigger ayardan doldurur
  tax_amount        numeric(14,2) not null default 0,
  total             numeric(14,2) not null default 0,
  payment_term_id   bigint references public.payment_terms (id) on delete set null,
  production_notes  text,
  delivery_address  text,
  delivery_notes    text,
  shipped_at        timestamptz,
  tracking_number   text,
  carrier           text,
  held_at           timestamptz,                        -- askıya alma
  hold_reason       text,
  deleted_at        timestamptz,
  deleted_by        uuid,
  created_by        uuid references public.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.orders is
  'Siparişler. promised_delivery (müşteriye) ≠ planned_delivery (iç); fark risk göstergesi. Tutarlar order_items''tan türer.';

create index orders_operation_idx on public.orders (operation_id) where deleted_at is null;
create index orders_status_idx on public.orders (status_id) where deleted_at is null;
create index orders_quote_idx on public.orders (quote_id) where quote_id is not null;
create index orders_sample_idx on public.orders (sample_id) where sample_id is not null;
create index orders_promised_idx on public.orders (promised_delivery) where deleted_at is null;

create table public.order_items (
  id                 bigint generated always as identity primary key,
  order_id           bigint not null references public.orders (id) on delete cascade,
  operation_item_id  bigint references public.operation_items (id) on delete set null,
  name               text not null,
  description        text,
  quantity           numeric(14,2) not null default 1,
  produced_quantity  numeric(14,2) not null default 0,   -- üretilen miktar (ilerleme)
  unit               text,
  unit_price         numeric(14,2) not null default 0,
  discount_rate      numeric(5,2) not null default 0,
  line_total         numeric(14,2) generated always as
                       (round(quantity * unit_price * (1 - discount_rate / 100), 2)) stored,
  sort_order         int not null default 0,
  deleted_at         timestamptz,
  deleted_by         uuid,
  created_by         uuid references public.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.order_items is 'Sipariş kalemleri. produced_quantity üretim ilerlemesi. line_total generated.';
create index order_items_order_idx on public.order_items (order_id) where deleted_at is null;

-- BEFORE INSERT: varsayılan durum + KDV ayardan (teklifle aynı oran ayarı).
create or replace function public.orders_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status_id is null then
    select id into new.status_id from public.order_statuses where is_default limit 1;
  end if;
  if new.tax_rate is null or new.tax_rate = 0 then
    new.tax_rate := public.quote_default_tax_rate();
  end if;
  return new;
end; $$;

-- Tutar hesabı (quotes ile aynı desen).
create or replace function public.recompute_order_totals(p_order_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_subtotal numeric(14,2); v_rate numeric(5,2);
begin
  select coalesce(sum(line_total), 0) into v_subtotal from public.order_items where order_id = p_order_id and deleted_at is null;
  select tax_rate into v_rate from public.orders where id = p_order_id;
  update public.orders set subtotal = v_subtotal,
    tax_amount = round(v_subtotal * coalesce(v_rate, 0) / 100, 2),
    total = v_subtotal + round(v_subtotal * coalesce(v_rate, 0) / 100, 2)
  where id = p_order_id;
end; $$;

create or replace function public.order_items_recompute()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.recompute_order_totals(coalesce(new.order_id, old.order_id));
  return null;
end; $$;

create or replace function public.orders_recompute_on_tax()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.tax_rate is distinct from old.tax_rate then perform public.recompute_order_totals(new.id); end if;
  return null;
end; $$;

-- Timeline: oluşturma, askıya alma, sevk, teslim, durum değişimi.
create or replace function public.orders_timeline_events()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
  if tg_op = 'INSERT' then
    perform public.log_event('order.created', 'operation', new.operation_id::text,
      jsonb_build_object('order_id', new.id));
  elsif tg_op = 'UPDATE' then
    if new.held_at is not null and old.held_at is null then
      perform public.log_event('order.held', 'operation', new.operation_id::text,
        jsonb_build_object('order_id', new.id, 'reason', new.hold_reason));
    end if;
    if new.shipped_at is not null and old.shipped_at is null then
      perform public.log_event('order.shipped', 'operation', new.operation_id::text,
        jsonb_build_object('order_id', new.id, 'carrier', new.carrier, 'tracking', new.tracking_number));
    end if;
    if new.actual_delivery is not null and old.actual_delivery is null then
      perform public.log_event('order.delivered', 'operation', new.operation_id::text,
        jsonb_build_object('order_id', new.id, 'delivered_on', new.actual_delivery));
    end if;
    if new.status_id is distinct from old.status_id then
      select key into v_key from public.order_statuses where id = new.status_id;
      perform public.log_event('order.status_changed', 'operation', new.operation_id::text,
        jsonb_build_object('order_id', new.id, 'status', v_key));
    end if;
  end if;
  return null;
end; $$;

create trigger orders_before_insert before insert on public.orders
  for each row execute function public.orders_before_insert();
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();
create trigger orders_recompute_tax after update on public.orders
  for each row execute function public.orders_recompute_on_tax();
create trigger orders_audit after insert or update or delete on public.orders
  for each row execute function public.audit_trigger();
create trigger orders_timeline after insert or update on public.orders
  for each row execute function public.orders_timeline_events();

create trigger order_items_touch before update on public.order_items
  for each row execute function public.touch_updated_at();
create trigger order_items_recompute after insert or update or delete on public.order_items
  for each row execute function public.order_items_recompute();
create trigger order_items_audit after insert or update or delete on public.order_items
  for each row execute function public.audit_trigger();

-- RLS — geniş
alter table public.orders enable row level security;
create policy orders_select on public.orders for select to authenticated using (public.is_active_user());
create policy orders_insert on public.orders for insert to authenticated with check (public.is_active_user());
create policy orders_update on public.orders for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
revoke all on public.orders from anon;
grant select, insert, update on public.orders to authenticated;

alter table public.order_items enable row level security;
create policy order_items_select on public.order_items for select to authenticated using (public.is_active_user());
create policy order_items_insert on public.order_items for insert to authenticated with check (public.is_active_user());
create policy order_items_update on public.order_items for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
revoke all on public.order_items from anon;
grant select, insert, update on public.order_items to authenticated;
