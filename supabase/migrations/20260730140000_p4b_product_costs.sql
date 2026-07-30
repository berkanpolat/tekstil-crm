-- =====================================================================
-- P4B.4 — MALİYET REÇETESİ. Ürün başına versiyonlu maliyet + kalemler. MALİYET MÜŞTERİYE GİTMEZ:
-- ayrı tablo + costs.view/costs.edit yetkisi + RLS. Toplam güncel kurla hesaplanır (rate_snapshot).
-- Hesap src/lib/pricing.ts (testli); versiyon RPC ile atomik.
-- =====================================================================

-- Yetkiler
insert into public.permissions (key, module, action, description) values
  ('costs.view', 'costs', 'view', 'Maliyet reçetesini ve maliyet belgesini görüntüle'),
  ('costs.edit', 'costs', 'edit', 'Maliyet reçetesi düzenle')
on conflict (key) do nothing;
-- admin, manager, finance → maliyet görür + düzenler (owner zaten hepsine sahip)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in ('costs.view','costs.edit')
where r.key in ('admin','manager','finance')
on conflict do nothing;

create table public.product_costs (
  id              bigserial primary key,
  product_id      bigint not null references public.catalog_products(id) on delete cascade,
  version         int not null default 1,
  is_current      boolean not null default true,
  currency_display text not null default 'USD',
  total_cost_try  numeric not null default 0,
  total_cost_usd  numeric not null default 0,
  rate_snapshot   jsonb not null default '{}',
  notes           text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index product_costs_current_idx on public.product_costs (product_id) where is_current;
create index product_costs_product_idx on public.product_costs (product_id);

create table public.product_cost_items (
  id               bigserial primary key,
  cost_id          bigint not null references public.product_costs(id) on delete cascade,
  item_type        text not null default 'diger' check (item_type in ('kumas','kesim_dikim_utu','aksesuar','diger')),
  name             text not null,
  calculation_type text not null default 'sabit' check (calculation_type in ('metre_fiyat','sabit')),
  quantity         numeric,
  unit_price       numeric,
  amount           numeric,
  currency         text not null default 'USD',
  fabric_name      text,     -- yalnız kumaş kaleminde: teklif kumaş alanını otomatik doldurur
  sort_order       int not null default 0
);
create index product_cost_items_cost_idx on public.product_cost_items (cost_id);

-- RLS: yalnızca costs.view görür, costs.edit yazar (maliyet sızıntısı şema düzeyinde engellenir).
alter table public.product_costs enable row level security;
alter table public.product_cost_items enable row level security;
create policy product_costs_select on public.product_costs for select to authenticated using (public.has_permission('costs.view'));
create policy product_costs_write on public.product_costs for all to authenticated using (public.has_permission('costs.edit')) with check (public.has_permission('costs.edit'));
create policy product_cost_items_select on public.product_cost_items for select to authenticated using (public.has_permission('costs.view'));
create policy product_cost_items_write on public.product_cost_items for all to authenticated using (public.has_permission('costs.edit')) with check (public.has_permission('costs.edit'));
revoke all on public.product_costs, public.product_cost_items from anon;
grant select, insert, update, delete on public.product_costs, public.product_cost_items to authenticated;
create trigger product_costs_touch before update on public.product_costs for each row execute function public.touch_updated_at();

-- Maliyet kaydet (yeni versiyon, atomik). Yetki: costs.edit. Toplamlar app'te pricing.ts ile hesaplanıp gelir.
create or replace function public.save_product_cost(
  p_product_id bigint, p_items jsonb, p_total_try numeric, p_total_usd numeric, p_rates jsonb, p_notes text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_ver int; v_cost_id bigint; it jsonb; v_uid uuid := auth.uid();
begin
  if not public.has_permission('costs.edit') then raise exception 'Maliyet düzenleme yetkiniz yok.' using errcode = '42501'; end if;
  select coalesce(max(version),0)+1 into v_ver from public.product_costs where product_id = p_product_id;
  update public.product_costs set is_current = false where product_id = p_product_id and is_current;
  insert into public.product_costs (product_id, version, is_current, total_cost_try, total_cost_usd, rate_snapshot, notes, created_by)
  values (p_product_id, v_ver, true, coalesce(p_total_try,0), coalesce(p_total_usd,0), coalesce(p_rates,'{}'), p_notes, v_uid)
  returning id into v_cost_id;
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    insert into public.product_cost_items (cost_id, item_type, name, calculation_type, quantity, unit_price, amount, currency, fabric_name, sort_order)
    values (v_cost_id, coalesce(it->>'item_type','diger'), coalesce(it->>'name',''), coalesce(it->>'calculation_type','sabit'),
      nullif(it->>'quantity','')::numeric, nullif(it->>'unit_price','')::numeric, nullif(it->>'amount','')::numeric,
      coalesce(it->>'currency','USD'), nullif(it->>'fabric_name',''), coalesce((it->>'sort_order')::int,0));
  end loop;
  insert into public.event_log (event_type, entity_type, entity_id, actor_id, payload)
  values ('product_cost_saved', 'catalog_product', p_product_id::text, v_uid, jsonb_build_object('version', v_ver, 'cost_id', v_cost_id));
  return v_cost_id;
end; $$;
grant execute on function public.save_product_cost(bigint, jsonb, numeric, numeric, jsonb, text) to authenticated;
