-- =====================================================================
-- P1.4 düzeltme — Müşteri kodu MUS önekli olmalı (TAS operasyon kodudur:
-- bir işi talep→teklif→sipariş boyunca izler, müşteriyi DEĞİL). code_registry
-- global benzersizliği korunur; sadece önek müşteriye özel.
-- Önek ayardan (codes.customer_prefix, varsayılan MUS) — koda gömülü değil.
-- =====================================================================
insert into public.settings (key, value, category, description)
values ('codes.customer_prefix', '"MUS"'::jsonb, 'codes', 'Müşteri kodu öneki (MUS-XXXXXX).')
on conflict (key) do nothing;

-- Müşteri kodu üreteci — generate_operation_code kalıbı, önek codes.customer_prefix.
-- code_registry'ye yazar (eşzamanlı-güvenli, unique + retry). entity_type='customer'.
create or replace function public.generate_customer_code(p_entity_id text default null)
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
begin
  select value #>> '{}' into v_prefix from public.settings where key = 'codes.customer_prefix';
  v_prefix := coalesce(nullif(v_prefix, ''), 'MUS');
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
      values (v_full, 'customer', p_entity_id);
      return v_full;
    exception when unique_violation then
      if v_try >= 10 then
        raise exception 'Müşteri kodu üretilemedi (10 denemede çakışma).' using errcode = 'P0001';
      end if;
    end;
  end loop;
end;
$$;

comment on function public.generate_customer_code(text) is
  'Benzersiz müşteri kodu üretir (MUS-XXXXXX), code_registry''ye kaydeder. Eşzamanlı-güvenli.';
grant execute on function public.generate_customer_code(text) to authenticated;

-- Trigger'ı MUS üretecine çevir.
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
    new.customer_code := public.generate_customer_code(new.id::text);
  end if;
  return new;
end;
$$;
