-- Düzeltme turu · madde 6 (yan) — P7 yönetici fonksiyonları 'aktif operasyon'
-- filtresini YANLIŞ kolonla (request_status_id) yapıyordu; doğru kolon stage_id
-- (operation_stages.is_terminal). Aksi halde tamamlanan/iptal ops listede kalır.
CREATE OR REPLACE FUNCTION public.manager_interventions()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fin boolean := public.has_permission('finance.view');
  v jsonb;
begin
  perform metrics.guard(null);   -- reports.view şart
  select coalesce(jsonb_agg(x order by ord), '[]'::jsonb) into v from (
    select 1 ord, 'sla_gecti' key, 'Teklif süresi geçen talep' label, '/talepler' href,
      (select count(*) from operations o where o.deleted_at is null and o.cancelled_at is null and o.stage_id not in (select id from public.operation_stages where is_terminal)
        and o.sla_deadline < now() and not exists (select 1 from quotes q where q.operation_id=o.id and q.deleted_at is null)) cnt
    union all
    select 2, 'cevap_36', '36 saati aşan cevapsız teklif', '/teklifler',
      (select count(*) from quotes q join operations o on o.id=q.operation_id
        where q.deleted_at is null and q.responded_at is null and q.rejection_reason_id is null and q.created_at < now()-interval '36 hours'
        and o.deleted_at is null and o.cancelled_at is null and o.stage_id not in (select id from public.operation_stages where is_terminal))
    union all
    select 3, 'sahipsiz', 'Sahipsiz talep (havuz)', '/talepler',
      (select count(*) from operations o where o.deleted_at is null and o.cancelled_at is null and o.stage_id not in (select id from public.operation_stages where is_terminal)
        and o.owner_id is null and not exists (select 1 from quotes q where q.operation_id=o.id and q.deleted_at is null))
    union all
    select 4, 'termin_yakin', 'Termine yaklaşan üretim', '/siparisler',
      (select count(*) from orders ord join operations o on o.id=ord.operation_id
        join order_statuses os on os.id=ord.status_id and os.key='uretimde'
        where ord.deleted_at is null and o.deleted_at is null and ord.promised_delivery is not null
        and ord.promised_delivery <= (now()+interval '3 days')::date)
    union all
    select 5, 'numune_3tur', '3. tura ulaşan numune', '/numuneler',
      (select count(*) from samples s join operations o on o.id=s.operation_id
        where s.deleted_at is null and coalesce(s.revision_round,1) >= 3
        and s.status_id not in (7,8,10,15) and o.deleted_at is null and o.cancelled_at is null)
    union all
    select 6, 'tahsilat_gecikti', 'Geciken tahsilat', '/finans',
      (case when v_fin then (select count(*) from orders ord where ord.deleted_at is null and ord.balance_overdue_at is not null) else 0 end)
  ) t(ord, key, label, href, cnt)
  cross join lateral (select jsonb_build_object('key',key,'label',label,'href',href,'count',cnt) x) j
  where cnt > 0;
  return v;
end $function$

;
CREATE OR REPLACE FUNCTION public.manager_pending_requests(p_limit integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  perform metrics.guard(null);
  select coalesce(jsonb_agg(x order by ordkey), '[]'::jsonb) into v from (
    select
      jsonb_build_object(
        'operation_id', o.id, 'code', o.code,
        'customer', coalesce(c.company_name, c.full_name),
        'category', cat.label, 'owner_name', u.full_name,
        'unowned', (o.owner_id is null),
        'sla_deadline', o.sla_deadline, 'requested_at', o.requested_at
      ) x,
      coalesce(o.sla_deadline, o.requested_at, now()) ordkey
    from operations o
      left join customers c on c.id=o.customer_id
      left join product_categories cat on cat.id=o.category_id
      left join users u on u.id=o.owner_id
    where o.deleted_at is null and o.cancelled_at is null and o.stage_id not in (select id from public.operation_stages where is_terminal)
      and not exists (select 1 from quotes q where q.operation_id=o.id and q.deleted_at is null)
    order by ordkey asc
    limit p_limit
  ) t;
  return v;
end $function$

;
CREATE OR REPLACE FUNCTION public.manager_pending_quotes(p_limit integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  perform metrics.guard(null);
  select coalesce(jsonb_agg(x order by created_at asc), '[]'::jsonb) into v from (
    select
      jsonb_build_object(
        'operation_id', o.id, 'quote_id', q.id, 'code', o.code,
        'customer', coalesce(c.company_name, c.full_name),
        'owner_name', u.full_name, 'created_at', q.created_at,
        'hours', round(extract(epoch from (now()-q.created_at))/3600)
      ) x, q.created_at
    from quotes q
      join operations o on o.id=q.operation_id
      left join customers c on c.id=o.customer_id
      left join users u on u.id=coalesce(q.created_by, o.owner_id)
    where q.deleted_at is null and q.responded_at is null and q.rejection_reason_id is null
      and o.deleted_at is null and o.cancelled_at is null and o.stage_id not in (select id from public.operation_stages where is_terminal)
    order by q.created_at asc
    limit p_limit
  ) t;
  return v;
end $function$

;
