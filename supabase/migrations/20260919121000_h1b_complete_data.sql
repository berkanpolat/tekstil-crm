-- =====================================================================
-- PAKET H · H1b — H1'in VERİ katmanını tamamla (idempotent, DML-only)
-- =====================================================================
-- Neden: H1 uygulamasında tablo + operations.status_id kolonu oluştu ama seed /
--   aşama aktifleştirme / relabel / backfill ÇALIŞMADI (canlı doğrulama: stage_statuses
--   boş, teklif inactive, tamamlandi etiketi eski, status_id null). Bu script yalnız
--   eksik VERİYİ tamamlar; tablo/policy/trigger OLUŞTURMAZ → güvenle tekrar çalıştırılabilir.
-- =====================================================================

-- Canonical 6 aşama
update public.operation_stages set is_active = true, label = 'Teklif' where key = 'teklif';
update public.operation_stages set label = 'Kapandı' where key = 'tamamlandi';

-- Sistem durumları (aşamaya bağlı) — idempotent (key unique, on conflict do nothing)
insert into public.stage_statuses (stage_id, key, label, is_system, behavior, requires_reason, sort_order) values
  ((select id from public.operation_stages where key='teklif'),  'st_teklif_bekliyor',  'Teklif Bekliyor',  true, null, false, 1),
  ((select id from public.operation_stages where key='teklif'),  'st_teklif_iletildi',  'Teklif İletildi',  true, null, false, 2),
  ((select id from public.operation_stages where key='numune'),  'st_num_hazirlaniyor', 'Hazırlanıyor',     true, 'sample_created', false, 1),
  ((select id from public.operation_stages where key='numune'),  'st_num_kargoda',      'Kargoda',          true, 'shipped',        false, 2),
  ((select id from public.operation_stages where key='numune'),  'st_num_teslim',       'Teslim Edildi',    true, 'received',       false, 3),
  ((select id from public.operation_stages where key='numune'),  'st_num_revize',       'Revize Ediliyor',  true, 'revise',         true,  4),
  ((select id from public.operation_stages where key='numune'),  'st_num_onaylandi',    'Onaylandı',        true, 'approved',       false, 5),
  ((select id from public.operation_stages where key='numune'),  'st_num_reddedildi',   'Reddedildi',       true, 'rejected',       true,  6),
  ((select id from public.operation_stages where key='siparis'), 'st_sip_alindi',       'Sipariş Alındı',   true, 'order_created',  false, 1),
  ((select id from public.operation_stages where key='siparis'), 'st_sip_hazir',        'Üretime Hazır',    true, null,             false, 2),
  ((select id from public.operation_stages where key='uretim'),  'st_ur_uretimde',      'Üretimde',         true, 'production',     false, 1),
  ((select id from public.operation_stages where key='uretim'),  'st_ur_bekletiliyor',  'Bekletiliyor',     true, null,             false, 2),
  ((select id from public.operation_stages where key='teslimat'),'st_tes_kargoda',      'Kargoda',          true, 'order_shipped',  false, 1),
  ((select id from public.operation_stages where key='teslimat'),'st_tes_teslim',       'Teslim Edildi',    true, 'delivered',      false, 2),
  ((select id from public.operation_stages where key='tamamlandi'),'st_kap_tamamlandi', 'Tamamlandı',       true, null,             false, 1),
  ((select id from public.operation_stages where key='tamamlandi'),'st_kap_iptal',      'İptal',            true, null,             true,  2),
  ((select id from public.operation_stages where key='tamamlandi'),'st_kap_reddedildi', 'Teklif Reddedildi',true, null,             true,  3)
on conflict (key) do nothing;

-- status_transitions.entity_type CHECK'ine 'operation_status' eklenir (H1'de eksikti → seed patlıyordu)
alter table public.status_transitions drop constraint if exists status_transitions_entity_type_check;
alter table public.status_transitions add constraint status_transitions_entity_type_check
  check (entity_type = any (array['operation','quote','sample','order','operation_status']));

-- status_transitions (operation_status) — idempotent (aynı edge tekrar eklenmez)
insert into public.status_transitions (entity_type, from_key, to_key, requires_reason, is_active, is_system)
select v.entity_type, v.from_key, v.to_key, v.requires_reason, true, true
from (values
  ('operation_status','st_teklif_bekliyor','st_teklif_iletildi', false),
  ('operation_status','st_teklif_iletildi','st_num_hazirlaniyor', false),
  ('operation_status','st_num_hazirlaniyor','st_num_kargoda', false),
  ('operation_status','st_num_kargoda','st_num_teslim', false),
  ('operation_status','st_num_teslim','st_num_onaylandi', false),
  ('operation_status','st_num_teslim','st_num_reddedildi', true),
  ('operation_status','st_num_teslim','st_num_revize', false),
  ('operation_status','st_num_revize','st_num_hazirlaniyor', false),
  ('operation_status','st_num_onaylandi','st_sip_alindi', false),
  ('operation_status','st_sip_alindi','st_ur_uretimde', false),
  ('operation_status','st_ur_uretimde','st_tes_kargoda', false),
  ('operation_status','st_tes_kargoda','st_tes_teslim', false),
  ('operation_status','st_tes_teslim','st_kap_tamamlandi', false)
) as v(entity_type, from_key, to_key, requires_reason)
where not exists (
  select 1 from public.status_transitions t
  where t.entity_type=v.entity_type and t.from_key=v.from_key and t.to_key=v.to_key
);

-- Backfill (yalnız status_id boş olanlar) — 3 talep
update public.operations o set
  stage_id = (select id from public.operation_stages where key='teklif'),
  status_id = (select id from public.stage_statuses where key = case
      when (select key from public.request_statuses where id=o.request_status_id) = 'teklif_iletildi'
      then 'st_teklif_iletildi' else 'st_teklif_bekliyor' end)
where o.deleted_at is null and o.status_id is null
  and (select key from public.operation_stages where id=o.stage_id) in ('talep','teklif','teklif_bekliyor','teklif_iletildi');
update public.operations o set status_id = (select id from public.stage_statuses where key='st_sip_alindi')
where o.deleted_at is null and o.status_id is null
  and (select key from public.operation_stages where id=o.stage_id) = 'siparis';
update public.operations o set status_id = (select id from public.stage_statuses where stage_id=o.stage_id order by sort_order limit 1)
where o.deleted_at is null and o.status_id is null
  and (select key from public.operation_stages where id=o.stage_id) in ('numune','uretim','teslimat','tamamlandi');

notify pgrst, 'reload schema';
