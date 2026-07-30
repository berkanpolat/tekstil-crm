-- =====================================================================
-- Durum makinesi — ALT KAYIT ilişkileri (Düzeltme turu · madde 6).
-- Önceki tur operasyon AŞAMASINI insert'te ilerletiyordu; ama alt kayıt
-- DURUM DEĞİŞİMLERİ (sipariş üretimde/kargoda/teslim/iptal) aşamaya
-- yansımıyordu ve üst kayıt kapanınca alt kayıtlar askıda kalıyordu
-- ("sipariş teslim ama numune hâlâ kargoda").
--
-- İlke: is_closed/is_terminal bayrakları tek doğ­ruluk kaynağı. Üst kapanınca
-- alt kayıtlar + açık dosyalar kapanır. Aşama yalnız ileri (op_advance_stage).
-- =====================================================================

-- 0) Veri düzeltmesi: teslim edilen numune de KAPALI sayılır (kargoda kalmasın).
update public.sample_statuses set is_closed = true where key = 'teslim_edildi' and is_closed is distinct from true;

-- 1) Sipariş durumu → operasyon aşaması (UPDATE). Insert'i orders_advance_op yapar.
create or replace function public.orders_cascade_stage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_key text; v_target text;
begin
  select key into v_key from public.order_statuses where id = new.status_id;
  v_target := case
    when v_key in ('planlaniyor','uretime_hazir','uretimde','kalite_kontrolde','paketleniyor') then 'uretim'
    when v_key in ('sevkiyata_hazir','sevk_edildi','kargo_bekleniyor','kargoda')                then 'teslimat'
    when v_key in ('teslim_edildi','tamamlandi')                                                then 'tamamlandi'
    when v_key = 'iptal_edildi'                                                                  then 'iptal'
    else null end;
  if v_target is null then return null; end if;
  if v_target = 'iptal' then perform public.op_set_stage(new.operation_id, 'iptal');
  else perform public.op_advance_stage(new.operation_id, v_target); end if;
  return null;
end $$;
drop trigger if exists orders_cascade_stage on public.orders;
create trigger orders_cascade_stage after update of status_id on public.orders
  for each row when (new.status_id is distinct from old.status_id)
  execute function public.orders_cascade_stage();

-- 2) Operasyon TERMİNAL aşamaya geçince: alt kayıtlar + açık dosyalar kapanır.
--    (Sipariş cascade'i buraya varır; teklif-red cascade'i de iptal'e getirir.)
create or replace function public.operations_terminal_cascade()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
  select key into v_key from public.operation_stages where id = new.stage_id;
  if v_key not in ('tamamlandi','iptal') then return null; end if;

  if v_key = 'iptal' then
    update public.quotes q set status_id = (select id from public.quote_statuses where key='iptal_edildi')
      where q.operation_id = new.id and q.deleted_at is null
        and q.status_id in (select id from public.quote_statuses where not is_closed);
    update public.samples s set status_id = (select id from public.sample_statuses where key='iptal_edildi')
      where s.operation_id = new.id and s.deleted_at is null
        and s.status_id in (select id from public.sample_statuses where not is_closed);
    update public.orders o set status_id = (select id from public.order_statuses where key='iptal_edildi')
      where o.operation_id = new.id and o.deleted_at is null
        and o.status_id in (select id from public.order_statuses where not is_closed);
  else  -- tamamlandi: kazanan teklif kabul, numune teslim sayılır
    update public.quotes q set status_id = (select id from public.quote_statuses where key='kabul_edildi')
      where q.operation_id = new.id and q.deleted_at is null
        and q.status_id in (select id from public.quote_statuses where not is_closed);
    update public.samples s set status_id = (select id from public.sample_statuses where key='teslim_edildi')
      where s.operation_id = new.id and s.deleted_at is null
        and s.status_id in (select id from public.sample_statuses where not is_closed);
  end if;

  -- Her iki kapanışta açık dosyaları kapat (askıda iş kalmasın).
  update public.open_files set closed_at = now()
    where operation_id = new.id and closed_at is null;
  return null;
end $$;
drop trigger if exists operations_terminal_cascade on public.operations;
create trigger operations_terminal_cascade after update of stage_id on public.operations
  for each row when (new.stage_id is distinct from old.stage_id)
  execute function public.operations_terminal_cascade();
