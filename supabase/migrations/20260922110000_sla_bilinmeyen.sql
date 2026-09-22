-- SLA "bilinmeyen": teklif verilmiş (durum/aşama) ama CRM'de teklif kaydı olmayan talepler (21 Eyl geri yüklemesi)
-- 24 saat sözünde "kaçırdı" sayılmaz; met/missed dışında tutulur (metric_requests: sla_unknown_count).
CREATE OR REPLACE FUNCTION metrics.metric_requests(p_from timestamp with time zone, p_to timestamp with time zone, p_scope_user uuid DEFAULT NULL::uuid, p_channel bigint DEFAULT NULL::bigint, p_category bigint DEFAULT NULL::bigint, p_province bigint DEFAULT NULL::bigint, p_marketing bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_pf timestamptz := p_from - (p_to - p_from); v_tz text := public.app_timezone(); r jsonb;
begin
  perform metrics.guard(p_scope_user);
  with base as materialized (
    select o.channel_id, o.category_id, o.province_id, o.sla_deadline, o.landing_source, o.marketing_channel_id, o.product_source,
           -- teklif verilmiş (durum/aşama) ama CRM'de teklif kaydı yok → SLA bilinmez (geri yüklenen kayıtlar); met/missed dışında
           (ss.key = 'st_teklif_iletildi' or s.sort_order > 2) teklif_durumda,
           coalesce(o.requested_at, o.created_at) as req_at,
           (select min(q.created_at) from public.quotes q where q.operation_id=o.id and q.deleted_at is null) as first_quote_at
    from public.operations o
    left join public.operation_stages s on s.id = o.stage_id
    left join public.stage_statuses ss on ss.id = o.status_id
    where o.deleted_at is null and coalesce(o.requested_at,o.created_at) >= p_from and coalesce(o.requested_at,o.created_at) < p_to
      and (p_scope_user is null or o.owner_id = p_scope_user)
      and (p_channel is null or o.channel_id = p_channel)
      and (p_category is null or o.category_id = p_category or o.type_id = p_category)
      and (p_province is null or o.province_id = p_province)
      and (p_marketing is null or o.marketing_channel_id = p_marketing)
  ),
  sla as (
    select
      count(*) filter (where sla_deadline is not null and first_quote_at is not null and first_quote_at <= sla_deadline) met,
      count(*) filter (where sla_deadline is not null and sla_deadline < now() and (first_quote_at is null or first_quote_at > sla_deadline) and not (first_quote_at is null and teklif_durumda)) missed,
      count(*) filter (where sla_deadline is not null and first_quote_at is null and teklif_durumda) bilinmeyen,
      count(*) filter (where sla_deadline is not null and sla_deadline >= now() and (first_quote_at is null or first_quote_at > sla_deadline)) pending
    from base
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'prev_total', (select count(*) from public.operations o where o.deleted_at is null and coalesce(o.requested_at,o.created_at) >= v_pf and coalesce(o.requested_at,o.created_at) < p_from and (p_scope_user is null or o.owner_id=p_scope_user) and (p_channel is null or o.channel_id=p_channel) and (p_category is null or o.category_id=p_category or o.type_id=p_category) and (p_province is null or o.province_id=p_province) and (p_marketing is null or o.marketing_channel_id=p_marketing)),
    'sla_met_count', (select met from sla),
    'sla_missed_count', (select missed from sla),
    'sla_pending_count', (select pending from sla),
    'sla_unknown_count', (select bilinmeyen from sla),
    'sla_rate', (select case when (met+missed)=0 then null else round(100.0*met/(met+missed),1) end from sla),
    'avg_response_hours', (select round(avg(extract(epoch from (first_quote_at - req_at))/3600)::numeric,1) from base where first_quote_at is not null),
    'by_channel', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(ch.label,'—'),'count',c) order by c desc),'[]') from (select channel_id,count(*) c from base group by 1) t left join public.request_channels ch on ch.id=t.channel_id),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(pc.label,'—'),'count',c) order by c desc),'[]') from (select category_id,count(*) c from base group by 1) t left join public.product_categories pc on pc.id=t.category_id),
    'by_city', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(pv.name,'—'),'count',c) order by c desc),'[]') from (select province_id,count(*) c from base group by 1) t left join public.provinces pv on pv.id=t.province_id),
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour',h,'count',c) order by h),'[]') from (select extract(hour from req_at at time zone v_tz)::int h,count(*) c from base group by 1) x),
    'by_marketing', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(mc.label,'Bilinmiyor'),'key', coalesce(mc.key,'bilinmiyor'),'count',c) order by c desc),'[]') from (select marketing_channel_id,count(*) c from base group by 1) t left join public.marketing_channels mc on mc.id=t.marketing_channel_id),
    'by_product_source', (select coalesce(jsonb_agg(jsonb_build_object('label', case product_source when 'katalogdan_secim' then 'Katalogdan' when 'gorsel_yukleme' then 'Görsel / manuel ürün' else coalesce(product_source,'—') end,'count',c) order by c desc),'[]') from (select product_source,count(*) c from base group by 1) t),
    'by_dow_hour', (select coalesce(jsonb_agg(jsonb_build_object('dow',d,'hour',h,'count',c) order by d,h),'[]') from (select extract(isodow from req_at at time zone v_tz)::int d, extract(hour from req_at at time zone v_tz)::int h, count(*) c from base group by 1,2) x),
    'by_dow', (select coalesce(jsonb_agg(jsonb_build_object('dow',d,'count',c) order by d),'[]') from (select extract(isodow from req_at at time zone v_tz)::int d,count(*) c from base group by 1) x),
    'by_landing', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(landing_source,'—'),'count',c) order by c desc),'[]') from (select landing_source,count(*) c from base where landing_source is not null group by 1) x)
  ) into r;
  return r || jsonb_build_object('change_pct', metrics.pct((r->>'total')::numeric, (r->>'prev_total')::numeric));
end; $function$;

create or replace function metrics.metric_genel(p_from timestamptz, p_to timestamptz, p_marketing bigint default null)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  v_pf timestamptz := p_from - (p_to - p_from);
  v_tz text := public.app_timezone();
  v_haftalik boolean := (p_to - p_from) > interval '35 days';
  v_birim text;
  v_min int := coalesce((select (value #>> '{}')::int from public.settings where key = 'reports.min_rate_base'), 5);
  r jsonb;
begin
  perform metrics.guard(null);
  v_birim := case when v_haftalik then 'week' else 'day' end;
  with b0 as materialized (
    select o.id, (coalesce(o.requested_at, o.created_at) >= p_from) cur,
           o.marketing_channel_id, o.province_id, o.cancelled_at, o.cancellation_reason_id, o.product_source,
           s.key stage_key, s.sort_order stage_sort, ss.key status_key,
           coalesce(o.requested_at, o.created_at) req_at, o.sla_deadline,
           nullif(lower(trim(o.marketing ->> 'utm_campaign')), '') utm_campaign,
           (select min(q.created_at) from public.quotes q where q.operation_id = o.id and q.deleted_at is null) first_quote_at,
           (select min(q.sent_at) from public.quotes q where q.operation_id = o.id and q.deleted_at is null and q.sent_at is not null) first_sent_at,
           (select min(q.responded_at) from public.quotes q where q.operation_id = o.id and q.deleted_at is null and q.sent_at is not null and q.responded_at is not null) first_responded_at,
           exists (select 1 from public.samples x where x.operation_id = o.id and x.deleted_at is null) has_sample,
           exists (select 1 from public.orders x where x.operation_id = o.id and x.deleted_at is null) has_order,
           exists (select 1 from public.quotes q where q.operation_id = o.id and q.deleted_at is null and q.sent_at is not null) quote_sent,
           false gecersiz   -- KANCA: "yapılamaz/geçersiz" bayrağı gelince buraya bağlanır
    from public.operations o
    left join public.operation_stages s on s.id = o.stage_id
    left join public.stage_statuses ss on ss.id = o.status_id
    where o.deleted_at is null
      and coalesce(o.requested_at, o.created_at) >= v_pf and coalesce(o.requested_at, o.created_at) < p_to
      and (p_marketing is null or o.marketing_channel_id = p_marketing)
  ),
  b2 as materialized (
    select *,
      (status_key = 'st_teklif_iletildi' or stage_sort > 2 or quote_sent) teklif_verildi,
      (cancelled_at is not null or stage_key = 'teklif_reddedildi' or status_key = 'st_kap_reddedildi') reddedildi,
      (stage_key in ('numune','siparis','uretim','teslimat') or (stage_key = 'tamamlandi' and status_key <> 'st_kap_reddedildi' and cancelled_at is null) or has_sample or has_order) kabul
    from b0
  ),
  cur as (select * from b2 where cur),
  sebep as (
    select b.id, b.province_id, b.marketing_channel_id,
      coalesce(cr.label, case when b.stage_key = 'teklif_reddedildi' or b.status_key = 'st_kap_reddedildi' then 'Teklif reddedildi' else 'Sebep girilmemiş' end) sebep
    from cur b left join public.cancellation_reasons cr on cr.id = b.cancellation_reason_id where b.reddedildi
  ),
  grp as (
    select g.tur, g.key, g.label, g.sira,
      count(*) filter (where b.cur) talep,
      count(*) filter (where not b.cur) onceki,
      count(*) filter (where b.cur and b.teklif_verildi) teklif,
      count(*) filter (where b.cur and b.has_sample) numune,
      count(*) filter (where b.cur and b.has_order) siparis,
      count(*) filter (where b.cur and b.reddedildi) reddedilen,
      count(*) filter (where b.cur and not b.teklif_verildi and not b.reddedildi) bekleyen,
      count(*) filter (where b.cur and b.gecersiz) gecersiz,
      avg(extract(epoch from (b.first_quote_at - b.req_at)) / 3600) filter (where b.cur and b.first_quote_at is not null) ilk_yanit,
      count(*) filter (where b.cur and b.sla_deadline is not null and b.first_quote_at is not null and b.first_quote_at <= b.sla_deadline) sla_met,
      count(*) filter (where b.cur and b.sla_deadline is not null and b.sla_deadline < now() and (b.first_quote_at is null or b.first_quote_at > b.sla_deadline) and not (b.first_quote_at is null and b.teklif_verildi)) sla_missed,
      avg(extract(epoch from (b.first_responded_at - b.first_sent_at)) / 3600) filter (where b.cur and b.first_responded_at is not null) teklif_yanit
    from b2 b
    left join public.marketing_channels mc on mc.id = b.marketing_channel_id
    left join public.provinces pv on pv.id = b.province_id
    cross join lateral (values
      ('kanal',    coalesce(mc.key, 'bilinmiyor'), coalesce(mc.label, 'Bilinmiyor'), coalesce(mc.sort_order, 999)),
      ('kampanya', coalesce(mc.key, 'bilinmiyor') || '|' || coalesce(b.utm_campaign, ''), coalesce(b.utm_campaign, '(kampanya yok)'), coalesce(mc.sort_order, 999)),
      ('il',       coalesce(b.province_id::text, '0'), coalesce(pv.name, '—'), 0)
    ) g(tur, key, label, sira)
    group by g.tur, g.key, g.label, g.sira
  ),
  huni_rows as (
    select tur, key, label, talep,
      metrics.huni_satiri(key, label, talep, onceki, teklif, numune, siparis, reddedilen, bekleyen, gecersiz, ilk_yanit::numeric, sla_met, sla_missed, teklif_yanit::numeric) j
    from grp where talep > 0 or onceki > 0
  ),
  kova as (
    select row_number() over (order by d) - 1 i, d baslangic
    from generate_series(date_trunc(v_birim, p_from at time zone v_tz), (p_to at time zone v_tz) - interval '1 second',
                         case when v_haftalik then interval '1 week' else interval '1 day' end) d
  ),
  egilim as (
    select k.i, to_char(k.baslangic, 'YYYY-MM-DD') gun,
      (select count(*) from cur c where date_trunc(v_birim, c.req_at at time zone v_tz) = k.baslangic) c_cur,
      (select count(*) from b2 c where not c.cur and date_trunc(v_birim, (c.req_at + (p_from - v_pf)) at time zone v_tz) = k.baslangic) c_prev
    from kova k
  )
  select jsonb_build_object(
    'talep', (select count(*) from cur),
    'teklif_verilen', (select count(*) filter (where teklif_verildi) from cur),
    'teklif_verilmeyen', (select count(*) filter (where not teklif_verildi and not reddedildi) from cur),
    'reddedilen', (select count(*) filter (where reddedildi) from cur),
    'kabul', (select count(*) filter (where kabul) from cur),
    'numune', (select count(*) filter (where has_sample) from cur),
    'siparis', (select count(*) filter (where has_order) from cur),
    'numune_sayisi', (select count(*) from public.samples x where x.deleted_at is null and x.created_at >= p_from and x.created_at < p_to),
    'siparis_sayisi', (select count(*) from public.orders x where x.deleted_at is null and x.created_at >= p_from and x.created_at < p_to),
    'teklif_numune_orani', (select case when count(*) filter (where teklif_verildi) = 0 then null else round(100.0 * count(*) filter (where has_sample or kabul) / count(*) filter (where teklif_verildi), 1) end from cur),
    'numune_siparis_orani', (select case when count(*) filter (where has_sample) = 0 then null else round(100.0 * count(*) filter (where has_sample and has_order) / count(*) filter (where has_sample), 1) end from cur),
    'red_sebepleri', (select coalesce(jsonb_agg(jsonb_build_object('label', sebep, 'count', c) order by c desc), '[]') from (select sebep, count(*) c from sebep group by 1) t),
    'red_sebebi_il', (select coalesce(jsonb_agg(jsonb_build_object('sebep', sebep, 'il', il, 'count', c) order by c desc), '[]') from (select s.sebep, coalesce(pv.name,'—') il, count(*) c from sebep s left join public.provinces pv on pv.id = s.province_id group by 1,2) t),
    'red_il', (select coalesce(jsonb_agg(jsonb_build_object('label', il, 'count', c) order by c desc), '[]') from (select coalesce(pv.name,'—') il, count(*) c from sebep s left join public.provinces pv on pv.id = s.province_id group by 1) t),
    'kabul_il', (select coalesce(jsonb_agg(jsonb_build_object('label', il, 'count', c) order by c desc), '[]') from (select coalesce(pv.name,'—') il, count(*) c from cur b left join public.provinces pv on pv.id = b.province_id where b.kabul group by 1) t),
    'huni', jsonb_build_array(
      jsonb_build_object('label','Talep','value',(select count(*) from cur)),
      jsonb_build_object('label','Teklif verildi','value',(select count(*) filter (where teklif_verildi) from cur)),
      jsonb_build_object('label','Kabul / numune','value',(select count(*) filter (where kabul) from cur)),
      jsonb_build_object('label','Sipariş','value',(select count(*) filter (where has_order) from cur))),
    'onceki', (select jsonb_build_object(
      'talep', count(*), 'teklif_verilen', count(*) filter (where teklif_verildi), 'reddedilen', count(*) filter (where reddedildi),
      'kabul', count(*) filter (where kabul), 'numune', count(*) filter (where has_sample), 'siparis', count(*) filter (where has_order),
      'siparis_orani', case when count(*) = 0 then null else round(100.0 * count(*) filter (where has_order) / count(*), 1) end)
      from b2 where not cur),
    'ilk_yanit_saat', (select round(avg(extract(epoch from (first_quote_at - req_at)) / 3600)::numeric, 1) from cur where first_quote_at is not null),
    'teklif_yanit_saat', (select round(avg(extract(epoch from (first_responded_at - first_sent_at)) / 3600)::numeric, 1) from cur where first_responded_at is not null),
    'kanal_huni', (select coalesce(jsonb_agg(j order by talep desc, label), '[]') from huni_rows where tur = 'kanal'),
    'kampanya_huni', (select coalesce(jsonb_agg(j order by talep desc, label), '[]') from (select * from huni_rows where tur = 'kampanya' order by talep desc, label limit 30) t),
    'il_huni', (select coalesce(jsonb_agg(j order by talep desc, label), '[]') from huni_rows where tur = 'il'),
    'red_sebebi_kanal', (select coalesce(jsonb_agg(jsonb_build_object('sebep', sebep, 'kanal', kanal, 'count', c) order by c desc), '[]')
      from (select s.sebep, coalesce(mc.label, 'Bilinmiyor') kanal, count(*) c from sebep s left join public.marketing_channels mc on mc.id = s.marketing_channel_id group by 1,2) t),
    'egilim', (select coalesce(jsonb_agg(jsonb_build_object('gun', gun, 'count', c_cur, 'onceki_count', c_prev) order by i), '[]') from egilim),
    'egilim_birim', case when v_haftalik then 'hafta' else 'gun' end,
    'min_rate_base', v_min
  ) into r;
  return r;
end $$;


notify pgrst, 'reload schema';
