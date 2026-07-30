-- =====================================================================
-- P1.10 — İçe aktarma altyapısı. import_batches + leads/customers.import_batch_id.
-- Hatalı içe aktarmanın TOPLU GERİ ALINMASI (P1.4 notu): undo_import_batch()
-- partiyi yumuşak siler (deleted_at). Fiziksel silme yok.
-- =====================================================================
create table public.import_batches (
  id            bigint generated always as identity primary key,
  entity_type   text not null check (entity_type in ('lead', 'customer')),
  file_name     text,
  total_rows    int not null default 0,
  inserted_rows int not null default 0,
  error_rows    int not null default 0,
  created_by    uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  undone_at     timestamptz,
  undone_by     uuid
);

alter table public.leads
  add column import_batch_id bigint references public.import_batches (id) on delete set null;
alter table public.customers
  add column import_batch_id bigint references public.import_batches (id) on delete set null;
create index leads_import_batch_idx on public.leads (import_batch_id) where import_batch_id is not null;
create index customers_import_batch_idx on public.customers (import_batch_id) where import_batch_id is not null;

comment on table public.import_batches is
  'İçe aktarma partileri. import_batch_id ile bağlı kayıtlar undo_import_batch ile toplu geri alınır.';

create trigger import_batches_audit after insert or update or delete on public.import_batches
  for each row execute function public.audit_trigger();

alter table public.import_batches enable row level security;
create policy import_batches_select on public.import_batches for select to authenticated using (public.is_active_user());
create policy import_batches_insert on public.import_batches for insert to authenticated with check (public.is_active_user());
create policy import_batches_update on public.import_batches for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
revoke all on public.import_batches from anon;
grant select, insert, update on public.import_batches to authenticated;

-- Toplu geri alma: partideki tüm kayıtları yumuşak sil + partiyi işaretle.
create or replace function public.undo_import_batch(p_batch_id bigint)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_undone timestamptz;
  v_n int := 0;
  v_actor uuid := auth.uid();
begin
  select entity_type, undone_at into v_type, v_undone from public.import_batches where id = p_batch_id;
  if not found then
    raise exception 'İçe aktarma partisi bulunamadı (id=%).', p_batch_id using errcode = 'P0002';
  end if;
  if v_undone is not null then
    raise exception 'Bu parti zaten geri alınmış (%).', v_undone using errcode = 'P0001';
  end if;

  if v_type = 'lead' then
    update public.leads set deleted_at = now(), deleted_by = v_actor
      where import_batch_id = p_batch_id and deleted_at is null;
    get diagnostics v_n = row_count;
  elsif v_type = 'customer' then
    update public.customers set deleted_at = now(), deleted_by = v_actor
      where import_batch_id = p_batch_id and deleted_at is null;
    get diagnostics v_n = row_count;
  end if;

  update public.import_batches set undone_at = now(), undone_by = v_actor where id = p_batch_id;
  return v_n;
end;
$$;

grant execute on function public.undo_import_batch(bigint) to authenticated;
