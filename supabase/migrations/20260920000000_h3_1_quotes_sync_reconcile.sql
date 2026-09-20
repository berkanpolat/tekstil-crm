-- =====================================================================
-- PAKET H · H3.1 — quotes_sync uzlaştırma + legacy aşamaları pasife çek
-- =====================================================================
-- Sorun: quotes_sync_operation_status normal teklif olayında operations.stage_id'yi
--   DOĞRUDAN legacy teklif_iletildi/teklif_bekliyor AŞAMALARINA yazıyor. Legacy aşamalar
--   pasife çekilince operasyon pasif aşamaya düşer + tek-sürücü (status_id) modeli bozulur.
-- Çözüm: quotes_sync artık stage yerine DURUM (operations.status_id) sürücüsünü ayarlar;
--   YALNIZ operasyon Teklif aşamasındayken ve karşı durumdayken (çift yön). Numune/sipariş
--   aşamasındakine dokunmaz (geri çekmez). Anahtar (key) ile — sabit id yok. in_stage_sync
--   guard'ı korunur. request_status_id senkronu aynen kalır.
-- =====================================================================

create or replace function public.quotes_sync_operation_status()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare
  v_opid bigint := coalesce(new.operation_id, old.operation_id);
  v_has boolean;
  v_stage_key text;
  v_cur_status text;
begin
  if public.in_stage_sync() then return null; end if;   -- H2 sürücüsü çalışırken stand-down

  select exists(select 1 from public.quotes
    where operation_id = v_opid and deleted_at is null and quote_file_id is not null) into v_has;

  -- request_status_id senkronu (AYNEN korunur — legacy uyum)
  update public.operations
    set request_status_id = (select id from public.request_statuses
      where key = case when v_has then 'teklif_iletildi' else 'teklif_bekliyor' end)
    where id = v_opid and cancelled_at is null;

  -- Yeni model: DURUM sürücüsü. Yalnız operasyon TEKLİF aşamasındayken oynat (anahtar bazlı).
  select os.key, ss.key into v_stage_key, v_cur_status
    from public.operations o
    left join public.operation_stages os on os.id = o.stage_id
    left join public.stage_statuses  ss on ss.id = o.status_id
    where o.id = v_opid;

  if v_stage_key = 'teklif' then
    if v_has and v_cur_status = 'st_teklif_bekliyor' then
      update public.operations set status_id = (select id from public.stage_statuses where key='st_teklif_iletildi')
        where id = v_opid and cancelled_at is null;
    elsif (not v_has) and v_cur_status = 'st_teklif_iletildi' then
      -- Teklif silinince/dosya kalkınca geri al (yalnız Teklif aşaması + İletildi iken)
      update public.operations set status_id = (select id from public.stage_statuses where key='st_teklif_bekliyor')
        where id = v_opid and cancelled_at is null;
    end if;
  end if;

  if coalesce(current_setting('app.debug_stage', true),'') = '1' then
    raise notice 'QUOTES_SYNC op % has=% stage=% cur=% depth=%', v_opid, v_has, v_stage_key, v_cur_status, pg_trigger_depth();
  end if;
  return null;
end; $function$;

-- Ters yön geçiş edge'i (İletildi → Bekliyor); yoksa BEFORE doğrulaması geri alışı bloklardı.
insert into public.status_transitions (entity_type, from_key, to_key, requires_reason, is_active, is_system)
select 'operation_status','st_teklif_iletildi','st_teklif_bekliyor', false, true, true
where not exists (
  select 1 from public.status_transitions
  where entity_type='operation_status' and from_key='st_teklif_iletildi' and to_key='st_teklif_bekliyor');

-- Legacy tek-kademeli aşama artıklarını PASİFE ÇEK (silme yok; canlı op = 0, doğrulandı).
update public.operation_stages set is_active = false
  where key in ('teklif_bekliyor','teklif_iletildi','teklif_reddedildi','iptal');

notify pgrst, 'reload schema';

-- =====================================================================
-- GERİ ALMA (down): quotes_sync_operation_status'u H2 öncesi/H2 sürümüne geri koy;
--   update operation_stages set is_active=true where key in (...4...);
--   delete from status_transitions where entity_type='operation_status'
--     and from_key='st_teklif_iletildi' and to_key='st_teklif_bekliyor';
-- =====================================================================
