-- Kâr marjı kademeleri + serbest marj + genel rapor metriği. Karar: Tuna, 21 Eyl 2026.
-- Kademeler: MOQ 50 → %40 · 51–250 → %30 · 251+ → %20 (tam 250 adet %30).

update public.margin_tiers set min_quantity = 50,  margin_percent = 40 where id = 1;
update public.margin_tiers set min_quantity = 51,  margin_percent = 30 where id = 2;
update public.margin_tiers set min_quantity = 251, margin_percent = 20 where id = 3;

-- product_price: 3. parametre p_margin (teklifte elle girilen oran). Eski 2 parametreli imza kaldırılır
-- (PostgREST aynı adlı iki fonksiyonda belirsizlik verir); varsayılanlı yeni imza eski çağrıları karşılar.
drop function if exists public.product_price(bigint, integer);
CREATE OR REPLACE FUNCTION public.product_price(p_product_id bigint, p_quantity integer, p_margin numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_cost_usd numeric; v_custom numeric; v_margin numeric; v_fabric text; v_can boolean := public.has_permission('costs.view');
begin
  select total_cost_usd into v_cost_usd from public.product_costs where product_id = p_product_id and is_current;
  select custom_margin_percent into v_custom from public.catalog_products where id = p_product_id;
  if v_cost_usd is null then return jsonb_build_object('has_cost', false); end if;

  -- Öncelik: teklifte elle girilen oran (p_margin) > ürüne özel oran > adet kademesi > varsayılan
  if p_margin is not null and p_margin >= 0 then
    v_margin := p_margin;
  elsif v_custom is not null then
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
end; $function$
;

-- build_draft_quote: sabit %40 yerine adet kademesi
CREATE OR REPLACE FUNCTION public.build_draft_quote(p_operation_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_qty int := coalesce((select (value#>>'{}')::int from settings where key='intake.draft_quote_qty'), 50);
  v_margin numeric;
  v_lines jsonb := '[]'::jsonb; v_missing int := 0; v_total numeric := 0; v_doc_id bigint; v_dt bigint;
  r record; v_cost numeric; v_price numeric;
begin
  -- Marj: adet kademesinden (Ayarlar → Fiyatlandırma); kademe yoksa eski ayar/40
  select margin_percent into v_margin from margin_tiers where is_active and min_quantity <= v_qty order by min_quantity desc limit 1;
  v_margin := coalesce(v_margin, (select (value#>>'{}')::numeric from settings where key='intake.draft_margin_percent'), 40);
  for r in
    select oci.catalog_product_id, coalesce(oci.label, oci.catalog_product_code) label, oci.catalog_product_code code
    from operation_catalog_items oci where oci.operation_id = p_operation_id
  loop
    select total_cost_usd into v_cost from product_costs
      where product_id = r.catalog_product_id and is_current limit 1;
    if v_cost is null then
      v_missing := v_missing + 1;
      v_lines := v_lines || jsonb_build_object('urun', r.label, 'kod', r.code, 'adet', v_qty, 'birim_fiyat', null, 'tutar', null, 'maliyet_eksik', true);
    else
      v_price := round(v_cost * (1 + v_margin/100), 2);
      v_total := v_total + v_price * v_qty;
      v_lines := v_lines || jsonb_build_object('urun', r.label, 'kod', r.code, 'adet', v_qty, 'birim_fiyat', v_price, 'tutar', round(v_price*v_qty,2), 'maliyet_eksik', false);
    end if;
  end loop;

  select id into v_dt from document_types where key='fiyat_teklifi';
  insert into documents (operation_id, document_type_id, is_draft, data)
  values (p_operation_id, v_dt, true, jsonb_build_object(
    'kaynak','katalog_otomatik','adet_kademesi', v_qty, 'satirlar', v_lines,
    'toplam_usd', round(v_total,2), 'maliyeti_eksik_urun', v_missing, 'para_birimi','USD'))
  returning id into v_doc_id;
  return v_doc_id;
end $function$
;

-- Genel rapor: tek sayfa için talep bazlı sayılar (durum modeli operations üzerinden).
create or replace function metrics.metric_genel(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare r jsonb;
begin
  perform metrics.guard(null);
  with base as materialized (
    select o.id, o.province_id, o.cancelled_at, o.cancellation_reason_id, o.product_source,
           s.key stage_key, s.sort_order stage_sort, ss.key status_key,
           coalesce(o.requested_at, o.created_at) req_at,
           exists (select 1 from public.samples x where x.operation_id = o.id and x.deleted_at is null) has_sample,
           exists (select 1 from public.orders x where x.operation_id = o.id and x.deleted_at is null) has_order,
           exists (select 1 from public.quotes q where q.operation_id = o.id and q.deleted_at is null and q.sent_at is not null) quote_sent
    from public.operations o
    left join public.operation_stages s on s.id = o.stage_id
    left join public.stage_statuses ss on ss.id = o.status_id
    where o.deleted_at is null and coalesce(o.requested_at, o.created_at) >= p_from and coalesce(o.requested_at, o.created_at) < p_to
  ),
  b2 as (
    select *,
      -- teklif verildi: durum "iletildi" ya da teklif aşamasını geçmiş ya da gönderilmiş teklif var
      (status_key = 'st_teklif_iletildi' or stage_sort > 2 or quote_sent) teklif_verildi,
      -- reddedildi: iptal (sebepli) ya da eski "teklif_reddedildi" aşaması ya da kapanış-red durumu
      (cancelled_at is not null or stage_key = 'teklif_reddedildi' or status_key = 'st_kap_reddedildi') reddedildi,
      -- kabul: numune ya da sonrasına ulaşmış
      (stage_key in ('numune','siparis','uretim','teslimat') or (stage_key = 'tamamlandi' and status_key <> 'st_kap_reddedildi' and cancelled_at is null) or has_sample or has_order) kabul
    from base
  ),
  sebep as (
    select b.id, b.province_id, coalesce(cr.label, case when b.stage_key = 'teklif_reddedildi' or b.status_key = 'st_kap_reddedildi' then 'Teklif reddedildi' else 'Sebep girilmemiş' end) sebep
    from b2 b left join public.cancellation_reasons cr on cr.id = b.cancellation_reason_id where b.reddedildi
  )
  select jsonb_build_object(
    'talep', (select count(*) from b2),
    'teklif_verilen', (select count(*) filter (where teklif_verildi) from b2),
    'teklif_verilmeyen', (select count(*) filter (where not teklif_verildi and not reddedildi) from b2),
    'reddedilen', (select count(*) filter (where reddedildi) from b2),
    'kabul', (select count(*) filter (where kabul) from b2),
    'numune', (select count(*) filter (where has_sample) from b2),
    'siparis', (select count(*) filter (where has_order) from b2),
    'numune_sayisi', (select count(*) from public.samples x where x.deleted_at is null and x.created_at >= p_from and x.created_at < p_to),
    'siparis_sayisi', (select count(*) from public.orders x where x.deleted_at is null and x.created_at >= p_from and x.created_at < p_to),
    'teklif_numune_orani', (select case when count(*) filter (where teklif_verildi) = 0 then null else round(100.0 * count(*) filter (where has_sample or kabul) / count(*) filter (where teklif_verildi), 1) end from b2),
    'numune_siparis_orani', (select case when count(*) filter (where has_sample) = 0 then null else round(100.0 * count(*) filter (where has_sample and has_order) / count(*) filter (where has_sample), 1) end from b2),
    'red_sebepleri', (select coalesce(jsonb_agg(jsonb_build_object('label', sebep, 'count', c) order by c desc), '[]') from (select sebep, count(*) c from sebep group by 1) t),
    'red_sebebi_il', (select coalesce(jsonb_agg(jsonb_build_object('sebep', sebep, 'il', il, 'count', c) order by c desc), '[]') from (select s.sebep, coalesce(pv.name,'—') il, count(*) c from sebep s left join public.provinces pv on pv.id = s.province_id group by 1,2) t),
    'red_il', (select coalesce(jsonb_agg(jsonb_build_object('label', il, 'count', c) order by c desc), '[]') from (select coalesce(pv.name,'—') il, count(*) c from sebep s left join public.provinces pv on pv.id = s.province_id group by 1) t),
    'kabul_il', (select coalesce(jsonb_agg(jsonb_build_object('label', il, 'count', c) order by c desc), '[]') from (select coalesce(pv.name,'—') il, count(*) c from b2 b left join public.provinces pv on pv.id = b.province_id where b.kabul group by 1) t),
    'huni', jsonb_build_array(
      jsonb_build_object('label','Talep','value',(select count(*) from b2)),
      jsonb_build_object('label','Teklif verildi','value',(select count(*) filter (where teklif_verildi) from b2)),
      jsonb_build_object('label','Kabul / numune','value',(select count(*) filter (where kabul) from b2)),
      jsonb_build_object('label','Sipariş','value',(select count(*) filter (where has_order) from b2)))
  ) into r;
  return r;
end $$;
grant execute on function metrics.metric_genel(timestamptz, timestamptz) to authenticated;
