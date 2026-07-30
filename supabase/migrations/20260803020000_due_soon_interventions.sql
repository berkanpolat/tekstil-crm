-- =====================================================================
-- Düzeltme turu · madde 4 — YAKLAŞAN süreler müdahale listesinde.
-- Sorun: liste yalnız DOLMUŞ süreleri gösteriyordu; 4 saat kalan teklif
-- görünmüyordu. Çözüm: iki yeni "yaklaşan" (uyarı) satırı:
--   • sla_soon: SLA süresi eşik içinde dolacak talepler (teklif yok)
--   • cevap_36_soon: cevap bekleyen teklifin 36 saati eşik içinde dolacak
-- Eşik ayardan: alerts.due_soon_hours (varsayılan 8). Dolmuşlar kritik kalır.
-- Şiddet ataması UI'de (SEVERITY): sla_gecti/tahsilat=kritik, *_soon/…=uyarı, sahipsiz=bilgi.
-- =====================================================================

insert into public.settings (key, value, category, description)
values ('alerts.due_soon_hours', '8'::jsonb, 'alerts',
        'Müdahale listesinde "süresi bugün doluyor" uyarısının kaç saat önceden gösterileceği.')
on conflict (key) do nothing;

create or replace function public.manager_interventions()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_fin boolean := public.has_permission('finance.view');
  v_due int := coalesce((select (value #>> '{}')::int from settings where key='alerts.due_soon_hours'), 8);
  v_active text := 'and o.stage_id not in (select id from public.operation_stages where is_terminal)';
  v jsonb;
begin
  perform metrics.guard(null);
  select coalesce(jsonb_agg(x order by ord), '[]'::jsonb) into v from (
    -- KRİTİK: teklif süresi geçen
    select 1 ord, 'sla_gecti' key, 'Teklif süresi geçen talep' label, '/talepler' href,
      (select count(*) from operations o where o.deleted_at is null and o.cancelled_at is null and o.stage_id not in (select id from operation_stages where is_terminal)
        and o.sla_deadline < now() and not exists (select 1 from quotes q where q.operation_id=o.id and q.deleted_at is null)) cnt
    union all
    -- UYARI: süresi bugün/eşik içinde dolacak (teklif yok)
    select 2, 'sla_soon', 'Süresi yakında dolacak talep', '/talepler',
      (select count(*) from operations o where o.deleted_at is null and o.cancelled_at is null and o.stage_id not in (select id from operation_stages where is_terminal)
        and o.sla_deadline >= now() and o.sla_deadline <= now() + make_interval(hours => v_due)
        and not exists (select 1 from quotes q where q.operation_id=o.id and q.deleted_at is null))
    union all
    -- UYARI: 36 saati aşan cevapsız teklif
    select 3, 'cevap_36', '36 saati aşan cevapsız teklif', '/teklifler',
      (select count(*) from quotes q join operations o on o.id=q.operation_id
        where q.deleted_at is null and q.responded_at is null and q.rejection_reason_id is null and q.created_at < now()-interval '36 hours'
        and o.deleted_at is null and o.cancelled_at is null and o.stage_id not in (select id from operation_stages where is_terminal))
    union all
    -- UYARI: 36 saati eşik içinde dolacak cevapsız teklif
    select 4, 'cevap_36_soon', '36 saati yakında dolacak teklif', '/teklifler',
      (select count(*) from quotes q join operations o on o.id=q.operation_id
        where q.deleted_at is null and q.responded_at is null and q.rejection_reason_id is null
        and q.created_at <= now()-make_interval(hours => 36 - v_due) and q.created_at > now()-interval '36 hours'
        and o.deleted_at is null and o.cancelled_at is null and o.stage_id not in (select id from operation_stages where is_terminal))
    union all
    -- BİLGİ: sahipsiz talep (havuz)
    select 5, 'sahipsiz', 'Sahipsiz talep (havuz)', '/talepler',
      (select count(*) from operations o where o.deleted_at is null and o.cancelled_at is null and o.stage_id not in (select id from operation_stages where is_terminal)
        and o.owner_id is null and not exists (select 1 from quotes q where q.operation_id=o.id and q.deleted_at is null))
    union all
    -- UYARI: termine yaklaşan üretim
    select 6, 'termin_yakin', 'Termine yaklaşan üretim', '/siparisler',
      (select count(*) from orders ord join operations o on o.id=ord.operation_id
        join order_statuses os on os.id=ord.status_id and os.key='uretimde'
        where ord.deleted_at is null and o.deleted_at is null and ord.promised_delivery is not null
        and ord.promised_delivery <= (now()+interval '3 days')::date)
    union all
    -- UYARI: 3. tura ulaşan numune
    select 7, 'numune_3tur', '3. tura ulaşan numune', '/numuneler',
      (select count(*) from samples s join operations o on o.id=s.operation_id
        where s.deleted_at is null and coalesce(s.revision_round,1) >= 3
        and s.status_id not in (select id from sample_statuses where is_closed) and o.deleted_at is null and o.cancelled_at is null)
    union all
    -- KRİTİK: geciken tahsilat (yalnız finance.view)
    select 8, 'tahsilat_gecikti', 'Geciken tahsilat', '/finans',
      (case when v_fin then (select count(*) from orders ord where ord.deleted_at is null and ord.balance_overdue_at is not null) else 0 end)
  ) t(ord, key, label, href, cnt)
  cross join lateral (select jsonb_build_object('key',key,'label',label,'href',href,'count',cnt) x) j
  where cnt > 0;
  return v;
end $$;
