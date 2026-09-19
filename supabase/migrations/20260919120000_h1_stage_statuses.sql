-- =====================================================================
-- PAKET H · H1 — İki kademeli durum modeli: stage_statuses + operations.status_id
-- =====================================================================
-- Aşama (üst) = operation_stages (silinemez). Durum (alt) = stage_statuses (aşamaya bağlı).
-- SİSTEM durumu (is_system=true): silinemez; behavior anahtarı H2'de davranış+zaman damgası
-- tetikler. ÖZEL durum (is_system=false, behavior=null): serbest, yalnız bilgi.
--
-- TAMAMEN EKLEMELİ + geri alınabilir: eski sözlükler (request_statuses, sample_statuses,
-- order_statuses) ve trigger'lar DOKUNULMAZ. Davranış motoru + döngü koruması H2'de.
-- Veri: 3 talep / 2 numune / 1 sipariş → backfill önemsiz.
--
-- KARAR 1: Teklif durumları quote OLUŞTURMAZ (boş quote total=0 → v1.47.2 "0 TL" hatası
-- geri gelmesin). Numune/Sipariş aşama girişinde çocuk kayıt H2'de otomatik oluşur.
-- =====================================================================

-- ── 1) stage_statuses tablosu ────────────────────────────────────────
create table if not exists public.stage_statuses (
  id             bigint generated always as identity primary key,
  stage_id       bigint not null references public.operation_stages(id) on delete restrict,
  key            text not null unique,
  label          text not null,
  is_system      boolean not null default false,   -- true → silinemez, kilit ikonu
  behavior       text,                             -- H2 davranış anahtarı; null → yalnız bilgi (özel)
  requires_reason boolean not null default false,
  color          text,
  sort_order     integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on column public.stage_statuses.behavior is
  'H2 sistem davranışı: sample_created/shipped/received/approved/rejected/revise/order_created/production/order_shipped/delivered. null → özel durum (davranış yok).';

alter table public.stage_statuses enable row level security;
create policy stage_statuses_select on public.stage_statuses for select using (public.is_active_user());
create policy stage_statuses_write  on public.stage_statuses for all using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());
grant select, insert, update, delete on public.stage_statuses to authenticated;

create trigger stage_statuses_touch before update on public.stage_statuses
  for each row execute function public.touch_updated_at();

-- Sistem durumu SİLİNEMEZ (operation_stages_no_delete deseni).
create or replace function public.stage_statuses_guard_delete()
returns trigger language plpgsql as $$
begin
  if old.is_system then raise exception 'Sistem durumu silinemez (yalnız gizlenebilir): %', old.key using errcode='check_violation'; end if;
  return old;
end $$;
create trigger stage_statuses_no_delete before delete on public.stage_statuses
  for each row execute function public.stage_statuses_guard_delete();

-- ── 2) operations.status_id (tek durum kontrolü) ─────────────────────
alter table public.operations add column if not exists status_id bigint references public.stage_statuses(id) on delete set null;
comment on column public.operations.status_id is 'İki kademeli modelin DURUM'u (stage_statuses). Sürücü kolon (H2 trigger davranışı buradan). request_status_id senkron için kalır.';
create index if not exists operations_status_idx on public.operations(status_id);

-- ── 3) Canonical 6 aşama (eklemeli: yalnız aktifleştir/etiketle; hiçbir stage silinmez) ──
update public.operation_stages set is_active = true, label = 'Teklif' where key = 'teklif';         -- Teklif tek aşama
update public.operation_stages set label = 'Kapandı' where key = 'tamamlandi';                      -- Kapandı
-- Not: teklif_bekliyor/teklif_iletildi STAGE satırları H1'de silinmez/pasifleştirilmez (quotes_sync
-- onlara yazıyor). H2 sync'i uzlaştırınca, H5'te bunlar STAGE olarak gizlenir (durum'a taşındı).

-- ── 4) Sistem durumları seed (canonical aşamalara bağlı) ─────────────
insert into public.stage_statuses (stage_id, key, label, is_system, behavior, requires_reason, sort_order) values
  -- TEKLİF (quote OLUŞTURMAZ — Karar 1)
  ((select id from public.operation_stages where key='teklif'),  'st_teklif_bekliyor',  'Teklif Bekliyor',  true, null, false, 1),
  ((select id from public.operation_stages where key='teklif'),  'st_teklif_iletildi',  'Teklif İletildi',  true, null, false, 2),
  -- NUMUNE
  ((select id from public.operation_stages where key='numune'),  'st_num_hazirlaniyor', 'Hazırlanıyor',     true, 'sample_created', false, 1),
  ((select id from public.operation_stages where key='numune'),  'st_num_kargoda',      'Kargoda',          true, 'shipped',        false, 2),
  ((select id from public.operation_stages where key='numune'),  'st_num_teslim',       'Teslim Edildi',    true, 'received',       false, 3),
  ((select id from public.operation_stages where key='numune'),  'st_num_revize',       'Revize Ediliyor',  true, 'revise',         false, 4),
  ((select id from public.operation_stages where key='numune'),  'st_num_onaylandi',    'Onaylandı',        true, 'approved',       false, 5),
  ((select id from public.operation_stages where key='numune'),  'st_num_reddedildi',   'Reddedildi',       true, 'rejected',       true,  6),
  -- SİPARİŞ
  ((select id from public.operation_stages where key='siparis'), 'st_sip_alindi',       'Sipariş Alındı',   true, 'order_created',  false, 1),
  ((select id from public.operation_stages where key='siparis'), 'st_sip_hazir',        'Üretime Hazır',    true, null,             false, 2),
  -- ÜRETİM
  ((select id from public.operation_stages where key='uretim'),  'st_ur_uretimde',      'Üretimde',         true, 'production',     false, 1),
  ((select id from public.operation_stages where key='uretim'),  'st_ur_bekletiliyor',  'Bekletiliyor',     true, null,             false, 2),
  -- TESLİMAT
  ((select id from public.operation_stages where key='teslimat'),'st_tes_kargoda',      'Kargoda',          true, 'order_shipped',  false, 1),
  ((select id from public.operation_stages where key='teslimat'),'st_tes_teslim',       'Teslim Edildi',    true, 'delivered',      false, 2),
  -- KAPANDI
  ((select id from public.operation_stages where key='tamamlandi'),'st_kap_tamamlandi', 'Tamamlandı',       true, null,             false, 1),
  ((select id from public.operation_stages where key='tamamlandi'),'st_kap_iptal',      'İptal',            true, null,             true,  2),
  ((select id from public.operation_stages where key='tamamlandi'),'st_kap_reddedildi', 'Teklif Reddedildi',true, null,             true,  3)
on conflict (key) do nothing;

-- ── 5) status_transitions genişletme (entity_type='operation_status') — VERİ; enforcement H2 ──
-- Mevcut entity_type='operation' (9 satır) DOKUNULMAZ. Aşağısı yeni model için ileri geçiş edgeleri
-- (H2'de doğrulama trigger'ı okuyacak; H1'de yalnız kayıt).
insert into public.status_transitions (entity_type, from_key, to_key, requires_reason, is_active, is_system) values
  ('operation_status','st_teklif_bekliyor','st_teklif_iletildi', false, true, true),
  ('operation_status','st_teklif_iletildi','st_num_hazirlaniyor', false, true, true),
  ('operation_status','st_num_hazirlaniyor','st_num_kargoda', false, true, true),
  ('operation_status','st_num_kargoda','st_num_teslim', false, true, true),
  ('operation_status','st_num_teslim','st_num_onaylandi', false, true, true),
  ('operation_status','st_num_teslim','st_num_reddedildi', true, true, true),
  ('operation_status','st_num_teslim','st_num_revize', false, true, true),
  ('operation_status','st_num_revize','st_num_hazirlaniyor', false, true, true),
  ('operation_status','st_num_onaylandi','st_sip_alindi', false, true, true),
  ('operation_status','st_sip_alindi','st_ur_uretimde', false, true, true),
  ('operation_status','st_ur_uretimde','st_tes_kargoda', false, true, true),
  ('operation_status','st_tes_kargoda','st_tes_teslim', false, true, true),
  ('operation_status','st_tes_teslim','st_kap_tamamlandi', false, true, true)
on conflict do nothing;

-- ── 6) Backfill (3 talep) — stage_id canonical'e + status_id ata ─────
-- teklif_* aşamasındakiler → Teklif; req_status teklif_iletildi ise "İletildi" durumu.
update public.operations o set
  stage_id = (select id from public.operation_stages where key='teklif'),
  status_id = (select id from public.stage_statuses where key = case
      when (select key from public.request_statuses where id=o.request_status_id) = 'teklif_iletildi'
      then 'st_teklif_iletildi' else 'st_teklif_bekliyor' end)
where o.deleted_at is null
  and (select key from public.operation_stages where id=o.stage_id) in ('talep','teklif','teklif_bekliyor','teklif_iletildi');
-- siparis aşamasındakiler → Sipariş / Sipariş Alındı (kullanıcı sonra netleştirir; H2 tutarlı tutar).
update public.operations o set
  status_id = (select id from public.stage_statuses where key='st_sip_alindi')
where o.deleted_at is null and status_id is null
  and (select key from public.operation_stages where id=o.stage_id) = 'siparis';
-- numune/uretim/teslimat/kapandı aşamasındakiler → o aşamanın giriş (sort=1) durumu.
update public.operations o set
  status_id = (select id from public.stage_statuses where stage_id=o.stage_id order by sort_order limit 1)
where o.deleted_at is null and status_id is null
  and (select key from public.operation_stages where id=o.stage_id) in ('numune','uretim','teslimat','tamamlandi');

notify pgrst, 'reload schema';

-- =====================================================================
-- GERİ ALMA (down): drop trigger stage_statuses_no_delete; drop function stage_statuses_guard_delete;
--   alter table operations drop column status_id; drop table stage_statuses;
--   delete from status_transitions where entity_type='operation_status';
--   update operation_stages set is_active=false where key='teklif';
--   update operation_stages set label='Tamamlandı' where key='tamamlandi';
-- Eski stage/child kolonları hiç değişmediği için veri kaybı YOK; sistem eski panellere döner.
-- =====================================================================
