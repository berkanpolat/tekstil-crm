-- =====================================================================
-- P1.10 düzeltme — undo_import_batch: üzerine ETKİLEŞİM/NOT eklenmiş kayıtlar
-- ATLANIR (çalışılmış kayıt geri alınmasın), sonuç {undone, skipped} olarak döner.
-- =====================================================================
drop function if exists public.undo_import_batch(bigint);
create or replace function public.undo_import_batch(p_batch_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_undone timestamptz;
  v_actor uuid := auth.uid();
  v_skip bigint[];
  v_undone_n int := 0;
begin
  select entity_type, undone_at into v_type, v_undone from public.import_batches where id = p_batch_id;
  if not found then
    raise exception 'İçe aktarma partisi bulunamadı (id=%).', p_batch_id using errcode = 'P0002';
  end if;
  if v_undone is not null then
    raise exception 'Bu parti zaten geri alınmış (%).', v_undone using errcode = 'P0001';
  end if;

  if v_type = 'lead' then
    -- Çalışılmış kayıtlar (aktif etkileşim veya not) → atla
    select array_agg(l.id) into v_skip from public.leads l
    where l.import_batch_id = p_batch_id and l.deleted_at is null and (
      exists (select 1 from public.interactions i where i.entity_type='lead' and i.entity_id=l.id and i.deleted_at is null)
      or exists (select 1 from public.notes n where n.entity_type='lead' and n.entity_id=l.id and n.deleted_at is null));
    update public.leads set deleted_at = now(), deleted_by = v_actor
      where import_batch_id = p_batch_id and deleted_at is null
        and (v_skip is null or id <> all(v_skip));
    get diagnostics v_undone_n = row_count;
  elsif v_type = 'customer' then
    select array_agg(c.id) into v_skip from public.customers c
    where c.import_batch_id = p_batch_id and c.deleted_at is null and (
      exists (select 1 from public.interactions i where i.entity_type='customer' and i.entity_id=c.id and i.deleted_at is null)
      or exists (select 1 from public.notes n where n.entity_type='customer' and n.entity_id=c.id and n.deleted_at is null));
    update public.customers set deleted_at = now(), deleted_by = v_actor
      where import_batch_id = p_batch_id and deleted_at is null
        and (v_skip is null or id <> all(v_skip));
    get diagnostics v_undone_n = row_count;
  end if;

  update public.import_batches set undone_at = now(), undone_by = v_actor where id = p_batch_id;
  return jsonb_build_object('undone', v_undone_n, 'skipped', coalesce(array_length(v_skip, 1), 0));
end;
$$;

grant execute on function public.undo_import_batch(bigint) to authenticated;
