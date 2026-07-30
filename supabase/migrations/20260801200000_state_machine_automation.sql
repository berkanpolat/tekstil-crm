-- =====================================================================
-- Durum makinesi otomasyonu (Kapsamlı düzeltme turu · 1.1).
-- Sorun: eylemler durumu/aşamayı otomatik ilerletmiyordu. status_transitions
--   referansı ölü anahtarlar (talep/teklif) içeriyordu; aktif aşamalar farklı.
-- Çözüm: ileri-yönlü aşama ilerletme + tetikleyiciler:
--   • numune oluşturulunca operasyon → Numune
--   • sipariş oluşturulunca operasyon → Sipariş
--   • teklif reddedilince (o operasyonda başka açık teklif yoksa) → İptal
--   • potansiyele ilk etkileşim girilince lead → Temas Kuruldu
-- Aşama yalnız İLERİ gider; Tamamlandı/İptal'de sabit kalır (geri sarmaz).
-- =====================================================================

-- ---- İleri-yönlü aşama ilerletme (kapanmışsa dokunmaz) ----
create or replace function public.op_advance_stage(p_operation_id bigint, p_target_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_target_id bigint; v_target_sort int; v_cur_key text; v_cur_sort int;
begin
  select id, sort_order into v_target_id, v_target_sort
    from public.operation_stages where key = p_target_key and is_active;
  if v_target_id is null then return; end if;
  select s.key, s.sort_order into v_cur_key, v_cur_sort
    from public.operations o left join public.operation_stages s on s.id = o.stage_id
    where o.id = p_operation_id;
  -- Kapanmış operasyona dokunma; yalnız ileri (daha büyük sort) git.
  if v_cur_key in ('tamamlandi','iptal') then return; end if;
  if v_cur_sort is null or v_target_sort > v_cur_sort then
    update public.operations set stage_id = v_target_id
      where id = p_operation_id and stage_id is distinct from v_target_id;
  end if;
end; $$;

-- ---- Aşamayı doğrudan ayarla (iptal gibi ileri-sort olmayan kapanışlar için) ----
create or replace function public.op_set_stage(p_operation_id bigint, p_target_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_target_id bigint; v_cur_key text;
begin
  select id into v_target_id from public.operation_stages where key = p_target_key and is_active;
  if v_target_id is null then return; end if;
  select s.key into v_cur_key from public.operations o left join public.operation_stages s on s.id = o.stage_id where o.id = p_operation_id;
  if v_cur_key in ('tamamlandi','iptal') then return; end if;
  update public.operations set stage_id = v_target_id where id = p_operation_id and stage_id is distinct from v_target_id;
end; $$;

-- ---- Numune oluşturulunca → operasyon "Numune" aşamasına ----
create or replace function public.samples_advance_op()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.op_advance_stage(new.operation_id, 'numune');
  return null;
end; $$;
drop trigger if exists samples_advance_op on public.samples;
create trigger samples_advance_op after insert on public.samples
  for each row execute function public.samples_advance_op();

-- ---- Sipariş oluşturulunca → operasyon "Sipariş" aşamasına ----
create or replace function public.orders_advance_op()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.op_advance_stage(new.operation_id, 'siparis');
  return null;
end; $$;
drop trigger if exists orders_advance_op on public.orders;
create trigger orders_advance_op after insert on public.orders
  for each row execute function public.orders_advance_op();

-- ---- Teklif reddedilince → başka açık teklif yoksa operasyon "İptal" ----
-- (Revizyon akışını korur: aynı operasyonda bekleyen/kabul edilmiş başka teklif
--  varsa operasyon açık kalır; hepsi olumsuzsa kapanır.)
create or replace function public.quotes_close_op_on_reject()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_new text; v_open int;
begin
  if new.status_id is distinct from old.status_id then
    select key into v_new from public.quote_statuses where id = new.status_id;
    if v_new in ('reddedildi','olumsuz') then
      select count(*) into v_open
        from public.quotes q left join public.quote_statuses s on s.id = q.status_id
        where q.operation_id = new.operation_id and q.deleted_at is null and q.id <> new.id
          and coalesce(s.key,'') not in ('reddedildi','olumsuz','iptal_edildi','suresi_doldu');
      if v_open = 0 then
        perform public.op_set_stage(new.operation_id, 'iptal');
      end if;
    end if;
  end if;
  return null;
end; $$;
drop trigger if exists quotes_close_op_on_reject on public.quotes;
create trigger quotes_close_op_on_reject after update on public.quotes
  for each row execute function public.quotes_close_op_on_reject();

-- ---- İlk etkileşimde potansiyel → "Temas Kuruldu" (yalnız 'yeni' iken) ----
create or replace function public.interactions_touch_lead()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.entity_type = 'lead' then
    update public.leads
      set status_id = (select id from public.lead_statuses where key = 'temas_kuruldu')
      where id = new.entity_id
        and status_id = (select id from public.lead_statuses where key = 'yeni');
  end if;
  return null;
end; $$;
drop trigger if exists interactions_touch_lead on public.interactions;
create trigger interactions_touch_lead after insert on public.interactions
  for each row execute function public.interactions_touch_lead();

-- ---- status_transitions'ı AKTİF operasyon anahtarlarına taşı (ölü talep/teklif yerine) ----
delete from public.status_transitions where entity_type = 'operation';
insert into public.status_transitions (entity_type, from_key, to_key, is_system, sort_order) values
  ('operation','teklif_bekliyor','teklif_iletildi',true,1),
  ('operation','teklif_iletildi','numune',true,2),
  ('operation','teklif_iletildi','siparis',true,3),
  ('operation','numune','siparis',true,4),
  ('operation','siparis','uretim',true,5),
  ('operation','uretim','teslimat',true,6),
  ('operation','teslimat','tamamlandi',true,7),
  ('operation','*','iptal',true,99);
