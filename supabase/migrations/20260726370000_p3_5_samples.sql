-- =====================================================================
-- P3.5 — Numuneler (samples). Bir operasyonda BİRDEN FAZLA numune (doküman 9.5);
-- revizyon zinciri revision_of_sample_id ile. Onay kaydı kim/ne zaman/hangi yöntemle
-- (WhatsApp foto, e-posta, fiziksel, yüz yüze) + açıklama tutar (doküman 9.11).
-- Fiziksel silme yok, audit, RLS geniş.
-- =====================================================================

create table public.samples (
  id                    bigint generated always as identity primary key,
  operation_id          bigint not null references public.operations (id) on delete restrict,
  quote_id              bigint references public.quotes (id) on delete set null,   -- hangi tekliften
  version               int not null,                       -- kaçıncı numune (trigger otomatik)
  status_id             bigint references public.sample_statuses (id) on delete restrict,
  description           text,
  fee                   numeric(14,2),                      -- numune ücreti (opsiyonel)
  fee_currency          text not null default 'TRY',
  deduct_from_order     boolean not null default false,     -- siparişten düşülecek mi
  shipped_at            timestamptz,
  tracking_number       text,
  carrier               text,
  received_at           timestamptz,
  approved_at           timestamptz,
  approved_by           uuid references public.users (id) on delete set null,
  approval_method       text check (approval_method is null or approval_method in ('whatsapp','eposta','fiziksel','yuz_yuze','diger')),
  approval_note         text,
  rejection_reason      text,                               -- serbest metin (doküman 9.11)
  revision_of_sample_id bigint references public.samples (id) on delete set null,  -- revizyon zinciri
  deleted_at            timestamptz,
  deleted_by            uuid,
  created_by            uuid references public.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.samples is
  'Numuneler. Operasyon başına çok versiyon; revizyon zinciri revision_of_sample_id. Onay: kim/ne zaman/yöntem/açıklama.';

create unique index samples_operation_version_uidx on public.samples (operation_id, version) where deleted_at is null;
create index samples_operation_idx on public.samples (operation_id) where deleted_at is null;
create index samples_quote_idx on public.samples (quote_id) where quote_id is not null;
create index samples_status_idx on public.samples (status_id) where deleted_at is null;
create index samples_revision_idx on public.samples (revision_of_sample_id) where revision_of_sample_id is not null;

-- BEFORE INSERT: versiyon + varsayılan durum
create or replace function public.samples_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.version is null then
    select coalesce(max(version), 0) + 1 into new.version
      from public.samples where operation_id = new.operation_id;  -- soft-deleted dahil: numara çakışmaz
  end if;
  if new.status_id is null then
    select id into new.status_id from public.sample_statuses where is_default limit 1;
  end if;
  return new;
end; $$;

-- Timeline: oluşturma, gönderim, onay, red
create or replace function public.samples_timeline_events()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
  if tg_op = 'INSERT' then
    perform public.log_event('sample.created', 'operation', new.operation_id::text,
      jsonb_build_object('sample_id', new.id, 'version', new.version));
  elsif tg_op = 'UPDATE' then
    if new.shipped_at is not null and old.shipped_at is null then
      perform public.log_event('sample.shipped', 'operation', new.operation_id::text,
        jsonb_build_object('sample_id', new.id, 'version', new.version, 'carrier', new.carrier, 'tracking', new.tracking_number));
    end if;
    if new.approved_at is not null and old.approved_at is null then
      perform public.log_event('sample.approved', 'operation', new.operation_id::text,
        jsonb_build_object('sample_id', new.id, 'version', new.version, 'method', new.approval_method));
    end if;
    if new.status_id is distinct from old.status_id then
      select key into v_key from public.sample_statuses where id = new.status_id;
      perform public.log_event('sample.status_changed', 'operation', new.operation_id::text,
        jsonb_build_object('sample_id', new.id, 'version', new.version, 'status', v_key));
    end if;
  end if;
  return null;
end; $$;

-- Revizyon: yeni numune versiyonu (açıklama/ücret/teklif kopyalanır, zincir kurulur).
create or replace function public.create_sample_revision(p_sample_id bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_src public.samples;
  v_new_id bigint;
begin
  select * into v_src from public.samples where id = p_sample_id and deleted_at is null;
  if not found then
    raise exception 'Revize edilecek numune bulunamadı (id=%).', p_sample_id using errcode = 'P0002';
  end if;
  insert into public.samples (operation_id, quote_id, description, fee, fee_currency, deduct_from_order, revision_of_sample_id, created_by)
  values (v_src.operation_id, v_src.quote_id, v_src.description, v_src.fee, v_src.fee_currency, v_src.deduct_from_order, v_src.id, auth.uid())
  returning id into v_new_id;
  return v_new_id;
end; $$;

comment on function public.create_sample_revision(bigint) is
  'Verilen numunenin yeni versiyonunu oluşturur; revision_of_sample_id ile zincir kurulur. Yeni id döner.';

create trigger samples_before_insert before insert on public.samples
  for each row execute function public.samples_before_insert();
create trigger samples_touch before update on public.samples
  for each row execute function public.touch_updated_at();
create trigger samples_audit after insert or update or delete on public.samples
  for each row execute function public.audit_trigger();
create trigger samples_timeline after insert or update on public.samples
  for each row execute function public.samples_timeline_events();

-- RLS — geniş
alter table public.samples enable row level security;
create policy samples_select on public.samples for select to authenticated using (public.is_active_user());
create policy samples_insert on public.samples for insert to authenticated with check (public.is_active_user());
create policy samples_update on public.samples for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
revoke all on public.samples from anon;
grant select, insert, update on public.samples to authenticated;
grant execute on function public.create_sample_revision(bigint) to authenticated;
