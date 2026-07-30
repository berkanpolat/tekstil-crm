-- =====================================================================
-- Havuz modeli — talepleri müsait olan üstlenir.
--   • intake-request talepleri SAHİPSİZ düşer (owner_id null) — otomatik atama yok.
--     (Elle formda mevcut davranış: giren kişi sorumlu.)
--   • "Üstlen": tek tıkla sorumluluk. ATOMİK — yarışta ikinci kişi ezmez, uyarı alır.
--   • Üstlenme event_log'a yazılır.
-- =====================================================================
create or replace function public.claim_operation(p_operation_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_owner uuid; v_name text;
begin
  -- Atomik: yalnızca sahipsizken üstlen.
  update public.operations set owner_id = v_uid
    where id = p_operation_id and owner_id is null and deleted_at is null
    returning owner_id into v_owner;
  if found then
    perform public.log_event('operation.claimed', 'operation', p_operation_id::text,
      jsonb_build_object('owner_id', v_uid));
    return jsonb_build_object('claimed', true, 'owner_id', v_uid);
  end if;
  -- Zaten sahipli (ya da yok): mevcut sahibi döndür.
  select o.owner_id, u.full_name into v_owner, v_name
    from public.operations o left join public.users u on u.id = o.owner_id
    where o.id = p_operation_id and o.deleted_at is null;
  if v_owner is null then
    return jsonb_build_object('claimed', false, 'owner_name', null, 'gone', true);
  end if;
  if v_owner = v_uid then
    return jsonb_build_object('claimed', true, 'owner_id', v_uid, 'already', true);
  end if;
  return jsonb_build_object('claimed', false, 'owner_name', v_name);
end; $$;
comment on function public.claim_operation(bigint) is
  'Talebi atomik üstlen (havuz). Sahipsizse üstlenir + event yazar; sahipliyse mevcut sahibi döndürür (yarış koruması).';
grant execute on function public.claim_operation(bigint) to authenticated;
