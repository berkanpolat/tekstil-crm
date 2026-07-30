-- =====================================================================
-- P3.3 düzeltme — Auto-title tarihi TR saat diliminde üretilsin.
-- requested_at timestamptz; to_char sunucu TZ'sinde (UTC) çalışınca gün kayması
-- olabiliyordu (başlık 26.07 ↔ ekran 27 Tem). Europe/Istanbul'a sabitle.
-- =====================================================================
create or replace function public.operations_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_cat text; v_type text;
begin
  if new.code is null then
    new.code := public.generate_operation_code('operation', new.id::text);
  end if;
  if new.stage_id is null then
    select id into new.stage_id from public.operation_stages where is_default limit 1;
  end if;
  if new.request_status_id is null then
    select id into new.request_status_id from public.request_statuses where is_default limit 1;
  end if;
  if new.priority_id is null then
    select id into new.priority_id from public.priorities where is_default limit 1;
  end if;
  if new.title is null or btrim(new.title) = '' then
    select label into v_cat from public.product_categories where id = new.category_id;
    select label into v_type from public.product_categories where id = new.type_id;
    new.title := btrim(concat_ws(' ', v_cat, v_type));
    if new.title = '' then new.title := 'Talep'; end if;
    -- TR yerel gün: UTC gün kaymasını önler.
    new.title := new.title || ' — ' ||
      to_char((coalesce(new.requested_at, now()) at time zone 'Europe/Istanbul')::date, 'DD.MM.YYYY');
  end if;
  return new;
end; $$;
