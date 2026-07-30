-- =====================================================================
-- H6 — Teklif sonucu "Olumlu — Beklemede". Bu sonuç seçilince SEBEP ve "ne zaman tekrar
-- bakılacak" tarihi zorunlu. Tarih geldiğinde hatırlatma: açık takipler görünür + event_log.
-- =====================================================================
alter table public.quotes add column if not exists follow_up_at timestamptz;
alter table public.quotes add column if not exists follow_up_reason text;
comment on column public.quotes.follow_up_at is 'Olumlu—Beklemede teklifin tekrar değerlendirileceği tarih (H6). Geçince hatırlatılır.';
comment on column public.quotes.follow_up_reason is 'Olumlu—Beklemede sebebi (H6).';

create index if not exists quotes_follow_up_idx on public.quotes (follow_up_at)
  where follow_up_at is not null and deleted_at is null;

-- Zamanı gelmiş (veya geçmiş) takipler — hatırlatma kaynağı. Faz 6 bildirim merkezi bunu okur;
-- şimdilik arayüzde "tekrar bakılacak" rozetiyle yüzeye çıkar.
create or replace function public.due_quote_followups()
returns table (quote_id bigint, operation_id bigint, follow_up_at timestamptz, reason text)
language sql stable security definer set search_path = '' as $$
  select q.id, q.operation_id, q.follow_up_at, q.follow_up_reason
  from public.quotes q
  join public.quote_statuses s on s.id = q.status_id
  where q.deleted_at is null and s.key = 'olumlu_beklemede'
    and q.follow_up_at is not null and q.follow_up_at <= now()
  order by q.follow_up_at;
$$;
grant execute on function public.due_quote_followups() to authenticated;
