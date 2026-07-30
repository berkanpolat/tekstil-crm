-- =====================================================================
-- P1.6 — Notlar (notes) + notes/files timeline olayları.
-- notes: polimorfik (lead/customer). Etiketler (entity_tags) ve dosyalar (files)
-- zaten var; bu migration notes tablosu + notes/files için event_log trigger'ı.
-- =====================================================================
create table public.notes (
  id           bigint generated always as identity primary key,
  entity_type  text not null check (entity_type in ('lead', 'customer')),
  entity_id    bigint not null,
  body         text not null,
  deleted_at   timestamptz,
  deleted_by   uuid,
  created_by   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index notes_entity_idx on public.notes (entity_type, entity_id) where deleted_at is null;

comment on table public.notes is 'Lead/customer serbest notları. Fiziksel silme yok.';

create trigger notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();
create trigger notes_audit after insert or update or delete on public.notes
  for each row execute function public.audit_trigger();

-- Timeline olayları
create or replace function public.notes_timeline_events()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event('note.added', new.entity_type, new.entity_id::text,
      jsonb_build_object('note_id', new.id, 'excerpt', left(new.body, 140)));
  elsif tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null then
    perform public.log_event('note.removed', new.entity_type, new.entity_id::text,
      jsonb_build_object('note_id', new.id));
  end if;
  return null;
end; $$;
create trigger notes_timeline after insert or update on public.notes
  for each row execute function public.notes_timeline_events();

-- RLS — geniş (iş verisi)
alter table public.notes enable row level security;
create policy notes_select on public.notes for select to authenticated using (public.is_active_user());
create policy notes_insert on public.notes for insert to authenticated with check (public.is_active_user());
create policy notes_update on public.notes for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
revoke all on public.notes from anon;
grant select, insert, update on public.notes to authenticated;

-- ---------- files → timeline (yalnız lead/customer ekleri; avatar/export hariç) ----------
create or replace function public.files_timeline_events()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.entity_type in ('lead', 'customer') then
    perform public.log_event('file.added', new.entity_type, new.entity_id,
      jsonb_build_object('file_id', new.id, 'name', new.original_name, 'category', new.category));
  elsif tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null
        and new.entity_type in ('lead', 'customer') then
    perform public.log_event('file.removed', new.entity_type, new.entity_id,
      jsonb_build_object('file_id', new.id, 'name', new.original_name));
  end if;
  return null;
end; $$;
create trigger files_timeline after insert or update on public.files
  for each row execute function public.files_timeline_events();
