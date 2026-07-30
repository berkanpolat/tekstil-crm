-- =====================================================================
-- P1.4 — Müşteriler (customers)
-- Kararlar (kullanıcı onayı): (1) MUS-xxxx kodu code_registry ile,
-- (2) durum customer_statuses referans listesinden, (3) kimlik leads gibi
-- kişi-VEYA-firma + CHECK (dönüşüm uyumu; TekLead firma-only bozulmasın).
-- leads kalıbını izler: DB-side normalize (arama), fiziksel silme yok, audit, RLS geniş.
-- =====================================================================
create table public.customers (
  id                       bigint generated always as identity primary key,
  customer_code            text,                    -- BEFORE INSERT trigger doldurur (MUS-...)
  full_name                text,
  full_name_normalized     text generated always as (public.normalize_tr(full_name)) stored,
  company_name             text,
  company_name_normalized  text generated always as (public.normalize_tr(company_name)) stored,
  sector                   text,
  customer_type_id         bigint references public.customer_types (id) on delete set null,
  status_id                bigint not null references public.customer_statuses (id) on delete restrict,
  country                  text,
  city                     text,
  city_normalized          text generated always as (public.normalize_tr(city)) stored,
  district                 text,
  address                  text,
  -- Ticari bilgiler (doküman 3.7) — Faz 4 belge üretimi + Faz 5 cari. Hiçbiri zorunlu değil.
  tax_office               text,
  tax_number               text,
  -- Sadece rakamlar (arama + mükerrer sinyali, doküman 3.6/3.12). Boşsa null.
  tax_number_normalized    text generated always as
                             (nullif(regexp_replace(tax_number, '[^0-9]', '', 'g'), '')) stored,
  iban                     text,
  -- Boşluksuz + büyük harf (karşılaştırma için). Boşsa null.
  iban_normalized          text generated always as
                             (nullif(upper(regexp_replace(iban, '[^A-Za-z0-9]', '', 'g')), '')) stored,
  bank_name                text,
  account_holder           text,
  assigned_to              uuid references public.users (id) on delete set null,
  last_interaction_at      timestamptz,               -- otomatik güncellenir (P1.5)
  next_action_at           timestamptz,               -- "unutulan müşteri" uyarısı (doküman 4.10)
  converted_from_lead_id   bigint references public.leads (id) on delete set null,
  converted_at             timestamptz,
  converted_by             uuid references public.users (id) on delete set null,
  external_source          text,
  external_id              text,
  deleted_at               timestamptz,
  deleted_by               uuid,
  created_by               uuid references public.users (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- Kişi veya firma adından en az biri dolu (leads ile aynı; boşluk-only da boş).
  constraint customers_name_present check (
    coalesce(nullif(btrim(full_name), ''), nullif(btrim(company_name), '')) is not null
  )
);

comment on table public.customers is
  'Müşteriler. Kimlik kişi-veya-firma (CHECK). Kod MUS-xxxx (code_registry). Fiziksel silme yok.';

-- BEFORE INSERT: varsayılan durum + operasyon kodu (NEW.id identity'de zaten dolu).
create or replace function public.customers_before_insert()
returns trigger
language plpgsql
as $$
begin
  if new.status_id is null then
    select id into new.status_id from public.customer_statuses where is_default limit 1;
    if new.status_id is null then
      raise exception 'Varsayılan müşteri durumu (customer_statuses.is_default) tanımlı değil.'
        using errcode = 'P0001';
    end if;
  end if;
  if new.customer_code is null then
    new.customer_code := public.generate_operation_code('customer', new.id::text);
  end if;
  return new;
end;
$$;

-- customer_code değişmez (üretildikten sonra kilitli).
create or replace function public.customers_guard_code()
returns trigger
language plpgsql
as $$
begin
  if old.customer_code is not null and new.customer_code is distinct from old.customer_code then
    raise exception 'Müşteri kodu değiştirilemez: %', old.customer_code using errcode = '2BP01';
  end if;
  return new;
end;
$$;

create trigger customers_before_insert before insert on public.customers
  for each row execute function public.customers_before_insert();
create trigger customers_guard_code before update on public.customers
  for each row execute function public.customers_guard_code();
create trigger customers_touch before update on public.customers
  for each row execute function public.touch_updated_at();
create trigger customers_audit after insert or update or delete on public.customers
  for each row execute function public.audit_trigger();

-- İndeksler (aktif kayıtlar için kısmi; arama normalize sütunlardan).
create unique index customers_code_uidx on public.customers (customer_code) where customer_code is not null;
create index customers_status_idx on public.customers (status_id) where deleted_at is null;
create index customers_type_idx on public.customers (customer_type_id) where deleted_at is null;
create index customers_assigned_idx on public.customers (assigned_to) where deleted_at is null;
create index customers_company_norm_idx on public.customers (company_name_normalized) where deleted_at is null;
create index customers_full_name_norm_idx on public.customers (full_name_normalized) where deleted_at is null;
create index customers_city_norm_idx on public.customers (city_normalized) where deleted_at is null;
create index customers_created_idx on public.customers (created_at desc);
create index customers_next_action_idx on public.customers (next_action_at) where deleted_at is null;
-- Vergi numarası ile arama + mükerrer tespiti sinyali (doküman 3.6/3.12, P1.9).
create index customers_tax_number_idx on public.customers (tax_number_normalized) where deleted_at is null;
-- İki müşteri aynı potansiyelden gelemez (leads.converted_customer_id'nin tersi).
create unique index customers_converted_from_uidx on public.customers (converted_from_lead_id)
  where converted_from_lead_id is not null;
-- Göç tekrar-çalıştırılabilirliği: aynı kaynak+dış id iki kez eklenemez (leads ile aynı).
create unique index customers_external_uidx on public.customers (external_source, external_id)
  where external_id is not null;

-- RLS — Faz 1 GENİŞ (iş verisi): aktif kullanıcı okur/yazar. Silme = deleted_at.
alter table public.customers enable row level security;
create policy customers_select on public.customers
  for select to authenticated using (public.is_active_user());
create policy customers_insert on public.customers
  for insert to authenticated with check (public.is_active_user());
create policy customers_update on public.customers
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
revoke all on public.customers from anon;
grant select, insert, update on public.customers to authenticated;

-- P1.3'ten ertelenen FK: leads.converted_customer_id → customers(id).
alter table public.leads
  add constraint leads_converted_customer_id_fkey
  foreign key (converted_customer_id) references public.customers (id) on delete set null;
