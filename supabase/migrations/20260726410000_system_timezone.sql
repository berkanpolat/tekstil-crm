-- =====================================================================
-- Sistem saat dilimi — TEK KAYNAK. Tarih üreten / gün bazlı gruplayan HER YER
-- bunu kullanmalı; sunucu (UTC) varsayılanına güvenilmez. Aynı tuzak SLA (P3.8) ve
-- Faz 7 gün bazlı raporlarda tekrar çıkar. Ayar: system.timezone (IANA), varsayılan
-- Europe/Istanbul. Değişirse migration gerekmez.
-- =====================================================================
insert into public.settings (key, value, category, description) values
  ('system.timezone', '"Europe/Istanbul"'::jsonb, 'system',
   'Uygulamanın iş saat dilimi (IANA). Tarih üretimi, SLA ve gün bazlı raporlar bunu kullanır; sunucu UTC''sine güvenilmez.')
on conflict (key) do nothing;

create or replace function public.app_timezone()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select value #>> '{}' from public.settings where key = 'system.timezone'), 'Europe/Istanbul');
$$;
comment on function public.app_timezone() is
  'İş saat dilimi (system.timezone ayarı, varsayılan Europe/Istanbul). "x at time zone public.app_timezone()" ile kullan.';
grant execute on function public.app_timezone() to authenticated;

-- Auto-title tarihini sabit TZ yerine ayardan oku.
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
    new.title := new.title || ' — ' ||
      to_char((coalesce(new.requested_at, now()) at time zone public.app_timezone())::date, 'DD.MM.YYYY');
  end if;
  return new;
end; $$;
