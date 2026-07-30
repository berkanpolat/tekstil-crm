-- =====================================================================
-- P3.4 — Teklifler (quotes + quote_items). Bir operasyonda BİRDEN FAZLA VERSİYON.
-- Müşteri "fiyat yüksek" derse yeni versiyon doğar; eskisi SİLİNMEZ (revizyon zinciri
-- supersedes_quote_id ile kurulur). Tutarlar quote_items'tan türetilir. İç not müşteriye
-- gitmez. Fiziksel silme yok, audit, RLS geniş.
-- =====================================================================

create table public.quotes (
  id                    bigint generated always as identity primary key,
  operation_id          bigint not null references public.operations (id) on delete restrict,
  version               int not null,                       -- 1,2,3… (trigger otomatik atar)
  status_id             bigint references public.quote_statuses (id) on delete restrict,
  valid_until           date not null default (current_date + 7),  -- süre; otomatik durum değiştirmez
  currency              text not null default 'TRY',
  subtotal              numeric(14,2) not null default 0,   -- Σ quote_items.line_total (trigger)
  tax_rate              numeric(5,2) not null default 20,   -- KDV %
  tax_amount            numeric(14,2) not null default 0,   -- subtotal * tax_rate/100 (trigger)
  total                 numeric(14,2) not null default 0,   -- subtotal + tax_amount (trigger)
  payment_term_id       bigint references public.payment_terms (id) on delete set null,
  lead_time_days        int,                                -- termin süresi (gün)
  technical_notes       text,                               -- müşteriye açık
  commercial_notes      text,                               -- müşteriye açık
  internal_notes        text,                               -- İÇ NOT — müşteriye/belgeye ASLA gitmez
  sent_at               timestamptz,
  sent_by               uuid references public.users (id) on delete set null,
  sent_channel          text check (sent_channel is null or sent_channel in ('eposta','whatsapp','elden','diger')),
  responded_at          timestamptz,
  rejection_reason_id   bigint references public.quote_rejection_reasons (id) on delete set null,
  rejection_note        text,
  supersedes_quote_id   bigint references public.quotes (id) on delete set null,  -- revize edilen versiyon
  deleted_at            timestamptz,
  deleted_by            uuid,
  created_by            uuid references public.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.quotes is
  'Teklifler. Operasyon başına birden fazla versiyon; revizyon zinciri supersedes_quote_id ile. internal_notes müşteriye gitmez.';
comment on column public.quotes.internal_notes is 'İç not — müşteriye ve üretilen belgeye ASLA girmez (P3.4 / doküman 7.9).';

-- Versiyon aktif kayıtlarda benzersiz (soft-delete sonrası çakışma yok).
create unique index quotes_operation_version_uidx on public.quotes (operation_id, version) where deleted_at is null;
create index quotes_operation_idx on public.quotes (operation_id) where deleted_at is null;
create index quotes_status_idx on public.quotes (status_id) where deleted_at is null;
create index quotes_valid_until_idx on public.quotes (valid_until) where deleted_at is null;
create index quotes_supersedes_idx on public.quotes (supersedes_quote_id) where supersedes_quote_id is not null;

create table public.quote_items (
  id                 bigint generated always as identity primary key,
  quote_id           bigint not null references public.quotes (id) on delete cascade,
  operation_item_id  bigint references public.operation_items (id) on delete set null,  -- hangi ürün kaleminden
  name               text not null,
  description        text,
  quantity           numeric(14,2) not null default 1,
  unit               text,                                 -- adet, metre, kg…
  unit_price         numeric(14,2) not null default 0,
  discount_rate      numeric(5,2) not null default 0,      -- satır iskontosu %
  line_total         numeric(14,2) generated always as
                       (round(quantity * unit_price * (1 - discount_rate / 100), 2)) stored,
  sort_order         int not null default 0,
  deleted_at         timestamptz,
  deleted_by         uuid,
  created_by         uuid references public.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.quote_items is 'Teklif kalemleri. line_total = adet × birim fiyat × (1 − iskonto%) (generated).';
create index quote_items_quote_idx on public.quote_items (quote_id) where deleted_at is null;

-- ---------------------------------------------------------------------
-- Versiyon + varsayılanlar (BEFORE INSERT)
-- ---------------------------------------------------------------------
create or replace function public.quotes_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.version is null then
    select coalesce(max(version), 0) + 1 into new.version
      from public.quotes where operation_id = new.operation_id;   -- soft-deleted dahil: versiyon numarası tekrar etmesin
  end if;
  if new.status_id is null then
    select id into new.status_id from public.quote_statuses where is_default limit 1;
  end if;
  return new;
end; $$;

-- ---------------------------------------------------------------------
-- Tutar yeniden hesabı: subtotal = Σ line_total, tax_amount, total.
-- quote_items değişince ve quotes.tax_rate değişince tetiklenir.
-- ---------------------------------------------------------------------
create or replace function public.recompute_quote_totals(p_quote_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_subtotal numeric(14,2);
  v_rate numeric(5,2);
begin
  select coalesce(sum(line_total), 0) into v_subtotal
    from public.quote_items where quote_id = p_quote_id and deleted_at is null;
  select tax_rate into v_rate from public.quotes where id = p_quote_id;
  update public.quotes set
    subtotal = v_subtotal,
    tax_amount = round(v_subtotal * coalesce(v_rate, 0) / 100, 2),
    total = v_subtotal + round(v_subtotal * coalesce(v_rate, 0) / 100, 2)
  where id = p_quote_id;
end; $$;

create or replace function public.quote_items_recompute()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.recompute_quote_totals(coalesce(new.quote_id, old.quote_id));
  return null;
end; $$;

-- tax_rate elle değişince tutarları güncelle
create or replace function public.quotes_recompute_on_tax()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.tax_rate is distinct from old.tax_rate then
    perform public.recompute_quote_totals(new.id);
  end if;
  return null;
end; $$;

-- ---------------------------------------------------------------------
-- Timeline: oluşturma, gönderim, durum değişimi (kabul/red dahil).
-- ---------------------------------------------------------------------
create or replace function public.quotes_timeline_events()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
  if tg_op = 'INSERT' then
    perform public.log_event('quote.created', 'operation', new.operation_id::text,
      jsonb_build_object('quote_id', new.id, 'version', new.version,
        'supersedes_quote_id', new.supersedes_quote_id));
  elsif tg_op = 'UPDATE' then
    if new.sent_at is not null and old.sent_at is null then
      perform public.log_event('quote.sent', 'operation', new.operation_id::text,
        jsonb_build_object('quote_id', new.id, 'version', new.version, 'channel', new.sent_channel));
    end if;
    if new.status_id is distinct from old.status_id then
      select key into v_key from public.quote_statuses where id = new.status_id;
      perform public.log_event('quote.status_changed', 'operation', new.operation_id::text,
        jsonb_build_object('quote_id', new.id, 'version', new.version, 'status', v_key));
    end if;
  end if;
  return null;
end; $$;

-- ---------------------------------------------------------------------
-- Revizyon: yeni versiyon = eski teklifin kopyası + tüm kalemleri kopyalanır.
-- Kullanıcı sıfırdan yazmaz. supersedes_quote_id ile zincir kurulur.
-- ---------------------------------------------------------------------
create or replace function public.create_quote_revision(p_quote_id bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_src public.quotes;
  v_new_id bigint;
  v_uid uuid := auth.uid();
begin
  select * into v_src from public.quotes where id = p_quote_id and deleted_at is null;
  if not found then
    raise exception 'Revize edilecek teklif bulunamadı (id=%).', p_quote_id using errcode = 'P0002';
  end if;

  insert into public.quotes (
    operation_id, status_id, valid_until, currency, tax_rate, payment_term_id,
    lead_time_days, technical_notes, commercial_notes, internal_notes,
    supersedes_quote_id, created_by
  ) values (
    v_src.operation_id, null, current_date + 7, v_src.currency, v_src.tax_rate, v_src.payment_term_id,
    v_src.lead_time_days, v_src.technical_notes, v_src.commercial_notes, v_src.internal_notes,
    v_src.id, v_uid
  ) returning id into v_new_id;

  insert into public.quote_items (
    quote_id, operation_item_id, name, description, quantity, unit, unit_price, discount_rate, sort_order, created_by
  )
  select v_new_id, operation_item_id, name, description, quantity, unit, unit_price, discount_rate, sort_order, v_uid
    from public.quote_items where quote_id = p_quote_id and deleted_at is null
    order by sort_order, id;

  perform public.recompute_quote_totals(v_new_id);
  return v_new_id;
end; $$;

comment on function public.create_quote_revision(bigint) is
  'Verilen teklifin yeni versiyonunu oluşturur: kalemler kopyalanır, supersedes_quote_id ile zincir kurulur. Yeni teklif id döner.';

-- ---------------------------------------------------------------------
-- Trigger'lar
-- ---------------------------------------------------------------------
create trigger quotes_before_insert before insert on public.quotes
  for each row execute function public.quotes_before_insert();
create trigger quotes_touch before update on public.quotes
  for each row execute function public.touch_updated_at();
create trigger quotes_recompute_tax after update on public.quotes
  for each row execute function public.quotes_recompute_on_tax();
create trigger quotes_audit after insert or update or delete on public.quotes
  for each row execute function public.audit_trigger();
create trigger quotes_timeline after insert or update on public.quotes
  for each row execute function public.quotes_timeline_events();

create trigger quote_items_touch before update on public.quote_items
  for each row execute function public.touch_updated_at();
create trigger quote_items_recompute after insert or update or delete on public.quote_items
  for each row execute function public.quote_items_recompute();
create trigger quote_items_audit after insert or update or delete on public.quote_items
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- RLS — geniş (iş verisi): aktif kullanıcı okur/yazar. Silme = deleted_at.
-- ---------------------------------------------------------------------
alter table public.quotes enable row level security;
create policy quotes_select on public.quotes for select to authenticated using (public.is_active_user());
create policy quotes_insert on public.quotes for insert to authenticated with check (public.is_active_user());
create policy quotes_update on public.quotes for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
revoke all on public.quotes from anon;
grant select, insert, update on public.quotes to authenticated;

alter table public.quote_items enable row level security;
create policy quote_items_select on public.quote_items for select to authenticated using (public.is_active_user());
create policy quote_items_insert on public.quote_items for insert to authenticated with check (public.is_active_user());
create policy quote_items_update on public.quote_items for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
revoke all on public.quote_items from anon;
grant select, insert, update on public.quote_items to authenticated;

grant execute on function public.create_quote_revision(bigint) to authenticated;
