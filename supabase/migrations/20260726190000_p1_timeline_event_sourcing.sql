-- =====================================================================
-- Timeline'ı event_log'a taşı (event sourcing). Gerekçe: Faz 3+'ta talep/teklif/
-- numune/sipariş/ödeme gelince timeline sorgusuna dal eklemek sürdürülemez; ayrıca
-- "teklif gönderildi", "ödeme alındı" gibi olayların kaynak tabloda karşılığı yok.
-- Her domain olayı ilgili trigger'da public.log_event() ile event_log'a yazılır.
-- entity_type/entity_id = OLAYIN AİT OLDUĞU kayıt (lead/customer) — timeline anahtarı.
-- Timeline tek kaynaktan (event_log) okur, sayfalanır. Mevcut kayıtlar backfill'lenir.
-- =====================================================================

-- ---------- leads: oluşturma / durum / sorumlu / dönüşüm ----------
create or replace function public.leads_timeline_events()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event('lead.created', 'lead', new.id::text,
      jsonb_build_object('title', coalesce(new.full_name, new.company_name)));
  elsif tg_op = 'UPDATE' then
    if new.status_id is distinct from old.status_id then
      perform public.log_event('lead.status_changed', 'lead', new.id::text, jsonb_build_object(
        'from', (select label from public.lead_statuses where id = old.status_id),
        'to',   (select label from public.lead_statuses where id = new.status_id)));
    end if;
    if new.assigned_to is distinct from old.assigned_to then
      perform public.log_event('lead.assigned', 'lead', new.id::text, jsonb_build_object(
        'from', (select full_name from public.users where id = old.assigned_to),
        'to',   (select full_name from public.users where id = new.assigned_to)));
    end if;
    if old.converted_customer_id is null and new.converted_customer_id is not null then
      perform public.log_event('lead.converted', 'lead', new.id::text,
        jsonb_build_object('customer_id', new.converted_customer_id));
    end if;
  end if;
  return null;
end; $$;

create trigger leads_timeline after insert or update on public.leads
  for each row execute function public.leads_timeline_events();

-- ---------- customers: oluşturma / durum / sorumlu ----------
create or replace function public.customers_timeline_events()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event('customer.created', 'customer', new.id::text, jsonb_build_object(
      'title', coalesce(new.company_name, new.full_name),
      'from_lead', new.converted_from_lead_id));
  elsif tg_op = 'UPDATE' then
    if new.status_id is distinct from old.status_id then
      perform public.log_event('customer.status_changed', 'customer', new.id::text, jsonb_build_object(
        'from', (select label from public.customer_statuses where id = old.status_id),
        'to',   (select label from public.customer_statuses where id = new.status_id)));
    end if;
    if new.assigned_to is distinct from old.assigned_to then
      perform public.log_event('customer.assigned', 'customer', new.id::text, jsonb_build_object(
        'from', (select full_name from public.users where id = old.assigned_to),
        'to',   (select full_name from public.users where id = new.assigned_to)));
    end if;
  end if;
  return null;
end; $$;

create trigger customers_timeline after insert or update on public.customers
  for each row execute function public.customers_timeline_events();

-- ---------- interactions: eklendi / kaldırıldı ----------
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
      'occurred_at', new.occurred_at));
  elsif tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null then
    perform public.log_event('interaction.removed', new.entity_type, new.entity_id::text,
      jsonb_build_object('interaction_id', new.id));
  end if;
  return null;
end; $$;

create trigger interactions_timeline after insert or update on public.interactions
  for each row execute function public.interactions_timeline_events();

-- ---------- entity_tags: etiket eklendi / kaldırıldı ----------
create or replace function public.entity_tags_timeline_events()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event('tag.added', new.entity_type, new.entity_id::text,
      jsonb_build_object('tag', (select label from public.tags where id = new.tag_id)));
  elsif tg_op = 'DELETE' then
    perform public.log_event('tag.removed', old.entity_type, old.entity_id::text,
      jsonb_build_object('tag', (select label from public.tags where id = old.tag_id)));
  end if;
  return null;
end; $$;

create trigger entity_tags_timeline after insert or delete on public.entity_tags
  for each row execute function public.entity_tags_timeline_events();

-- =====================================================================
-- BACKFILL — mevcut kayıtlar için geriye dönük olaylar. Doğrudan event_log'a
-- (log_event now() kullanır; burada tarihsel created_at gerekiyor). 'backfill':true.
-- =====================================================================
insert into public.event_log (event_type, entity_type, entity_id, actor_id, payload, created_at)
select 'lead.created', 'lead', l.id::text, l.created_by,
       jsonb_build_object('title', coalesce(l.full_name, l.company_name), 'backfill', true), l.created_at
from public.leads l;

insert into public.event_log (event_type, entity_type, entity_id, actor_id, payload, created_at)
select 'lead.converted', 'lead', l.id::text, l.converted_by,
       jsonb_build_object('customer_id', l.converted_customer_id, 'backfill', true),
       coalesce(l.converted_at, l.created_at)
from public.leads l
where l.converted_customer_id is not null;

insert into public.event_log (event_type, entity_type, entity_id, actor_id, payload, created_at)
select 'customer.created', 'customer', c.id::text, c.created_by,
       jsonb_build_object('title', coalesce(c.company_name, c.full_name),
                          'from_lead', c.converted_from_lead_id, 'backfill', true), c.created_at
from public.customers c;

insert into public.event_log (event_type, entity_type, entity_id, actor_id, payload, created_at)
select 'interaction.logged', i.entity_type, i.entity_id::text, i.created_by,
       jsonb_build_object(
         'interaction_id', i.id,
         'channel',   (select label from public.interaction_channels where id = i.channel_id),
         'outcome',   (select label from public.interaction_outcomes where id = i.outcome_id),
         'direction', i.direction, 'summary', i.summary,
         'occurred_at', i.occurred_at, 'backfill', true), i.occurred_at
from public.interactions i
where i.deleted_at is null;

insert into public.event_log (event_type, entity_type, entity_id, actor_id, payload, created_at)
select 'tag.added', et.entity_type, et.entity_id::text, et.created_by,
       jsonb_build_object('tag', (select label from public.tags where id = et.tag_id), 'backfill', true), et.created_at
from public.entity_tags et;
