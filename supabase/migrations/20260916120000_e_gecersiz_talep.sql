-- =====================================================================
-- PAKET E · C — Geçersiz talep işaretleme + rapor ayrımı
-- =====================================================================
-- Sorun: "İptal (kayıp)" ile "geçersiz (sahte/segment dışı)" ayrımı yok; sahte
--   talepler dönüşüm oranını kirletiyor. Geçersiz = hiç gerçek fırsat değildi.
-- Çözüm: cancellation_reasons.is_invalid bayrağı + 2 geçersiz sebep. Geçersiz
--   işaretleme = iptal (cancelled_at) + is_invalid sebep. Raporda:
--   • dönüşüm paydasından (metric_funnel) ÇIKAR,
--   • ayrı geçersiz sayacı (metric_invalid_requests),
--   • toplam gelen talep (metric_requests.total) DEĞİŞMEZ (kaç talep geldi).
-- =====================================================================

-- 1) Bayrak + geçersiz sebepler
alter table public.cancellation_reasons add column if not exists is_invalid boolean not null default false;
comment on column public.cancellation_reasons.is_invalid is
  'true → "geçersiz" (sahte/segment dışı; hiç fırsat değildi). false → "kayıp" (gerçek fırsat, dönüşmedi).';

insert into public.cancellation_reasons (key, label, sort_order, is_invalid, is_system)
values ('sahte_talep',  'Sahte talep',                              20, true, true),
       ('segment_disi', 'Segment dışı (yapamayacağımız ürün grubu)', 21, true, true)
on conflict (key) do update set label = excluded.label, is_invalid = excluded.is_invalid;

-- 2) metric_funnel: geçersiz talepleri DÖNÜŞÜM paydasından çıkar
create or replace function metrics.metric_funnel(p_from timestamp with time zone, p_to timestamp with time zone, p_scope_user uuid default null::uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare v_req int; v_q int; v_s int; v_o int;
begin
  perform metrics.guard(p_scope_user);
  select count(*), count(*) filter (where has_q), count(*) filter (where has_s), count(*) filter (where has_o)
    into v_req, v_q, v_s, v_o
  from (
    select o.id,
      exists(select 1 from public.quotes q where q.operation_id=o.id and q.deleted_at is null) has_q,
      exists(select 1 from public.samples s where s.operation_id=o.id and s.deleted_at is null) has_s,
      exists(select 1 from public.orders r where r.operation_id=o.id and r.deleted_at is null) has_o
    from public.operations o
    left join public.cancellation_reasons cr on cr.id = o.cancellation_reason_id
    where o.deleted_at is null and coalesce(o.requested_at,o.created_at) >= p_from and coalesce(o.requested_at,o.created_at) < p_to
      and (p_scope_user is null or o.owner_id = p_scope_user)
      -- Geçersiz (iptal + is_invalid sebep) dönüşüm hesabına GİRMEZ.
      and not (o.cancelled_at is not null and coalesce(cr.is_invalid, false))
  ) b;
  return jsonb_build_object(
    'requests', v_req, 'quotes', v_q, 'samples', v_s, 'orders', v_o,
    'conversion_rates', jsonb_build_array(
      jsonb_build_object('step','talep→teklif','rate', case when v_req=0 then null else round(100.0*v_q/v_req,1) end),
      jsonb_build_object('step','teklif→numune','rate', case when v_q=0 then null else round(100.0*v_s/v_q,1) end),
      jsonb_build_object('step','numune→sipariş','rate', case when v_s=0 then null else round(100.0*v_o/v_s,1) end),
      jsonb_build_object('step','talep→sipariş','rate', case when v_req=0 then null else round(100.0*v_o/v_req,1) end))
  );
end; $function$;

-- 3) Ayrı geçersiz sayacı: toplam + sebebe göre kırılım
create or replace function metrics.metric_invalid_requests(p_from timestamp with time zone, p_to timestamp with time zone, p_scope_user uuid default null::uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare r jsonb;
begin
  perform metrics.guard(p_scope_user);
  with base as (
    select cr.label
    from public.operations o
    join public.cancellation_reasons cr on cr.id = o.cancellation_reason_id
    where o.deleted_at is null and o.cancelled_at is not null and coalesce(cr.is_invalid, false)
      and coalesce(o.requested_at,o.created_at) >= p_from and coalesce(o.requested_at,o.created_at) < p_to
      and (p_scope_user is null or o.owner_id = p_scope_user)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'by_reason', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'count', c) order by c desc), '[]')
                  from (select label, count(*) c from base group by 1) t)
  ) into r;
  return r;
end; $function$;

create or replace function public.metric_invalid_requests(p_from timestamp with time zone, p_to timestamp with time zone, p_scope_user uuid default null::uuid)
returns jsonb language sql stable
as $function$ select metrics.metric_invalid_requests(p_from, p_to, p_scope_user) $function$;
grant execute on function public.metric_invalid_requests(timestamp with time zone, timestamp with time zone, uuid) to authenticated;

notify pgrst, 'reload schema';
