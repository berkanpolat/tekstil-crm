-- Reklam harcaması (Faz 3): kanal × ay tutar; Genel Rapor'da CPL/CPA (yalnız reports.finance).
-- Karar: Tuna, 22 Eyl 2026.
create table if not exists public.marketing_spend (
  id bigint generated always as identity primary key,
  channel_id bigint not null references public.marketing_channels(id),
  month date not null check (month = date_trunc('month', month)::date),
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'TRY' check (currency in ('TRY','USD')),
  note text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, month)
);
alter table public.marketing_spend enable row level security;
drop policy if exists marketing_spend_select on public.marketing_spend;
create policy marketing_spend_select on public.marketing_spend for select to authenticated using (public.has_permission('reports.finance'));
drop policy if exists marketing_spend_write on public.marketing_spend;
create policy marketing_spend_write on public.marketing_spend for all to authenticated using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));
drop trigger if exists marketing_spend_touch on public.marketing_spend;
create trigger marketing_spend_touch before update on public.marketing_spend for each row execute function public.touch_updated_at();
insert into public.settings (key, value, category, description) values ('marketing.spend_currency', '"TRY"', 'reports', 'Reklam harcaması para birimi (TRY|USD)') on conflict (key) do nothing;

create or replace function metrics.metric_genel(p_from timestamptz, p_to timestamptz, p_marketing bigint default null)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  v_pf timestamptz := p_from - (p_to - p_from);
  v_tz text := public.app_timezone();
  v_haftalik boolean := (p_to - p_from) > interval '35 days';
  v_birim text;
  v_min int := coalesce((select (value #>> '{}')::int from public.settings where key = 'reports.min_rate_base'), 5);
  v_fin boolean := public.has_permission('reports.finance');
  v_para text := coalesce((select value #>> '{}' from public.settings where key = 'marketing.spend_currency'), 'TRY');
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
  -- Reklam harcaması: dönemle kesişen ay(lar), gün oranında pay (yalnız reports.finance)
  harcama as (
    select mc.key kanal_key, sum(ms.amount * (
      greatest(0, extract(epoch from (least(p_to, (ms.month + interval '1 month')::timestamptz) - greatest(p_from, ms.month::timestamptz))) / 86400.0)
      / extract(day from (ms.month + interval '1 month' - interval '1 day'))::numeric)) tutar
    from public.marketing_spend ms join public.marketing_channels mc on mc.id = ms.channel_id
    where v_fin and ms.month < p_to::date and (ms.month + interval '1 month') > p_from
    group by mc.key
  ),
  huni_rows as (
    select g.tur, g.key, g.label, g.talep,
      metrics.huni_satiri(g.key, g.label, g.talep, g.onceki, g.teklif, g.numune, g.siparis, g.reddedilen, g.bekleyen, g.gecersiz, g.ilk_yanit::numeric, g.sla_met, g.sla_missed, g.teklif_yanit::numeric)
      || case when g.tur = 'kanal' and v_fin then jsonb_build_object(
           'harcama', round(h.tutar, 2),
           'cpl', case when h.tutar is not null and g.talep > 0 then round(h.tutar / g.talep, 2) end,
           'cpa', case when h.tutar is not null and g.siparis > 0 then round(h.tutar / g.siparis, 2) end)
         else '{}'::jsonb end j
    from grp g left join harcama h on g.tur = 'kanal' and h.kanal_key = g.key
    where g.talep > 0 or g.onceki > 0
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
    'min_rate_base', v_min,
    'toplam_harcama', case when v_fin then (select round(coalesce(sum(tutar), 0), 2) from harcama) end,
    'cpl', case when v_fin and (select count(*) from cur) > 0 then (select round(coalesce(sum(tutar), 0) / (select count(*) from cur), 2) from harcama) end,
    'cpa', case when v_fin and (select count(*) filter (where has_order) from cur) > 0 then (select round(coalesce(sum(tutar), 0) / (select count(*) filter (where has_order) from cur), 2) from harcama) end,
    'harcama_para_birimi', v_para
  ) into r;
  return r;
end $$;



notify pgrst, 'reload schema';
