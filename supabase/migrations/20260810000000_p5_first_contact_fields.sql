-- =====================================================================
-- PAKET 5 · madde 1 — İlk temas kanalı + ilk temas tarihi
-- Müşteri (customers) ve potansiyel (leads) formlarına iki alan.
--   • first_contact_channel_id → interaction_channels referansı (mevcut liste)
--   • first_contact_date       → geçmişe girilebilir tarih (date)
-- Salt kolon ekleme; veri kaybı yok. Mevcut satırlar NULL kalır.
-- =====================================================================

alter table public.customers
  add column if not exists first_contact_channel_id bigint
    references public.interaction_channels (id) on delete set null,
  add column if not exists first_contact_date date;

alter table public.leads
  add column if not exists first_contact_channel_id bigint
    references public.interaction_channels (id) on delete set null,
  add column if not exists first_contact_date date;

comment on column public.customers.first_contact_channel_id is 'İlk temas kanalı (interaction_channels).';
comment on column public.customers.first_contact_date       is 'İlk temas tarihi (geçmişe girilebilir).';
comment on column public.leads.first_contact_channel_id     is 'İlk temas kanalı (interaction_channels).';
comment on column public.leads.first_contact_date           is 'İlk temas tarihi (geçmişe girilebilir).';
