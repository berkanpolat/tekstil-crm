-- =====================================================================
-- P6.10 — Görev/hedef bildirimleri (mevcut notifications altyapısı; yeni sistem yok).
--   task_assigned (ses var) · task_due_soon (ses yok) · task_overdue (ses var) ·
--   task_blocked (ses var) · goal_at_risk (ses yok). Böl. 11.10: gürültüye dönüşmesin
--   → varsayılan muhafazakâr, kullanıcı profilinden kapatabilir (mevcut bildirim ayarı).
-- =====================================================================

alter table public.tasks add column if not exists due_warned_at timestamptz;
alter table public.tasks add column if not exists overdue_notified_at timestamptz;
alter table public.goals add column if not exists risk_notified_at timestamptz;

insert into public.settings (key, value, category, description) values
  ('tasks.due_warning_days', '1'::jsonb, 'alerts', 'Görev son tarihine bu kadar gün kala uyarı.'),
  ('goals.risk_warning_days', '7'::jsonb, 'alerts', 'Hedef dönem sonuna bu kadar gün kala, geride kalınıyorsa uyarı.')
on conflict (key) do nothing;

-- ── task_assigned — atama anında sorumluya (kendine atama bildirmez) ──────────
create or replace function public.tasks_notify_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.assigned_to is not null
     and new.assigned_to is distinct from old.assigned_to
     and new.assigned_to <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) then
    insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
    values (new.assigned_to, 'task_assigned', 'info', 'Sana görev atandı', new.title, 'task', new.id::text, '/gorevler', false);
  end if;
  return new;
end; $$;
create trigger tasks_notify_assign after insert or update of assigned_to on public.tasks
  for each row execute function public.tasks_notify_assignment();

-- ── task_blocked — bir görev TAMAMLANINCA, onu bekleyen (artık serbest) görevlerin sorumlusuna ─
create or replace function public.tasks_notify_unblock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record; v_closed boolean;
begin
  select is_closed into v_closed from public.task_statuses where id = new.status_id;
  if not v_closed then return new; end if;
  -- eski durum kapalı DEĞİLDİYSE (yeni kapandıysa) bağımlıları kontrol et
  if exists (select 1 from public.task_statuses s where s.id = old.status_id and s.is_closed) then return new; end if;
  for r in select d.task_id from public.task_dependencies d where d.depends_on_task_id = new.id loop
    -- bağımlı görev artık hiç bekleme kalmadıysa + sorumlusu varsa bildir
    if not exists (select 1 from public.task_blocking(r.task_id)) then
      insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
      select t.assigned_to, 'task_blocked', 'info', 'Beklediğin görev tamamlandı', t.title, 'task', t.id::text, '/gorevler', false
      from public.tasks t where t.id = r.task_id and t.assigned_to is not null and t.deleted_at is null;
    end if;
  end loop;
  return new;
end; $$;
create trigger tasks_notify_unblock after update of status_id on public.tasks
  for each row execute function public.tasks_notify_unblock();

-- ── process_task_due_warnings — vade yaklaşan (ses yok) / geçen (ses var) ─────
create or replace function public.process_task_due_warnings()
returns int language plpgsql security definer set search_path = '' as $$
declare rec record; v_days int; v_cnt int := 0;
begin
  v_days := coalesce((select (value #>> '{}')::int from public.settings where key='tasks.due_warning_days'), 1);
  for rec in
    select t.id, t.title, t.assigned_to, t.due_at, t.due_warned_at, t.overdue_notified_at
    from public.tasks t join public.task_statuses s on s.id = t.status_id
    where t.deleted_at is null and t.completed_at is null and not s.is_closed
      and t.assigned_to is not null and t.due_at is not null
  loop
    if rec.due_at < now() and rec.overdue_notified_at is null then
      update public.tasks set overdue_notified_at = now() where id = rec.id;
      insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
      values (rec.assigned_to, 'task_overdue', 'critical', 'Görev gecikti', rec.title, 'task', rec.id::text, '/gorevler', false);
      v_cnt := v_cnt + 1;
    elsif rec.due_at <= now() + (v_days || ' days')::interval and rec.due_warned_at is null then
      update public.tasks set due_warned_at = now() where id = rec.id;
      insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
      values (rec.assigned_to, 'task_due_soon', 'warning', 'Görev son tarihi yaklaşıyor', rec.title, 'task', rec.id::text, '/gorevler', true);
      v_cnt := v_cnt + 1;
    end if;
  end loop;
  return v_cnt;
end; $$;
grant execute on function public.process_task_due_warnings() to authenticated;

-- ── process_goal_notifications — dönem sonu yaklaşırken hedefin gerisinde ise (ses yok) ─
create or replace function public.process_goal_notifications()
returns int language plpgsql security definer set search_path = '' as $$
declare rec record; v_thresh int; v_today date := (now() at time zone public.app_timezone())::date;
  v_actual numeric; v_expected numeric; v_elapsed numeric; v_cnt int := 0; v_uid uuid;
begin
  v_thresh := coalesce((select (value #>> '{}')::int from public.settings where key='goals.risk_warning_days'), 7);
  for rec in
    select * from public.goals
    where is_active and risk_notified_at is null and period_end between v_today and v_today + v_thresh
  loop
    v_elapsed := case when rec.period_end > rec.period_start
      then least(1, greatest(0, (v_today - rec.period_start)::numeric / (rec.period_end - rec.period_start))) else 1 end;
    v_actual := public.goal_actual(rec.id);
    v_expected := rec.target_value * v_elapsed;
    if v_actual < v_expected * 0.7 then   -- beklenenin %70'inin altında → risk
      update public.goals set risk_notified_at = now() where id = rec.id;
      v_uid := coalesce(rec.scope_user_id, rec.created_by);
      if v_uid is not null then
        insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url, silent)
        values (v_uid, 'goal_at_risk', 'warning', 'Hedefin gerisinde kalınıyor',
          rec.name || ': gerçekleşen ' || round(v_actual,0) || ' / hedef ' || round(rec.target_value,0), 'goal', rec.id::text, '/hedefler', true);
        v_cnt := v_cnt + 1;
      end if;
    end if;
  end loop;
  return v_cnt;
end; $$;
grant execute on function public.process_goal_notifications() to authenticated;
