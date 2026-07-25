-- =====================================================================
-- P1.2 — İletişim noktaları
-- Bir kişinin birden fazla telefonu/e-postası olabilir. Her tür için ayrı sütun
-- yerine tek polimorfik tablo. value_normalized (arama + mükerrer tespiti) istemci
-- tarafında src/lib/phone.ts ile hesaplanıp yazılır; burada indexlenir.
-- =====================================================================
create table public.contact_points (
  id               bigint generated always as identity primary key,
  entity_type      text not null,                 -- 'lead' | 'customer'
  entity_id        bigint not null,
  type             text not null,                 -- phone|email|whatsapp|instagram|telegram|website
  value            text not null,                 -- kullanıcının girdiği ham hali
  value_normalized text,                          -- arama ve mükerrer tespiti
  label            text,                          -- 'iş','cep','muhasebe' serbest
  is_primary       boolean not null default false,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index contact_points_entity_idx     on public.contact_points (entity_type, entity_id);
create index contact_points_normalized_idx on public.contact_points (value_normalized);
create index contact_points_type_norm_idx  on public.contact_points (type, value_normalized);

comment on table public.contact_points is
  'Polimorfik iletişim noktaları (telefon/e-posta/…). value_normalized istemcide (phone.ts) hesaplanır.';

-- Trigger'lar: updated_at + denetim
create trigger contact_points_touch before update on public.contact_points
  for each row execute function public.touch_updated_at();
create trigger contact_points_audit after insert or update or delete on public.contact_points
  for each row execute function public.audit_trigger();

-- RLS — iş verisi (Faz 1 geniş): aktif kullanıcı okur/yazar/siler.
alter table public.contact_points enable row level security;
create policy contact_points_select on public.contact_points
  for select to authenticated using (public.is_active_user());
create policy contact_points_insert on public.contact_points
  for insert to authenticated with check (public.is_active_user());
create policy contact_points_update on public.contact_points
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy contact_points_delete on public.contact_points
  for delete to authenticated using (public.is_active_user());
revoke all on public.contact_points from anon;
grant select, insert, update, delete on public.contact_points to authenticated;
