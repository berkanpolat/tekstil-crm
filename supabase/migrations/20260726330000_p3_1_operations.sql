-- =====================================================================
-- P3.1 — operations (omurga). Talep = Proje = Operasyon. Talep açılınca doğar,
-- TAS-XXXXXX kodunu alır, teslimata kadar o kodla yürür. Fiziksel silme yok, audit,
-- RLS geniş. Kod BEFORE INSERT trigger'ında üretilir ve değiştirilemez.
-- =====================================================================
create table public.operations (
  id                     bigint generated always as identity primary key,
  code                   text not null unique,          -- TAS-XXXXXX (trigger), değişmez
  legacy_code            text,                           -- eski STD-... kodları (aramada taranır)
  customer_id            bigint not null references public.customers (id) on delete restrict,
  title                  text not null,
  title_normalized       text generated always as (public.normalize_tr(title)) stored, -- Türkçe duyarsız arama
  description            text,
  stage_id               bigint references public.operation_stages (id) on delete restrict, -- boru hattı aşaması (referans)
  request_status_id      bigint references public.request_statuses (id) on delete restrict,
  priority_id            bigint references public.priorities (id) on delete restrict,
  owner_id               uuid references public.users (id) on delete set null,
  source                 text not null default 'manuel'
                           check (source in ('manuel','web_sitesi','telefon','whatsapp','diger')),
  target_price           numeric(14,2),
  target_price_currency  text,
  expected_delivery      date,                           -- müşterinin termin beklentisi
  sla_deadline           timestamptz,                    -- 24 iş saati (P3.8'de working-hours ile hesaplanır)
  cancelled_at           timestamptz,
  cancelled_by           uuid,
  cancellation_reason_id bigint references public.cancellation_reasons (id) on delete set null,
  cancellation_note      text,
  deleted_at             timestamptz,
  deleted_by             uuid,
  created_by             uuid references public.users (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.operations is
  'Operasyon omurgası (talep=proje=operasyon). TAS kodu değişmez; teslimata kadar aynı kodla yürür.';

-- İndeksler (aktif kayıtlar için kısmi)
create index operations_customer_idx on public.operations (customer_id) where deleted_at is null;
create index operations_stage_idx on public.operations (stage_id) where deleted_at is null;
create index operations_req_status_idx on public.operations (request_status_id) where deleted_at is null;
create index operations_priority_idx on public.operations (priority_id) where deleted_at is null;
create index operations_owner_idx on public.operations (owner_id) where deleted_at is null;
create index operations_sla_idx on public.operations (sla_deadline) where deleted_at is null;
create index operations_title_norm_idx on public.operations (title_normalized) where deleted_at is null;
create index operations_legacy_idx on public.operations (legacy_code) where legacy_code is not null;
create index operations_created_idx on public.operations (created_at desc);
create unique index operations_code_uidx on public.operations (code);

-- BEFORE INSERT: TAS kodu (NEW.id identity'de dolu) + varsayılan durum/öncelik.
create or replace function public.operations_before_insert()
returns trigger language plpgsql as $$
begin
  if new.code is null then
    new.code := public.generate_operation_code('operation', new.id::text);
  end if;
  if new.stage_id is null then
    select id into new.stage_id from public.operation_stages where is_default limit 1;
  end if;
  if new.request_status_id is null then
    select id into new.request_status_id from public.request_statuses where is_default limit 1;
  end if;
  if new.priority_id is null then
    select id into new.priority_id from public.priorities where is_default limit 1;
  end if;
  -- sla_deadline P3.8'de working-hours fonksiyonuyla set edilecek (şimdilik null).
  return new;
end; $$;

-- Kod değişmez.
create or replace function public.operations_guard_code()
returns trigger language plpgsql as $$
begin
  if old.code is not null and new.code is distinct from old.code then
    raise exception 'Operasyon kodu değiştirilemez: %', old.code using errcode = '2BP01';
  end if;
  return new;
end; $$;

-- Timeline: oluşturma olayı (aşama/durum/sorumlu değişiklikleri P3.7'de eklenecek).
create or replace function public.operations_timeline_events()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event('operation.created', 'operation', new.id::text,
      jsonb_build_object('code', new.code, 'title', new.title, 'customer_id', new.customer_id));
  end if;
  return null;
end; $$;

create trigger operations_before_insert before insert on public.operations
  for each row execute function public.operations_before_insert();
create trigger operations_guard_code before update on public.operations
  for each row execute function public.operations_guard_code();
create trigger operations_touch before update on public.operations
  for each row execute function public.touch_updated_at();
create trigger operations_audit after insert or update or delete on public.operations
  for each row execute function public.audit_trigger();
create trigger operations_timeline after insert on public.operations
  for each row execute function public.operations_timeline_events();

-- RLS — Faz 1/3 GENİŞ (iş verisi): aktif kullanıcı okur/yazar. Silme = deleted_at.
alter table public.operations enable row level security;
create policy operations_select on public.operations for select to authenticated using (public.is_active_user());
create policy operations_insert on public.operations for insert to authenticated with check (public.is_active_user());
create policy operations_update on public.operations for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
revoke all on public.operations from anon;
grant select, insert, update on public.operations to authenticated;
