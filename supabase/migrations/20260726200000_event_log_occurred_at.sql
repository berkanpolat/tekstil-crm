-- =====================================================================
-- event_log.occurred_at — timeline "NE ZAMAN OLDU"yu sıralamalı, ne zaman
-- LOGLANDI'yı değil. Geçmişe kayıt girilebiliyor (dün yapılan görüşme bugün
-- kaydedilir). created_at = log zamanı (denetim), occurred_at = olay zamanı (timeline).
-- Faz 3'te ödeme/kargo/teslim tarihleri de geçmişe girilebilecek — aynı alan.
-- =====================================================================
alter table public.event_log add column occurred_at timestamptz;
update public.event_log set occurred_at = created_at where occurred_at is null;
alter table public.event_log alter column occurred_at set not null;
alter table public.event_log alter column occurred_at set default now();

-- Timeline sorgusu: (entity_type, entity_id, occurred_at desc).
create index event_log_entity_occurred_idx on public.event_log (entity_type, entity_id, occurred_at desc);

-- log_event: p_occurred_at (opsiyonel, verilmezse now()). Tek fonksiyon; 4-arg
-- çağrılar trailing default ile çözülür (mevcut trigger'lar/generate_operation_code).
drop function if exists public.log_event(text, text, text, jsonb);
create or replace function public.log_event(
  p_event_type  text,
  p_entity_type text default null,
  p_entity_id   text default null,
  p_payload     jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.event_log (event_type, entity_type, entity_id, actor_id, payload, occurred_at)
  values (p_event_type, p_entity_type, p_entity_id, auth.uid(),
          coalesce(p_payload, '{}'::jsonb), coalesce(p_occurred_at, now()))
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.log_event(text, text, text, jsonb, timestamptz) to authenticated;

-- Etkileşim trigger'ı occurred_at'i GEÇİRSİN (backdate destekli). Kaldırma = now().
create or replace function public.interactions_timeline_events()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event('interaction.logged', new.entity_type, new.entity_id::text, jsonb_build_object(
      'interaction_id', new.id,
      'channel',   (select label from public.interaction_channels where id = new.channel_id),
      'outcome',   (select label from public.interaction_outcomes where id = new.outcome_id),
      'direction', new.direction,
      'summary',   new.summary,
      'occurred_at', new.occurred_at),
      new.occurred_at);                        -- olay zamanı = görüşme zamanı
  elsif tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null then
    perform public.log_event('interaction.removed', new.entity_type, new.entity_id::text,
      jsonb_build_object('interaction_id', new.id));
  end if;
  return null;
end; $$;
