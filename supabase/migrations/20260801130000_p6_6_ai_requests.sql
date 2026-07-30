-- =====================================================================
-- P6.6 — Yapay zekâ altyapısı. ai_requests = her çağrının denetim kaydı.
--
-- Veri güvenliği (Böl. 22): maliyet/finans/iç-not modele ASLA gitmez. Bunu iki katman
-- sağlar: (1) izin-listesi — her özellik yalnız izinli alanlardan payload kurar;
-- (2) edge guard — yasak anahtar görürse çağrıyı reddeder. input_summary METİN SAKLAMAZ,
-- YAPISAL özet tutar (hangi kayıt, hangi alanlar, kaç kayıt, ne kadar metin, payload_hash).
-- =====================================================================

create table public.ai_requests (
  id              bigint generated always as identity primary key,
  user_id         uuid references public.users (id) on delete set null,
  feature         text not null,
  -- YAPISAL özet (tam metin YOK): {feature, entity_type, entity_id, fields_sent[], record_counts{}, input_chars, payload_hash}
  input_summary   jsonb not null default '{}'::jsonb,
  payload_hash    text,
  model           text,
  tokens_in       int,
  tokens_out      int,
  response_summary text,
  status          text not null default 'ok' check (status in ('ok','blocked','limit','error','unavailable')),
  accepted        boolean,
  rejected_reason text,
  duration_ms     int,
  created_at      timestamptz not null default now()
);
comment on table public.ai_requests is 'YZ çağrı denetimi. input_summary yapısal (metin saklamaz). Maliyet/finans/iç-not gönderilmez.';
create index ai_requests_user_idx on public.ai_requests (user_id, created_at desc);
create index ai_requests_day_idx on public.ai_requests (created_at) where status = 'ok';

alter table public.ai_requests enable row level security;
-- Okuma: kendi kayıtları ya da owner/admin. Yazma: edge fn (service role) — RLS'i bypass eder.
create policy ai_requests_select on public.ai_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin_or_owner());
-- Kabul/red işareti (P6.9): kendi kaydında accepted/rejected_reason güncellenebilir.
create policy ai_requests_update on public.ai_requests for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.ai_requests from anon;
grant select, update on public.ai_requests to authenticated;

-- Ayarlar
insert into public.settings (key, value, category, description) values
  ('ai.model', '"claude-sonnet-4-6"'::jsonb, 'ai', 'Kullanılan Anthropic modeli.'),
  ('ai.daily_call_limit', '500'::jsonb, 'ai', 'Günlük toplam YZ çağrı sınırı (genel). Aşılırsa çağrı reddedilir.')
on conflict (key) do nothing;

-- Bugünkü başarılı çağrı sayısı (genel) — istemci kalan hakkı gösterebilir; edge fn de kullanır.
create or replace function public.ai_calls_today()
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.ai_requests
  where status = 'ok' and created_at >= (now() at time zone public.app_timezone())::date;
$$;
grant execute on function public.ai_calls_today() to authenticated;
