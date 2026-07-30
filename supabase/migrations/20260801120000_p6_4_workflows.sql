-- =====================================================================
-- P6.4 — İş akışları (Böl. 11.12). Bir aşama geçişinde otomatik ÖNERİLECEK görev grubu.
--   Basit: bir olayda bir görev listesi. Koşullu dallanma YOK.
--   Öneri olarak gelir (task_suggestion_state, kind='workflow_step'); kullanıcı onaylar.
-- =====================================================================

create table public.workflows (
  id            bigint generated always as identity primary key,
  name          text not null,
  trigger_event text not null,   -- ör. siparis_uretimde
  is_active     boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.workflow_steps (
  id                    bigint generated always as identity primary key,
  workflow_id           bigint not null references public.workflows (id) on delete cascade,
  title_template        text not null,
  description_template  text,
  default_priority_id   bigint references public.task_priorities (id) on delete set null,
  default_assignee_rule text not null default 'operasyon_sorumlusu'
    check (default_assignee_rule in ('operasyon_sorumlusu','belirli_kisi','ekip','bos_birak')),
  assignee_user_id      uuid references public.users (id) on delete set null,
  due_offset_hours      int not null default 24,
  sort_order            int not null default 0
);

-- Tohum: "Sipariş üretime geçti" → 5 adım (Böl. 11.8 örneği)
do $$ declare wid bigint; begin
  insert into public.workflows (name, trigger_event) values ('Sipariş üretime geçti','siparis_uretimde') returning id into wid;
  insert into public.workflow_steps (workflow_id, title_template, sort_order) values
    (wid,'Kumaşı onayla',1),(wid,'Baskıyı onayla',2),(wid,'Etiket kontrolü',3),(wid,'Kalite kontrol',4),(wid,'Paketleme',5);
end $$;

create trigger workflows_touch before update on public.workflows for each row execute function public.touch_updated_at();
alter table public.workflows enable row level security;
alter table public.workflow_steps enable row level security;
create policy workflows_select on public.workflows for select to authenticated using (public.is_active_user());
create policy workflows_write  on public.workflows for all to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());
create policy workflow_steps_select on public.workflow_steps for select to authenticated using (public.is_active_user());
create policy workflow_steps_write  on public.workflow_steps for all to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());
revoke all on public.workflows, public.workflow_steps from anon;
grant select, insert, update, delete on public.workflows, public.workflow_steps to authenticated;

-- ---------------------------------------------------------------------
-- operation_workflow_suggestions — mevcut aşamaya uyan iş akışı adımları (öneri).
-- ---------------------------------------------------------------------
create or replace function public.operation_workflow_suggestions(p_operation_id bigint)
returns table (step_id bigint, workflow_name text, trigger_event text, title text, description text,
               priority_id bigint, assignee_rule text, resolved_assignee uuid, due_offset_hours int)
language plpgsql stable security definer set search_path = '' as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.operations where id = p_operation_id and deleted_at is null;
  if not found then return; end if;
  return query
  select st.id, w.name, w.trigger_event, st.title_template, st.description_template, st.default_priority_id,
         st.default_assignee_rule,
         case st.default_assignee_rule when 'operasyon_sorumlusu' then v_owner when 'belirli_kisi' then st.assignee_user_id else null end,
         st.due_offset_hours
  from public.workflows w join public.workflow_steps st on st.workflow_id = w.id
  where w.is_active
    and not exists (select 1 from public.task_suggestion_state s
                    where s.operation_id = p_operation_id and s.kind = 'workflow_step' and s.ref_id = st.id)
    and (
      w.trigger_event = 'siparis_uretimde' and exists (
        select 1 from public.orders ord join public.order_statuses os on os.id = ord.status_id
        where ord.operation_id = p_operation_id and ord.deleted_at is null and os.key = 'uretimde')
    )
  order by st.sort_order;
end; $$;
grant execute on function public.operation_workflow_suggestions(bigint) to authenticated;
