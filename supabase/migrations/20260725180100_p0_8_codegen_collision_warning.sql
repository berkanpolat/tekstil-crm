-- =====================================================================
-- P0.8 ek — kod alanı doygunluğu erken uyarısı + anlaşılır doluluk hatası
--   * >3 denemede üretim → event_log'a 'codes.collision_pressure' (deneme +
--     toplam kayıt sayısı). Alan dolmaya başlayınca sessiz yavaşlama yerine haber.
--   * 10 denemede başarısız → "alan doluyor, codes.length'i artır" mesajı.
-- Kapasite notu: bkz. docs/specs/P0.8-operasyon-kodu.md.
-- =====================================================================
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

  select value #>> '{}' into v_prefix from public.settings where key = 'codes.operation_prefix';
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

      -- ERKEN UYARI: 3'ten fazla deneme = alan doygunluğa yaklaşıyor
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
          'Operasyon kodu alanı dolmaya başladı: 10 denemede benzersiz kod üretilemedi. '
          'codes.length ayarını artırın (ör. 6 → 7); mevcut kodlar etkilenmez.'
          using errcode = 'P0001';
      end if;
    end;
  end loop;
end;
$$;
