-- =====================================================================
-- P6.3 — Otomatik görev ÖNERİLERİ (Böl. 11.3). Öneri gelir, OTOMATİK OLUŞMAZ.
--   Kullanıcı kabul eder / düzenler / reddeder. Kabul edilen görev source='otomatik'.
--   task_templates ayarlardan yönetilir; operation_task_suggestions olayları eşler.
-- =====================================================================

create table public.task_templates (
  id                   bigint generated always as identity primary key,
  trigger_event        text not null,   -- yeni_talep|teklif_gonderildi|numune_gonderildi|teslim_yaklasiyor|uzun_islemsiz
  title_template       text not null,
  description_template text,
  default_priority_id  bigint references public.task_priorities (id) on delete set null,
  default_assignee_rule text not null default 'operasyon_sorumlusu'
    check (default_assignee_rule in ('operasyon_sorumlusu','belirli_kisi','ekip','bos_birak')),
  assignee_user_id     uuid references public.users (id) on delete set null,
  assignee_team_id     bigint references public.teams (id) on delete set null,
  due_offset_hours     int not null default 24,
  is_active            boolean not null default true,
  sort_order           int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
comment on table public.task_templates is 'Olay→görev önerisi şablonları (Böl. 11.3). Öneri; kullanıcı onaylar.';

insert into public.task_templates (trigger_event, title_template, description_template, default_assignee_rule, due_offset_hours, sort_order)
values
  ('yeni_talep','Teklif hazırla','Yeni talep için fiyat teklifi hazırlanmalı.','operasyon_sorumlusu',24,1),
  ('teklif_gonderildi','Müşteri geri dönüşünü al','Gönderilen teklif için müşteriden geri dönüş takip edilmeli.','operasyon_sorumlusu',48,2),
  ('numune_gonderildi','Numune onayını takip et','Müşteriye gönderilen numunenin onay durumu takip edilmeli.','operasyon_sorumlusu',48,3),
  ('teslim_yaklasiyor','Sevkiyat hazırlığı','Teslim tarihi yaklaşıyor; sevkiyat hazırlanmalı.','operasyon_sorumlusu',24,4),
  ('uzun_islemsiz','Durumu gözden geçir','Uzun süredir işlem yapılmayan operasyon; durum gözden geçirilmeli.','operasyon_sorumlusu',24,5);

create trigger task_templates_touch before update on public.task_templates for each row execute function public.touch_updated_at();
alter table public.task_templates enable row level security;
create policy task_templates_select on public.task_templates for select to authenticated using (public.is_active_user());
create policy task_templates_write  on public.task_templates for all to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());
revoke all on public.task_templates from anon; grant select, insert, update, delete on public.task_templates to authenticated;

-- Öneri durumu: kabul/red (aynı öneri tekrar gelmesin). kind: template|workflow_step.
create table public.task_suggestion_state (
  id           bigint generated always as identity primary key,
  operation_id bigint not null references public.operations (id) on delete cascade,
  kind         text not null,
  ref_id       bigint not null,
  state        text not null check (state in ('accepted','dismissed')),
  task_id      bigint references public.tasks (id) on delete set null,
  reason       text,
  created_by   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (operation_id, kind, ref_id)
);
alter table public.task_suggestion_state enable row level security;
create policy tss_select on public.task_suggestion_state for select to authenticated using (public.is_active_user());
create policy tss_write  on public.task_suggestion_state for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
revoke all on public.task_suggestion_state from anon; grant select, insert, update, delete on public.task_suggestion_state to authenticated;

-- ---------------------------------------------------------------------
-- operation_task_suggestions — bir operasyon için geçerli görev önerileri.
--   Olay koşulu sağlanır + daha önce kabul/red edilmemişse önerilir.
-- ---------------------------------------------------------------------
create or replace function public.operation_task_suggestions(p_operation_id bigint)
returns table (template_id bigint, trigger_event text, title text, description text, priority_id bigint,
               assignee_rule text, resolved_assignee uuid, due_offset_hours int)
language plpgsql stable security definer set search_path = '' as $$
declare v_owner uuid; v_now date := (now() at time zone public.app_timezone())::date; v_updated timestamptz; v_status_closed boolean;
begin
  select o.owner_id, o.updated_at into v_owner, v_updated from public.operations o where o.id = p_operation_id and o.deleted_at is null;
  if not found then return; end if;

  return query
  select t.id, t.trigger_event, t.title_template, t.description_template, t.default_priority_id,
         t.default_assignee_rule,
         case t.default_assignee_rule when 'operasyon_sorumlusu' then v_owner
              when 'belirli_kisi' then t.assignee_user_id else null end,
         t.due_offset_hours
  from public.task_templates t
  where t.is_active
    and not exists (select 1 from public.task_suggestion_state s
                    where s.operation_id = p_operation_id and s.kind = 'template' and s.ref_id = t.id)
    and (
      t.trigger_event = 'yeni_talep'
      or (t.trigger_event = 'teklif_gonderildi' and exists (select 1 from public.quotes q where q.operation_id = p_operation_id and q.deleted_at is null))
      or (t.trigger_event = 'numune_gonderildi' and exists (select 1 from public.samples sm where sm.operation_id = p_operation_id and sm.deleted_at is null))
      or (t.trigger_event = 'teslim_yaklasiyor' and exists (
            select 1 from public.orders ord join public.order_statuses os on os.id = ord.status_id
            where ord.operation_id = p_operation_id and ord.deleted_at is null and not os.is_closed
              and ord.promised_delivery is not null and ord.promised_delivery between v_now and v_now + 7))
      or (t.trigger_event = 'uzun_islemsiz' and v_updated < now() - interval '7 days')
    )
  order by t.sort_order;
end; $$;
grant execute on function public.operation_task_suggestions(bigint) to authenticated;

-- Kabul: görev oluştur + durumu 'accepted' işaretle (idempotent).
create or replace function public.accept_task_suggestion(p_operation_id bigint, p_kind text, p_ref_id bigint,
  p_title text, p_description text, p_priority_id bigint, p_assigned_to uuid, p_due_at timestamptz)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_task bigint;
begin
  if exists (select 1 from public.task_suggestion_state where operation_id=p_operation_id and kind=p_kind and ref_id=p_ref_id) then
    raise exception 'Bu öneri zaten işlenmiş.' using errcode='check_violation';
  end if;
  insert into public.tasks (title, description, priority_id, assigned_to, entity_type, entity_id, due_at, source, created_by)
  values (p_title, p_description, p_priority_id, p_assigned_to, 'operation', p_operation_id, p_due_at, 'otomatik', auth.uid())
  returning id into v_task;
  insert into public.task_suggestion_state (operation_id, kind, ref_id, state, task_id, created_by)
  values (p_operation_id, p_kind, p_ref_id, 'accepted', v_task, auth.uid());
  return v_task;
end; $$;
grant execute on function public.accept_task_suggestion(bigint, text, bigint, text, text, bigint, uuid, timestamptz) to authenticated;

-- Red: durumu 'dismissed' işaretle (tekrar önerilmez).
create or replace function public.dismiss_task_suggestion(p_operation_id bigint, p_kind text, p_ref_id bigint, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.task_suggestion_state (operation_id, kind, ref_id, state, reason, created_by)
  values (p_operation_id, p_kind, p_ref_id, 'dismissed', p_reason, auth.uid())
  on conflict (operation_id, kind, ref_id) do nothing;
end; $$;
grant execute on function public.dismiss_task_suggestion(bigint, text, bigint, text) to authenticated;
