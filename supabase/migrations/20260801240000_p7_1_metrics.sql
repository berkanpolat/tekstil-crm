-- =====================================================================
-- P7.1 — Metrik altyapısı (TEK HESAP KAYNAĞI). Panel + raporlar aynı
-- fonksiyonları çağırır; sayı bir yerde farklı çıkamaz.
--   • metrics.* fonksiyonları — dönem + filtre + ÖNCEKİ dönem karşılaştırması
--   • CTE (WITH ... AS MATERIALIZED) + STABLE — Postgres optimize/önbellek edebilir
--     (temp table + VOLATILE bunu engelliyordu). Onay düzeltmesi #1.
--   • Gün/saat gruplama system.timezone (app_timezone) ile — UTC tuzağı yok
--   • Yetki: company-wide (scope null) → reports.view; başka kullanıcı → reports.view;
--     finans → finance.view. (security definer olduğundan içeride kontrol edilir.)
--   • Silinen kayıtlar (deleted_at) sayıma girmez.
--   • Para: account_transactions.amount_usd/amount_try (kur donmuş) — ham toplam yok.
-- Ek şema: operations.landing_source + operation.stage_changed olay kaydı.
-- =====================================================================

-- ---- Yeni yetkiler ----
insert into public.permissions (key, module, action, description) values
  ('reports.view',   'reports', 'view',   'Gösterge paneli yönetici katmanı + rapor sayfaları.'),
  ('reports.export', 'reports', 'export', 'Excel/PDF indirme.'),
  ('reports.finance','reports', 'finance','Finans/kârlılık raporları (finance.view ile birlikte).')
on conflict (key) do nothing;
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r, public.permissions p
  where r.key in ('owner','admin','manager') and p.key in ('reports.view','reports.export','reports.finance')
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r, public.permissions p
  where r.key = 'finance' and p.key in ('reports.view','reports.finance')
on conflict do nothing;

-- ---- operations.landing_source (source=kanal'dan AYRI; site açılış sayfası) ----
alter table public.operations add column if not exists landing_source text;
comment on column public.operations.landing_source is
  'Web sitesi açılış sayfası (tekstilas.com entegrasyonu doldurur). channel/source ile karıştırma.';

-- ---- Aşama değişimi olay kaydı (rapor + zaman çizelgesi) ----
create or replace function public.operations_log_stage_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_from text; v_to text;
begin
  if new.stage_id is distinct from old.stage_id then
    select key into v_from from public.operation_stages where id = old.stage_id;
    select key into v_to   from public.operation_stages where id = new.stage_id;
    perform public.log_event('operation.stage_changed', 'operation', new.id::text,
      jsonb_build_object('from', v_from, 'to', v_to), now());
  end if;
  return null;
end; $$;
drop trigger if exists operations_log_stage_change on public.operations;
create trigger operations_log_stage_change after update of stage_id on public.operations
  for each row execute function public.operations_log_stage_change();

-- ---- Performans index'leri ----
create index if not exists ix_interactions_occurred on public.interactions (occurred_at) where deleted_at is null;
create index if not exists ix_interactions_creator on public.interactions (created_by, occurred_at) where deleted_at is null;
create index if not exists ix_operations_requested on public.operations (requested_at) where deleted_at is null;
create index if not exists ix_operations_owner on public.operations (owner_id) where deleted_at is null;
create index if not exists ix_quotes_created on public.quotes (operation_id, created_at) where deleted_at is null;
create index if not exists ix_samples_created on public.samples (created_at) where deleted_at is null;
create index if not exists ix_orders_orderdate on public.orders (order_date) where deleted_at is null;
create index if not exists ix_acctx_occurred on public.account_transactions (occurred_at, source_type, direction) where deleted_at is null;
create index if not exists ix_leads_created on public.leads (created_at) where deleted_at is null;
create index if not exists ix_eventlog_op_stage on public.event_log (entity_id) where event_type = 'operation.stage_changed';

-- =====================================================================
-- metrics şeması + yardımcılar
-- =====================================================================
create schema if not exists metrics;
grant usage on schema metrics to authenticated;

create or replace function metrics.pct(cur numeric, prev numeric)
returns numeric language sql immutable as $$
  select case when prev is null or prev = 0 then null else round(((cur - prev) / prev) * 100, 1) end;
$$;

create or replace function metrics.guard(p_scope uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_scope is null and not public.has_permission('reports.view') then
    raise exception 'Rapor görüntüleme yetkisi gerekli.' using errcode = '42501';
  elsif p_scope is not null and p_scope <> auth.uid() and not public.has_permission('reports.view') then
    raise exception 'Başka kullanıcının verisine erişim yetkisi yok.' using errcode = '42501';
  end if;
end; $$;

-- =====================================================================
-- metric_interactions
-- =====================================================================
create or replace function metrics.metric_interactions(p_from timestamptz, p_to timestamptz, p_scope_user uuid default null, p_channel bigint default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_pf timestamptz := p_from - (p_to - p_from); v_tz text := public.app_timezone(); r jsonb;
begin
  perform metrics.guard(p_scope_user);
  with base as materialized (
    select i.channel_id, i.outcome_id, i.occurred_at from public.interactions i
    where i.deleted_at is null and i.occurred_at >= p_from and i.occurred_at < p_to
      and (p_scope_user is null or i.created_by = p_scope_user)
      and (p_channel is null or i.channel_id = p_channel)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'prev_total', (select count(*) from public.interactions i where i.deleted_at is null and i.occurred_at >= v_pf and i.occurred_at < p_from and (p_scope_user is null or i.created_by = p_scope_user) and (p_channel is null or i.channel_id = p_channel)),
    'positive_rate', (select case when count(*)=0 then 0 else round(100.0*count(*) filter (where o.is_positive)/count(*),1) end from base b left join public.interaction_outcomes o on o.id=b.outcome_id),
    'by_channel', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(ch.label,'—'),'count',c) order by c desc),'[]') from (select channel_id,count(*) c from base group by 1) t left join public.interaction_channels ch on ch.id=t.channel_id),
    'by_outcome', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(o.label,'—'),'count',c) order by c desc),'[]') from (select outcome_id,count(*) c from base group by 1) t left join public.interaction_outcomes o on o.id=t.outcome_id),
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour',h,'count',c) order by h),'[]') from (select extract(hour from occurred_at at time zone v_tz)::int h,count(*) c from base group by 1) x)
  ) into r;
  return r || jsonb_build_object('change_pct', metrics.pct((r->>'total')::numeric, (r->>'prev_total')::numeric));
end; $$;

-- =====================================================================
-- metric_requests + "24 saat sözü"
--   PAYDA = dönem içi açılan + SLA süresi DOLMUŞ talepler (deadline < now()).
--   met = zamanında teklif; missed = deadline geçti teklif yok/geç; pending = deadline dolmadı.
--   sla_rate = met / (met + missed).  (Onay düzeltmesi #2)
-- =====================================================================
create or replace function metrics.metric_requests(p_from timestamptz, p_to timestamptz, p_scope_user uuid default null, p_channel bigint default null, p_category bigint default null, p_province bigint default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_pf timestamptz := p_from - (p_to - p_from); v_tz text := public.app_timezone(); r jsonb;
begin
  perform metrics.guard(p_scope_user);
  with base as materialized (
    select o.channel_id, o.category_id, o.province_id, o.sla_deadline, o.landing_source,
           coalesce(o.requested_at, o.created_at) as req_at,
           (select min(q.created_at) from public.quotes q where q.operation_id=o.id and q.deleted_at is null) as first_quote_at
    from public.operations o
    where o.deleted_at is null and coalesce(o.requested_at,o.created_at) >= p_from and coalesce(o.requested_at,o.created_at) < p_to
      and (p_scope_user is null or o.owner_id = p_scope_user)
      and (p_channel is null or o.channel_id = p_channel)
      and (p_category is null or o.category_id = p_category or o.type_id = p_category)
      and (p_province is null or o.province_id = p_province)
  ),
  sla as (
    select
      count(*) filter (where sla_deadline is not null and first_quote_at is not null and first_quote_at <= sla_deadline) met,
      count(*) filter (where sla_deadline is not null and sla_deadline < now() and (first_quote_at is null or first_quote_at > sla_deadline)) missed,
      count(*) filter (where sla_deadline is not null and sla_deadline >= now() and (first_quote_at is null or first_quote_at > sla_deadline)) pending
    from base
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'prev_total', (select count(*) from public.operations o where o.deleted_at is null and coalesce(o.requested_at,o.created_at) >= v_pf and coalesce(o.requested_at,o.created_at) < p_from and (p_scope_user is null or o.owner_id=p_scope_user) and (p_channel is null or o.channel_id=p_channel) and (p_category is null or o.category_id=p_category or o.type_id=p_category) and (p_province is null or o.province_id=p_province)),
    'sla_met_count', (select met from sla),
    'sla_missed_count', (select missed from sla),
    'sla_pending_count', (select pending from sla),
    'sla_rate', (select case when (met+missed)=0 then null else round(100.0*met/(met+missed),1) end from sla),
    'avg_response_hours', (select round(avg(extract(epoch from (first_quote_at - req_at))/3600)::numeric,1) from base where first_quote_at is not null),
    'by_channel', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(ch.label,'—'),'count',c) order by c desc),'[]') from (select channel_id,count(*) c from base group by 1) t left join public.request_channels ch on ch.id=t.channel_id),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(pc.label,'—'),'count',c) order by c desc),'[]') from (select category_id,count(*) c from base group by 1) t left join public.product_categories pc on pc.id=t.category_id),
    'by_city', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(pv.name,'—'),'count',c) order by c desc),'[]') from (select province_id,count(*) c from base group by 1) t left join public.provinces pv on pv.id=t.province_id),
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour',h,'count',c) order by h),'[]') from (select extract(hour from req_at at time zone v_tz)::int h,count(*) c from base group by 1) x),
    'by_landing', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(landing_source,'—'),'count',c) order by c desc),'[]') from (select landing_source,count(*) c from base where landing_source is not null group by 1) x)
  ) into r;
  return r || jsonb_build_object('change_pct', metrics.pct((r->>'total')::numeric, (r->>'prev_total')::numeric));
end; $$;

-- =====================================================================
-- metric_funnel (operasyon bazlı; her aşamaya ULAŞAN benzersiz operasyon)
-- =====================================================================
create or replace function metrics.metric_funnel(p_from timestamptz, p_to timestamptz, p_scope_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
    where o.deleted_at is null and coalesce(o.requested_at,o.created_at) >= p_from and coalesce(o.requested_at,o.created_at) < p_to
      and (p_scope_user is null or o.owner_id = p_scope_user)
  ) b;
  return jsonb_build_object(
    'requests', v_req, 'quotes', v_q, 'samples', v_s, 'orders', v_o,
    'conversion_rates', jsonb_build_array(
      jsonb_build_object('step','talep→teklif','rate', case when v_req=0 then null else round(100.0*v_q/v_req,1) end),
      jsonb_build_object('step','teklif→numune','rate', case when v_q=0 then null else round(100.0*v_s/v_q,1) end),
      jsonb_build_object('step','numune→sipariş','rate', case when v_s=0 then null else round(100.0*v_o/v_s,1) end),
      jsonb_build_object('step','talep→sipariş','rate', case when v_req=0 then null else round(100.0*v_o/v_req,1) end))
  );
end; $$;

-- =====================================================================
-- metric_quotes
-- =====================================================================
create or replace function metrics.metric_quotes(p_from timestamptz, p_to timestamptz, p_scope_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_pf timestamptz := p_from - (p_to - p_from); r jsonb;
begin
  perform metrics.guard(p_scope_user);
  with base as materialized (
    select q.rejection_reason_id, q.responded_at, q.created_at, s.key status_key
    from public.quotes q
    left join public.quote_statuses s on s.id=q.status_id
    join public.operations o on o.id=q.operation_id
    where q.deleted_at is null and q.created_at >= p_from and q.created_at < p_to
      and (p_scope_user is null or coalesce(q.created_by,o.owner_id) = p_scope_user)
  )
  select jsonb_build_object(
    'sent', (select count(*) from base),
    'prev_sent', (select count(*) from public.quotes q where q.deleted_at is null and q.created_at >= v_pf and q.created_at < p_from and (p_scope_user is null or q.created_by = p_scope_user)),
    'accepted', (select count(*) from base where status_key in ('kabul_edildi','numune_asamasina_gecildi')),
    'rejected', (select count(*) from base where status_key in ('reddedildi','olumsuz','iptal_edildi')),
    'pending', (select count(*) from base where coalesce(status_key,'') not in ('kabul_edildi','numune_asamasina_gecildi','reddedildi','olumsuz','iptal_edildi','suresi_doldu')),
    'avg_response_hours', (select round(avg(extract(epoch from (responded_at - created_at))/3600)::numeric,1) from base where responded_at is not null),
    'by_rejection_reason', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(rr.label,'—'),'count',c) order by c desc),'[]') from (select rejection_reason_id,count(*) c from base where rejection_reason_id is not null group by 1) t left join public.quote_rejection_reasons rr on rr.id=t.rejection_reason_id)
  ) into r;
  return r || jsonb_build_object('change_pct', metrics.pct((r->>'sent')::numeric, (r->>'prev_sent')::numeric));
end; $$;

-- =====================================================================
-- metric_samples
-- =====================================================================
create or replace function metrics.metric_samples(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform metrics.guard(null);
  with base as materialized (
    select sm.revision_round, sm.approved_at, sm.created_at, st.label status_label
    from public.samples sm left join public.sample_statuses st on st.id=sm.status_id
    where sm.deleted_at is null and sm.created_at >= p_from and sm.created_at < p_to
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'by_status', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(status_label,'—'),'count',c) order by c desc),'[]') from (select status_label,count(*) c from base group by 1) x),
    'by_revision_round', (select coalesce(jsonb_agg(jsonb_build_object('round', revision_round,'count',c) order by revision_round),'[]') from (select revision_round,count(*) c from base group by 1) x),
    'avg_rounds', (select round(avg(revision_round)::numeric,2) from base),
    'avg_days_to_approval', (select round(avg(extract(epoch from (approved_at - created_at))/86400)::numeric,1) from base where approved_at is not null),
    'three_plus_count', (select count(*) from base where revision_round >= 3)
  ) into r;
  return r;
end; $$;

-- =====================================================================
-- metric_orders
-- =====================================================================
create or replace function metrics.metric_orders(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform metrics.guard(null);
  with base as materialized (
    select o.actual_delivery, o.promised_delivery, o.order_date, st.key status_key, st.label status_label
    from public.orders o left join public.order_statuses st on st.id=o.status_id
    where o.deleted_at is null and o.order_date >= (p_from at time zone public.app_timezone())::date and o.order_date < (p_to at time zone public.app_timezone())::date
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'by_status', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(status_label,'—'),'count',c) order by c desc),'[]') from (select status_label,count(*) c from base group by 1) x),
    'on_time_count', (select count(*) from base where actual_delivery is not null and promised_delivery is not null and actual_delivery <= promised_delivery),
    'late_count', (select count(*) from base where actual_delivery is not null and promised_delivery is not null and actual_delivery > promised_delivery),
    'on_time_rate', (select case when count(*) filter (where actual_delivery is not null and promised_delivery is not null)=0 then null else round(100.0*count(*) filter (where actual_delivery is not null and promised_delivery is not null and actual_delivery<=promised_delivery)/count(*) filter (where actual_delivery is not null and promised_delivery is not null),1) end from base),
    'avg_production_days', (select round(avg(actual_delivery - order_date)::numeric,1) from base where actual_delivery is not null),
    'cancelled_count', (select count(*) from base where status_key='iptal_edildi')
  ) into r;
  return r;
end; $$;

-- =====================================================================
-- metric_finance (finance.view ŞART; para kur-donmuş amount_usd/try)
-- =====================================================================
create or replace function metrics.metric_finance(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_tz text := public.app_timezone();
begin
  if not public.has_permission('finance.view') then raise exception 'Finans görüntüleme yetkisi gerekli.' using errcode='42501'; end if;
  return jsonb_build_object(
    'revenue_usd', (select coalesce(sum(amount_usd),0) from public.account_transactions where deleted_at is null and direction='borc' and source_type='siparis' and occurred_at>=p_from and occurred_at<p_to),
    'revenue_try', (select coalesce(sum(amount_try),0) from public.account_transactions where deleted_at is null and direction='borc' and source_type='siparis' and occurred_at>=p_from and occurred_at<p_to),
    'collected_usd', (select coalesce(sum(amount_usd),0) from public.account_transactions where deleted_at is null and direction='alacak' and source_type='odeme' and occurred_at>=p_from and occurred_at<p_to),
    'outstanding_usd', (select coalesce(sum(case when direction='borc' then amount_usd else -amount_usd end),0) from public.account_transactions where deleted_at is null),
    'overdue_usd', (select coalesce(sum(t.amount_usd),0) from public.account_transactions t join public.orders o on o.id=t.source_id and t.source_type='siparis' where t.deleted_at is null and t.direction='borc' and o.balance_overdue_at is not null and o.deleted_at is null),
    'by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'revenue_usd', ru, 'revenue_try', rt) order by m),'[]') from (
       select to_char(date_trunc('month', occurred_at at time zone v_tz),'YYYY-MM') m, sum(amount_usd) ru, sum(amount_try) rt
       from public.account_transactions where deleted_at is null and direction='borc' and source_type='siparis' and occurred_at>=p_from and occurred_at<p_to group by 1) x)
  );
end; $$;

-- =====================================================================
-- metric_employees (performans — reports.view içinden)
-- =====================================================================
create or replace function metrics.metric_employees(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform metrics.guard(null);
  return (select coalesce(jsonb_agg(to_jsonb(e) order by e.quotes_sent desc),'[]') from (
    select u.id user_id, u.full_name name,
      (select count(*) from public.interactions i where i.created_by=u.id and i.deleted_at is null and i.occurred_at>=p_from and i.occurred_at<p_to) interactions,
      (select count(*) from public.operations o where o.owner_id=u.id and o.deleted_at is null and coalesce(o.requested_at,o.created_at)>=p_from and coalesce(o.requested_at,o.created_at)<p_to) requests_handled,
      (select count(*) from public.quotes q where q.created_by=u.id and q.deleted_at is null and q.created_at>=p_from and q.created_at<p_to) quotes_sent,
      (select count(*) from public.quotes q join public.quote_statuses s on s.id=q.status_id where q.created_by=u.id and q.deleted_at is null and q.created_at>=p_from and q.created_at<p_to and s.key in ('kabul_edildi','numune_asamasina_gecildi')) quotes_accepted,
      (select count(*) from public.open_file_snoozes sn where sn.snoozed_by=u.id and sn.created_at>=p_from and sn.created_at<p_to) snooze_count,
      (select round(avg(extract(epoch from (q.responded_at-q.created_at))/3600)::numeric,1) from public.quotes q where q.created_by=u.id and q.deleted_at is null and q.responded_at is not null and q.created_at>=p_from and q.created_at<p_to) avg_response_hours,
      (select case when (select count(*) from public.quotes q where q.created_by=u.id and q.deleted_at is null and q.created_at>=p_from and q.created_at<p_to)=0 then null
        else round(100.0*(select count(*) from public.quotes q join public.quote_statuses s on s.id=q.status_id where q.created_by=u.id and q.deleted_at is null and q.created_at>=p_from and q.created_at<p_to and s.key in ('kabul_edildi','numune_asamasina_gecildi'))
          /(select count(*) from public.quotes q where q.created_by=u.id and q.deleted_at is null and q.created_at>=p_from and q.created_at<p_to),1) end) conversion_rate
    from public.users u where u.is_active and u.deleted_at is null
  ) e where (e.interactions>0 or e.requests_handled>0 or e.quotes_sent>0));
end; $$;

-- =====================================================================
-- metric_leads
-- =====================================================================
create or replace function metrics.metric_leads(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform metrics.guard(null);
  with base as materialized (
    select l.source_id, l.city, l.last_interaction_at, l.converted_customer_id, ls.key status_key, ls.label status_label
    from public.leads l left join public.lead_statuses ls on ls.id=l.status_id
    where l.deleted_at is null and l.created_at >= p_from and l.created_at < p_to
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'contacted', (select count(*) from base where last_interaction_at is not null or status_key <> 'yeni'),
    'uncontacted', (select count(*) from base where last_interaction_at is null and status_key = 'yeni'),
    'converted', (select count(*) from base where converted_customer_id is not null),
    'by_source', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(src.label,'—'),'count',c) order by c desc),'[]') from (select source_id,count(*) c from base group by 1) t left join public.lead_sources src on src.id=t.source_id),
    'by_city', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(nullif(city,''),'—'),'count',c) order by c desc),'[]') from (select city,count(*) c from base group by 1) x),
    'by_status', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(status_label,'—'),'count',c) order by c desc),'[]') from (select status_label,count(*) c from base group by 1) x)
  ) into r;
  return r || jsonb_build_object('contact_rate', case when (r->>'total')::int=0 then null else round(100.0*(r->>'contacted')::int/(r->>'total')::int,1) end);
end; $$;

-- =====================================================================
-- metric_stage_durations (kilometre taşı olaylarından — geçmişle uyumlu)
-- =====================================================================
create or replace function metrics.metric_stage_durations(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform metrics.guard(null);
  with m as materialized (
    select coalesce(o.requested_at,o.created_at) t_req,
      (select min(q.created_at) from public.quotes q where q.operation_id=o.id and q.deleted_at is null) t_quote,
      (select min(s.created_at) from public.samples s where s.operation_id=o.id and s.deleted_at is null) t_sample,
      (select min(r2.created_at) from public.orders r2 where r2.operation_id=o.id and r2.deleted_at is null) t_order,
      (select min(r2.shipped_at) from public.orders r2 where r2.operation_id=o.id and r2.deleted_at is null) t_ship
    from public.operations o
    where o.deleted_at is null and coalesce(o.requested_at,o.created_at) >= p_from and coalesce(o.requested_at,o.created_at) < p_to
  )
  select coalesce(jsonb_agg(jsonb_build_object('stage', stage, 'avg_days', avg_days, 'median_days', median_days, 'count', cnt) order by ord),'[]') into r from (
    select 1 ord, 'Talep→Teklif' stage, round(avg(extract(epoch from (t_quote-t_req))/86400)::numeric,1) avg_days,
      round((percentile_cont(0.5) within group (order by extract(epoch from (t_quote-t_req))/86400))::numeric,1) median_days,
      count(*) filter (where t_quote is not null) cnt from m where t_quote is not null
    union all
    select 2, 'Teklif→Numune', round(avg(extract(epoch from (t_sample-t_quote))/86400)::numeric,1),
      round((percentile_cont(0.5) within group (order by extract(epoch from (t_sample-t_quote))/86400))::numeric,1),
      count(*) filter (where t_sample is not null and t_quote is not null) from m where t_sample is not null and t_quote is not null
    union all
    select 3, 'Numune→Sipariş', round(avg(extract(epoch from (t_order-t_sample))/86400)::numeric,1),
      round((percentile_cont(0.5) within group (order by extract(epoch from (t_order-t_sample))/86400))::numeric,1),
      count(*) filter (where t_order is not null and t_sample is not null) from m where t_order is not null and t_sample is not null
    union all
    select 4, 'Sipariş→Sevk', round(avg(extract(epoch from (t_ship-t_order))/86400)::numeric,1),
      round((percentile_cont(0.5) within group (order by extract(epoch from (t_ship-t_order))/86400))::numeric,1),
      count(*) filter (where t_ship is not null and t_order is not null) from m where t_ship is not null and t_order is not null
  ) x;
  return r;
end; $$;

grant execute on all functions in schema metrics to authenticated;
