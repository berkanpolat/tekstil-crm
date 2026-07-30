-- =====================================================================
-- P1.5 — Etkileşimler (interactions)
-- Polimorfik (entity_type/entity_id; contact_points/entity_tags kalıbı, FK yok).
-- Lead VE customer ile etkileşim. Kanal/sonuç referans listelerinden (P1.1).
-- last_interaction_at parent'ta trigger ile OTOMATİK güncellenir (doküman: son
-- etkileşim + "unutulan" uyarısı). Fiziksel silme yok, audit, RLS geniş.
-- =====================================================================
create table public.interactions (
  id           bigint generated always as identity primary key,
  entity_type  text not null check (entity_type in ('lead', 'customer')),
  entity_id    bigint not null,
  channel_id   bigint not null references public.interaction_channels (id) on delete restrict,
  outcome_id   bigint references public.interaction_outcomes (id) on delete set null,
  direction    text not null default 'outbound' check (direction in ('inbound', 'outbound')),
  occurred_at  timestamptz not null default now(),
  summary      text,
  deleted_at   timestamptz,
  deleted_by   uuid,
  created_by   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index interactions_entity_idx on public.interactions (entity_type, entity_id) where deleted_at is null;
create index interactions_occurred_idx on public.interactions (occurred_at desc) where deleted_at is null;
create index interactions_channel_idx on public.interactions (channel_id);
create index interactions_outcome_idx on public.interactions (outcome_id);

comment on table public.interactions is
  'Lead/customer etkileşimleri (arama, e-posta, ziyaret...). last_interaction_at parent''ta trigger ile güncellenir.';

-- Parent'ın last_interaction_at'ini yeniden hesapla (aktif etkileşimlerin max occurred_at'i).
-- SECURITY DEFINER: parent RLS'ten bağımsız tutarlı güncelleme.
create or replace function public.interactions_touch_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := coalesce(new.entity_type, old.entity_type);
  v_id   bigint := coalesce(new.entity_id, old.entity_id);
  v_max  timestamptz;
begin
  select max(occurred_at) into v_max
  from public.interactions
  where entity_type = v_type and entity_id = v_id and deleted_at is null;

  if v_type = 'lead' then
    update public.leads set last_interaction_at = v_max where id = v_id;
  elsif v_type = 'customer' then
    update public.customers set last_interaction_at = v_max where id = v_id;
  end if;
  return null;
end;
$$;

create trigger interactions_touch_parent
  after insert or update or delete on public.interactions
  for each row execute function public.interactions_touch_parent();
create trigger interactions_touch before update on public.interactions
  for each row execute function public.touch_updated_at();
create trigger interactions_audit after insert or update or delete on public.interactions
  for each row execute function public.audit_trigger();

-- RLS — Faz 1 GENİŞ (iş verisi): aktif kullanıcı okur/yazar. Silme = deleted_at.
alter table public.interactions enable row level security;
create policy interactions_select on public.interactions
  for select to authenticated using (public.is_active_user());
create policy interactions_insert on public.interactions
  for insert to authenticated with check (public.is_active_user());
create policy interactions_update on public.interactions
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
revoke all on public.interactions from anon;
grant select, insert, update on public.interactions to authenticated;
