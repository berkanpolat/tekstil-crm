-- =====================================================================
-- Örnek veriyi TAMAMEN kaldır (seed leads/customers + tüm alt kayıt + event).
-- Gerçek verilere dokunmaz (yalnız external_source='seed'). Tekrar üretmek için
-- sonra seed-fake-leads.sql + seed-fake-customers.sql + seed-activity.sql.
-- =====================================================================
begin;

-- Alt kayıtlar (polimorfik; FK yok)
delete from public.interactions   where entity_type='lead'     and entity_id in (select id from public.leads     where external_source='seed');
delete from public.interactions   where entity_type='customer' and entity_id in (select id from public.customers where external_source='seed');
delete from public.notes          where entity_type='lead'     and entity_id in (select id from public.leads     where external_source='seed');
delete from public.notes          where entity_type='customer' and entity_id in (select id from public.customers where external_source='seed');
delete from public.entity_tags    where entity_type='lead'     and entity_id in (select id from public.leads     where external_source='seed');
delete from public.entity_tags    where entity_type='customer' and entity_id in (select id from public.customers where external_source='seed');
delete from public.contact_points where entity_type='lead'     and entity_id in (select id from public.leads     where external_source='seed');
delete from public.contact_points where entity_type='customer' and entity_id in (select id from public.customers where external_source='seed');

-- Olay akışı
delete from public.event_log where entity_type='lead'     and entity_id in (select id::text from public.leads     where external_source='seed');
delete from public.event_log where entity_type='customer' and entity_id in (select id::text from public.customers where external_source='seed');

-- Müşteri kodları
delete from public.code_registry where entity_type='customer'
  and entity_id in (select id::text from public.customers where external_source='seed');

-- Kayıtlar
delete from public.customers where external_source='seed';
delete from public.leads     where external_source='seed';

commit;
