-- =====================================================================
-- PAKET H · H3.1b — Yeni talepler iki kademeli modelde doğsun + yapısal garanti
-- =====================================================================
-- Kök neden (duman testi): operations_before_insert yeni talebe stage'i is_default
--   (legacy teklif_bekliyor, artık pasif) atıyor ve status_id'yi HİÇ set etmiyordu →
--   yeni talepler modele hiç girmiyor, quotes_sync/H2 tetikleri devreye girmiyordu.
-- Çözüm: before_insert status_id'yi (st_teklif_bekliyor) set etsin, AŞAMAYI status_id'den
--   TÜRETSİN (tek sürücü — is_default'tan değil). is_default ayrıca canonical teklif'e taşınır
--   (where is_default yazan başka yollar pasif aşama almasın). Öksüzler backfill + status_id NOT NULL.
-- BEFORE INSERT trigger'ı tüm insert yollarında (istemci, intake_process, script, elle SQL) çalışır.
-- =====================================================================

-- 1) before_insert: status_id sürücü; aşama status'tan türer
create or replace function public.operations_before_insert()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare v_cat text; v_type text;
begin
  if new.code is null then new.code := public.generate_operation_code('operation', new.id::text); end if;
  -- İki kademeli model: DURUM sürücü. status_id boşsa giriş durumu.
  if new.status_id is null then
    new.status_id := (select id from public.stage_statuses where key = 'st_teklif_bekliyor');
  end if;
  -- AŞAMA TEK KAYNAKTAN: status_id'nin aşaması (is_default'tan DEĞİL → durum/aşama asla çelişmez).
  new.stage_id := (select stage_id from public.stage_statuses where id = new.status_id);
  if new.request_status_id is null then select id into new.request_status_id from public.request_statuses where is_default limit 1; end if;
  if new.title is null or btrim(new.title) = '' then
    select label into v_cat from public.product_categories where id = new.category_id;
    select label into v_type from public.product_categories where id = new.type_id;
    new.title := btrim(concat_ws(' ', v_cat, v_type));
    if new.title = '' then new.title := 'Talep'; end if;
    new.title := new.title || ' — ' || to_char((coalesce(new.requested_at, now()) at time zone public.app_timezone())::date, 'DD.MM.YYYY');
  end if;
  return new;
end; $function$;

-- 2) is_default → canonical teklif (where is_default yazan kod pasif aşama almasın)
update public.operation_stages set is_default = false where is_default and key <> 'teklif';
update public.operation_stages set is_default = true  where key = 'teklif';

-- 3) Öksüz talepleri backfill (TÜM ops — soft-deleted dahil; NOT NULL için)
update public.operations o set status_id = (select id from public.stage_statuses where key = m.skey)
from (
  select o2.id,
    case (select key from public.operation_stages where id = o2.stage_id)
      when 'numune'     then 'st_num_hazirlaniyor'
      when 'siparis'    then 'st_sip_alindi'
      when 'uretim'     then 'st_ur_uretimde'
      when 'teslimat'   then 'st_tes_kargoda'
      when 'tamamlandi' then 'st_kap_tamamlandi'
      when 'iptal'      then 'st_kap_iptal'
      else case when exists(select 1 from public.quotes q where q.operation_id=o2.id and q.deleted_at is null and q.quote_file_id is not null)
                then 'st_teklif_iletildi' else 'st_teklif_bekliyor' end
    end as skey
  from public.operations o2 where o2.status_id is null
) m where o.id = m.id;

-- Aşamayı status'tan türet (tutarlılık — öksüzler + mevcutlar)
update public.operations o set stage_id = (select stage_id from public.stage_statuses where id = o.status_id)
where o.status_id is not null
  and o.stage_id is distinct from (select stage_id from public.stage_statuses where id = o.status_id);

-- 4) Yapısal garanti: öksüz kalmadıysa status_id NOT NULL (kalırsa migration DURUR — ON_ERROR_STOP)
do $$ declare n int; begin
  select count(*) into n from public.operations where status_id is null;
  raise notice 'H3.1b: status_id NULL kalan talep sayısı = %', n;
  if n > 0 then raise exception 'Öksüz talep var (%); NOT NULL atlanmadı — backfill mantığını gözden geçir.', n; end if;
end $$;
alter table public.operations alter column status_id set not null;

notify pgrst, 'reload schema';

-- =====================================================================
-- GERİ ALMA (down): alter table operations alter column status_id drop not null;
--   operations_before_insert'i H3.1b öncesi sürümüne geri koy;
--   update operation_stages set is_default=false where key='teklif';
--   update operation_stages set is_default=true where key='teklif_bekliyor';
--   (status_id backfill'i geri almak gerekmez — veri kaybı yok, eski kolonlar duruyor.)
-- =====================================================================
