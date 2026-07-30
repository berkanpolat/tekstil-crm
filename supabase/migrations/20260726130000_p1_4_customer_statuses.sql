-- =====================================================================
-- P1.4 — customer_statuses (müşteri durumu referans listesi)
-- lead_statuses kalıbı: ayarlardan yönetilir, koda gömülü değil. is_default
-- ile yeni müşteriye varsayılan durum atanır (customers BEFORE INSERT trigger).
-- RLS: okuma aktif kullanıcı, YAZMA owner/admin (diğer tanım tablolarıyla tutarlı).
-- =====================================================================
create table public.customer_statuses (
  id         bigint generated always as identity primary key,
  key        text not null unique,
  label      text not null,
  sort_order int  not null default 0,
  color      text,
  is_default boolean not null default false,
  is_active  boolean not null default true,
  is_system  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.customer_statuses (key, label, sort_order, color, is_default, is_system) values
  ('aktif',      'Aktif',      1, 'success', true,  true),
  ('pasif',      'Pasif',      2, 'neutral', false, true),
  ('riskli',     'Riskli',     3, 'warning', false, true),
  ('kara_liste', 'Kara Liste', 4, 'danger',  false, true);

-- Tek varsayılan (kısmi unique).
create unique index customer_statuses_single_default
  on public.customer_statuses (is_default) where is_default;

-- Standart tanım-tablosu trigger'ları (P1.1 yardımcı fonksiyonları).
create trigger customer_statuses_touch before update on public.customer_statuses
  for each row execute function public.touch_updated_at();
create trigger customer_statuses_guard_system before update on public.customer_statuses
  for each row execute function public.guard_system_reference();
create trigger customer_statuses_no_delete before delete on public.customer_statuses
  for each row execute function public.prevent_reference_delete();
create trigger customer_statuses_audit after insert or update or delete on public.customer_statuses
  for each row execute function public.audit_trigger();

-- RLS: okuma aktif kullanıcı, yazma owner/admin.
alter table public.customer_statuses enable row level security;
create policy customer_statuses_select on public.customer_statuses
  for select to authenticated using (public.is_active_user());
create policy customer_statuses_write on public.customer_statuses
  for all to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());
revoke all on public.customer_statuses from anon;
grant select, insert, update on public.customer_statuses to authenticated;
