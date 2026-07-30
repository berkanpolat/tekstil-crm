-- =====================================================================
-- P1.3 — Potansiyeller (leads)
-- Kayıt merkezi kişidir; firma bilgisi kart üzerinde bir alandır (ayrı tablo değil).
-- external_source/external_id: TekLead göçüne hazırlık (bu fazda göç YOK).
-- converted_customer_id: FK → customers P1.4'te eklenir (customers henüz yok).
-- =====================================================================
create table public.leads (
  id                       bigint generated always as identity primary key,
  -- TekLead contacts'ta kişi adı YOK (scraper işletme listeler, kişi sonradan
  -- öğrenilir). full_name nullable; CHECK ikisinden en az biri dolu olsun.
  full_name                text,
  company_name             text,
  -- Normalizasyon VERİTABANINDA (generated): istemci/import/edge/göç fark etmez, hep dolu.
  company_name_normalized  text generated always as (public.normalize_tr(company_name)) stored,
  sector                   text,
  country                  text,
  city                     text,
  district                 text,
  address                  text,
  source_id                bigint references public.lead_sources (id) on delete set null,
  status_id                bigint not null references public.lead_statuses (id) on delete restrict,
  assigned_to              uuid references public.users (id) on delete set null,
  next_action_at           timestamptz,             -- planlanan sonraki temas
  last_interaction_at      timestamptz,             -- otomatik güncellenir (P1.5)
  external_source          text,                    -- göçe hazırlık
  external_id              text,
  converted_customer_id    bigint,                  -- FK → customers (P1.4)
  converted_at             timestamptz,
  converted_by             uuid references public.users (id) on delete set null,
  deleted_at               timestamptz,
  deleted_by               uuid,
  created_by               uuid references public.users (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- full_name YA DA company_name en az biri dolu (boşluk-only da boş sayılır).
  constraint leads_name_present check (
    coalesce(nullif(btrim(full_name), ''), nullif(btrim(company_name), '')) is not null
  )
);
-- NOT (P1.10): içe aktarmanın toplu geri alınması için import_batch_id alanı
-- burada DEĞİL, P1.10 içe aktarma migrasyonunda eklenecek.

-- Sunucu tarafı liste/filtre performansı (10.000+ kayıt) için indeksler
create index leads_status_idx     on public.leads (status_id) where deleted_at is null;
create index leads_assigned_idx   on public.leads (assigned_to) where deleted_at is null;
create index leads_source_idx     on public.leads (source_id);
create index leads_next_action_idx on public.leads (next_action_at) where deleted_at is null;
create index leads_last_inter_idx on public.leads (last_interaction_at desc) where deleted_at is null;
create index leads_company_norm_idx on public.leads (company_name_normalized) where deleted_at is null;
create index leads_city_idx       on public.leads (city) where deleted_at is null;
create index leads_created_idx    on public.leads (created_at desc);
create index leads_active_idx     on public.leads (id) where deleted_at is null and converted_customer_id is null;
-- Göç tekrar-çalıştırılabilirliği: aynı kaynak+dış id iki kez eklenemez.
create unique index leads_external_uidx on public.leads (external_source, external_id)
  where external_id is not null;
-- İki potansiyel aynı müşteriye dönüşemez.
create unique index leads_converted_uidx on public.leads (converted_customer_id)
  where converted_customer_id is not null;

comment on table public.leads is
  'Potansiyel müşteriler. Kayıt merkezi kişidir. Dönüşünce silinmez (converted_customer_id + status=donusturuldu).';

-- Varsayılan durum: status_id null gelirse lead_statuses.is_default atanır
-- (içe aktarma/göç/edge function durumu bilmek zorunda kalmaz).
create or replace function public.leads_set_default_status()
returns trigger
language plpgsql
as $$
begin
  if new.status_id is null then
    select id into new.status_id from public.lead_statuses where is_default limit 1;
    if new.status_id is null then
      raise exception 'Varsayılan potansiyel durumu (lead_statuses.is_default) tanımlı değil.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- Trigger'lar: varsayılan durum (BEFORE) + updated_at + denetim
create trigger leads_default_status before insert on public.leads
  for each row execute function public.leads_set_default_status();
create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();
create trigger leads_audit after insert or update or delete on public.leads
  for each row execute function public.audit_trigger();

-- RLS — Faz 1 GENİŞ (görünürlük tam): aktif kullanıcı okur/yazar. Fiziksel silme
-- yok (deleted_at). Kim ne yaptı audit_log'da.
alter table public.leads enable row level security;
create policy leads_select on public.leads
  for select to authenticated using (public.is_active_user());
create policy leads_insert on public.leads
  for insert to authenticated with check (public.is_active_user());
create policy leads_update on public.leads
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
revoke all on public.leads from anon;
grant select, insert, update on public.leads to authenticated;
