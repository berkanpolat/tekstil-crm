-- =====================================================================
-- P4B.8 — Ürün satış fiyatı (tek-tuş teklif). Maliyeti SECURITY DEFINER ile okur ama SADECE
-- fiyatı döner → costs.view YETKİSİ OLMAYAN satışçı maliyeti görmeden fiyat alır (sızıntı yok).
-- Marj aralık mantığı: min_quantity ≤ adet olan en büyük kademe; ürüne özel marj ezer.
-- Fiyat = birim maliyet(USD) × (1 + marj/100). Kumaş adı reçeteden (teklife otomatik).
-- =====================================================================
create or replace function public.product_price(p_product_id bigint, p_quantity int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_cost_usd numeric; v_custom numeric; v_margin numeric; v_fabric text; v_can boolean := public.has_permission('costs.view');
begin
  select total_cost_usd into v_cost_usd from public.product_costs where product_id = p_product_id and is_current;
  select custom_margin_percent into v_custom from public.catalog_products where id = p_product_id;
  if v_cost_usd is null then return jsonb_build_object('has_cost', false); end if;

  if v_custom is not null then
    v_margin := v_custom;
  else
    select margin_percent into v_margin from public.margin_tiers
      where is_active and min_quantity <= greatest(p_quantity, 0) order by min_quantity desc limit 1;
    if v_margin is null then  -- adet en küçük kademenin altında → en küçük kademe
      select margin_percent into v_margin from public.margin_tiers where is_active order by min_quantity asc limit 1;
    end if;
    v_margin := coalesce(v_margin, coalesce((select (value #>> '{}')::numeric from public.settings where key='pricing.default_margin_percent'), 25));
  end if;

  select fabric_name into v_fabric from public.product_cost_items
    where cost_id = (select id from public.product_costs where product_id = p_product_id and is_current)
      and item_type = 'kumas' and fabric_name is not null and length(trim(fabric_name)) > 0
    order by sort_order limit 1;

  -- SIZINTI KORUMASI: unit_price + fabric HERKESE; unit_cost + margin YALNIZCA costs.view'e.
  return jsonb_build_object(
    'has_cost', true,
    'unit_price_usd', round(v_cost_usd * (1 + v_margin/100), 2),
    'fabric_name', coalesce(v_fabric, ''),
    'margin_percent', case when v_can then v_margin else null end,
    'unit_cost_usd', case when v_can then v_cost_usd else null end
  );
end; $$;
grant execute on function public.product_price(bigint, integer) to authenticated;
