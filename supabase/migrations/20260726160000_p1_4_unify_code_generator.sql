-- =====================================================================
-- Kod üretecini TEKLE + parametreleştir. Önek entity_type'a göre ayardan:
--   codes.<entity_type>_prefix  →  yoksa  codes.default_prefix  →  yoksa 'TAS'.
-- Faz 3 (operasyon) / Faz 4 (belge) yeni fonksiyon değil, sadece AYAR ekler.
-- MUS'a özel generate_customer_code kaldırılır; customers tek fonksiyona bağlanır.
-- code_registry ortak → çakışma yok. Mevcut MUS kodları DEĞİŞMEZ (yalnız yeni insert).
-- =====================================================================

-- codes.operation_prefix (ayarlar UI'ındaki "Operasyon kodu öneki") → codes.default_prefix.
insert into public.settings (key, value, category, description)
select 'codes.default_prefix', value, 'codes',
       'Varsayılan kod öneki (entity''ye özel codes.<entity_type>_prefix yoksa kullanılır).'
from public.settings where key = 'codes.operation_prefix'
on conflict (key) do nothing;
-- operation_prefix hiç yoksa default_prefix'i TAS yap.
insert into public.settings (key, value, category, description)
values ('codes.default_prefix', '"TAS"'::jsonb, 'codes',
        'Varsayılan kod öneki (entity''ye özel codes.<entity_type>_prefix yoksa kullanılır).')
on conflict (key) do nothing;
-- NOT: codes.operation_prefix SİLİNMEZ (settings_no_delete guard; ayarlar kalıcı).
-- Değer default_prefix'e taşındı; eski anahtar artık okunmuyor (UI da default_prefix'te).
-- Fonksiyon yalnızca codes.<entity_type>_prefix ve codes.default_prefix okur.

-- codes.customer_prefix (MUS) zaten var (20260726150000). Yoksa ekle (idempotent).
insert into public.settings (key, value, category, description)
values ('codes.customer_prefix', '"MUS"'::jsonb, 'codes', 'Müşteri kodu öneki (MUS-XXXXXX).')
on conflict (key) do nothing;

-- Parametreli üreteç: önek entity_type'a göre; çakışma-uyarısı mantığı korunur.
create or replace function public.generate_operation_code(
  p_entity_type text,
  p_entity_id   text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- I,O,0,1 yok
  v_alpha_len constant int := length(v_alphabet);
  v_prefix text;
  v_length int;
  v_code   text;
  v_full   text;
  v_try    int := 0;
  i        int;
  v_registry_count bigint;
begin
  if p_entity_type is null or length(trim(p_entity_type)) = 0 then
    raise exception 'entity_type zorunludur.' using errcode = '22004';
  end if;

  -- Önek: entity'ye özel → default → 'TAS'.
  select value #>> '{}' into v_prefix
  from public.settings where key = 'codes.' || p_entity_type || '_prefix';
  if v_prefix is null or v_prefix = '' then
    select value #>> '{}' into v_prefix from public.settings where key = 'codes.default_prefix';
  end if;
  v_prefix := coalesce(nullif(v_prefix, ''), 'TAS');

  select (value #>> '{}')::int into v_length from public.settings where key = 'codes.length';
  v_length := coalesce(v_length, 6);

  loop
    v_try := v_try + 1;
    v_code := '';
    for i in 1..v_length loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * v_alpha_len)::int, 1);
    end loop;
    v_full := v_prefix || '-' || v_code;

    begin
      insert into public.code_registry (code, entity_type, entity_id)
      values (v_full, p_entity_type, p_entity_id);

      if v_try > 3 then
        select count(*) into v_registry_count from public.code_registry;
        perform public.log_event(
          'codes.collision_pressure',
          'code_registry',
          v_full,
          jsonb_build_object('attempts', v_try, 'registry_count', v_registry_count, 'code_length', v_length)
        );
      end if;

      return v_full;
    exception when unique_violation then
      if v_try >= 10 then
        raise exception
          'Kod alanı dolmaya başladı: 10 denemede benzersiz kod üretilemedi. '
          'codes.length ayarını artırın (ör. 6 → 7); mevcut kodlar etkilenmez.'
          using errcode = 'P0001';
      end if;
    end;
  end loop;
end;
$$;

-- Müşteri trigger'ını tek fonksiyona bağla (entity_type='customer' → MUS önekini ayardan bulur).
create or replace function public.customers_before_insert()
returns trigger
language plpgsql
as $$
begin
  if new.status_id is null then
    select id into new.status_id from public.customer_statuses where is_default limit 1;
    if new.status_id is null then
      raise exception 'Varsayılan müşteri durumu (customer_statuses.is_default) tanımlı değil.'
        using errcode = 'P0001';
    end if;
  end if;
  if new.customer_code is null then
    new.customer_code := public.generate_operation_code('customer', new.id::text);
  end if;
  return new;
end;
$$;

-- MUS'a özel fonksiyonu kaldır.
drop function if exists public.generate_customer_code(text);
