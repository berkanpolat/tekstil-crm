-- =====================================================================
-- P0.3 — Denetim ve olay kayıtları
-- İki AYRI şey:
--   audit_log : teknik denetim (neyin nasıl değiştiği). Append-only, immutable.
--   event_log : iş olayları akışı (timeline/bildirim temeli).
-- Aktör kimliği auth.uid() / auth.users üzerinden alınır; public.users'a
-- (henüz yok, P0.4) bağımlı DEĞİL.
-- =====================================================================

-- =====================================================================
-- 1) audit_log tablosu
-- =====================================================================
create table public.audit_log (
  id             bigint generated always as identity primary key,
  table_name     text        not null,
  record_id      text,
  action         public.audit_action not null,
  actor_id       uuid,                      -- null olabilir: sistem işlemi
  actor_email    text,                      -- denormalize; kullanıcı silinse de kalır
  changed_fields text[],
  old_values     jsonb,
  new_values     jsonb,
  source         public.audit_source not null default 'user',
  ip_address     inet,
  user_agent     text,
  created_at     timestamptz not null default now()
);

create index audit_log_table_record_idx on public.audit_log (table_name, record_id);
create index audit_log_actor_idx        on public.audit_log (actor_id);
create index audit_log_created_idx      on public.audit_log (created_at desc);

comment on table public.audit_log is
  'Teknik denetim kaydı. Append-only ve immutable (update/delete trigger ile engellenir).';

-- =====================================================================
-- 2) Jenerik audit_trigger() — herhangi bir tabloya takılabilir:
--    create trigger <t>_audit after insert or update or delete on <t>
--      for each row execute function public.audit_trigger();
-- Hassas alanlar (şifre vb.) maskelenir. Soft-delete/restore ayrımı yapılır.
-- =====================================================================
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action   public.audit_action;
  v_old      jsonb;
  v_new      jsonb;
  v_changed  text[];
  v_actor_id uuid := auth.uid();
  v_email    text;
  v_source   public.audit_source;
  v_headers  json;
  v_ip       inet;
  v_ua       text;
  -- Denetime asla yazılmayacak (maskelenecek) alanlar:
  v_sensitive text[] := array[
    'password', 'password_hash', 'encrypted_password',
    'token', 'secret', 'api_key', 'service_role_key'
  ];
  k text;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);  v_new := null;
  elsif tg_op = 'INSERT' then
    v_old := null;           v_new := to_jsonb(new);
  else
    v_old := to_jsonb(old);  v_new := to_jsonb(new);
  end if;

  -- Hassas alanları maskele
  foreach k in array v_sensitive loop
    if v_old ? k then v_old := jsonb_set(v_old, array[k], '"***"'::jsonb); end if;
    if v_new ? k then v_new := jsonb_set(v_new, array[k], '"***"'::jsonb); end if;
  end loop;

  -- Eylem tayini (mantıksal silme / geri alma dahil)
  if tg_op = 'INSERT' then
    v_action := 'insert';
  elsif tg_op = 'DELETE' then
    v_action := 'delete';
  elsif (v_old->>'deleted_at') is null and (v_new->>'deleted_at') is not null then
    v_action := 'delete';                 -- soft delete
  elsif (v_old->>'deleted_at') is not null and (v_new->>'deleted_at') is null then
    v_action := 'restore';                -- geri alma
  else
    v_action := 'update';
  end if;

  -- Değişen alanlar (updated_at gürültüsü hariç)
  if tg_op = 'UPDATE' then
    select array_agg(key) into v_changed
    from (
      select jsonb_object_keys(v_new) as key
      union
      select jsonb_object_keys(v_old)
    ) keys
    where key <> 'updated_at'
      and (v_new -> key) is distinct from (v_old -> key);
  end if;

  -- Aktör e-postası (denormalize; auth.users her zaman vardır)
  if v_actor_id is not null then
    select u.email into v_email from auth.users u where u.id = v_actor_id;
  end if;

  -- Kaynak: açık ayar > oturumdan çıkarım
  v_source := coalesce(
    nullif(current_setting('app.audit_source', true), '')::public.audit_source,
    case when v_actor_id is null then 'system'::public.audit_source
         else 'user'::public.audit_source end
  );

  -- İstek başlıkları (PostgREST bağlamında; best-effort)
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
    v_ip := nullif(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1), '')::inet;
    v_ua := v_headers->>'user-agent';
  exception when others then
    v_ip := null;  v_ua := null;
  end;

  insert into public.audit_log (
    table_name, record_id, action, actor_id, actor_email,
    changed_fields, old_values, new_values, source, ip_address, user_agent
  ) values (
    tg_table_name,
    coalesce(v_new->>'id', v_old->>'id'),
    v_action, v_actor_id, v_email,
    v_changed, v_old, v_new, v_source, v_ip, v_ua
  );

  return null; -- AFTER trigger; dönüş yok sayılır
end;
$$;

comment on function public.audit_trigger() is
  'Jenerik denetim trigger''ı. AFTER INSERT/UPDATE/DELETE olarak herhangi bir tabloya takılır.';

-- =====================================================================
-- 3) Append-only koruması: update/delete HERKESE kapalı; TRUNCATE de engelli.
--    TRUNCATE satır trigger''larını atladığı için ayrıca statement-level
--    BEFORE TRUNCATE trigger''ı gerekir. Jenerik fonksiyon audit_log ve
--    event_log için ortak kullanılır.
-- =====================================================================
create or replace function public.prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% tablosu değiştirilemez (append-only): % engellendi.',
    tg_table_name, tg_op
    using errcode = '2F000';
end;
$$;

comment on function public.prevent_mutation() is
  'Append-only tablolar için update/delete/truncate engelleyen trigger fonksiyonu.';

create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.prevent_mutation();

create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.prevent_mutation();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.prevent_mutation();

-- RLS: yalnızca aktif kullanıcı OKUR. Yazma yalnızca SECURITY DEFINER
-- audit_trigger() üzerinden (RLS'i baypas eder). Doğrudan insert/update/delete
-- politikası YOK → API üzerinden değiştirilemez.
alter table public.audit_log enable row level security;

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.is_active_user());

revoke all on public.audit_log from anon;
grant select on public.audit_log to authenticated;

-- =====================================================================
-- 4) event_log tablosu — iş olayları akışı
-- =====================================================================
create table public.event_log (
  id          bigint generated always as identity primary key,
  event_type  text        not null,      -- sabit dosyadan; bkz. src/lib/events.ts
  entity_type text,
  entity_id   text,
  actor_id    uuid,
  payload     jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index event_log_entity_idx  on public.event_log (entity_type, entity_id);
create index event_log_type_idx    on public.event_log (event_type);
create index event_log_created_idx  on public.event_log (created_at desc);

comment on table public.event_log is
  'İş olayları akışı (timeline/bildirim temeli). Olay tipleri src/lib/events.ts ile sabitlenir.';

alter table public.event_log enable row level security;

create policy event_log_select on public.event_log
  for select to authenticated
  using (public.is_active_user());

create policy event_log_insert on public.event_log
  for insert to authenticated
  with check (public.is_active_user());

revoke all on public.event_log from anon;
grant select, insert on public.event_log to authenticated;

-- Olay yazmanın standart yolu (actor_id otomatik auth.uid()).
create or replace function public.log_event(
  p_event_type  text,
  p_entity_type text default null,
  p_entity_id   text default null,
  p_payload     jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.event_log (event_type, entity_type, entity_id, actor_id, payload)
  values (p_event_type, p_entity_type, p_entity_id, auth.uid(), coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.log_event(text, text, text, jsonb) to authenticated;

-- event_log da append-only: TRUNCATE engellenir (update/delete zaten RLS ile kapalı).
create trigger event_log_no_truncate
  before truncate on public.event_log
  for each statement execute function public.prevent_mutation();
