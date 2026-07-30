-- =====================================================================
-- B.3 — ERTELEME MEKANİZMASI (onaylandı: Kapat→Git UI kararı; erteleme dönüşü mevcut kademeyle yeniden hatırlatır)
-- Uyarının üzerinde Ertele/Kapat. Ertele: sebep ZORUNLU + ne zaman. Kayıt tutulur, uyarı o
-- zamana kadar susar. Geri geldiğinde "N. kez ertelendi" + geçmiş görünür. Azami aşılınca
-- (ayardan, vars. 3) yöneticiye yükseltilir.
-- =====================================================================
insert into public.settings (key, value, category, description) values
  ('alerts.max_snooze_count', '3'::jsonb, 'alerts', 'Bir açık dosyanın azami erteleme sayısı; aşılınca yöneticiye yükseltilir.')
on conflict (key) do nothing;

create table public.open_file_snoozes (
  id            bigserial primary key,
  open_file_id  bigint not null references public.open_files(id) on delete cascade,
  reason        text not null check (length(trim(reason)) > 0),  -- SEBEP ZORUNLU
  snoozed_until timestamptz not null,
  snoozed_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index open_file_snoozes_file_idx on public.open_file_snoozes (open_file_id, created_at desc);
alter table public.open_file_snoozes enable row level security;
create policy open_file_snoozes_select on public.open_file_snoozes for select to authenticated using (public.is_active_user());
revoke all on public.open_file_snoozes from anon;
grant select on public.open_file_snoozes to authenticated;

-- ── snooze_open_file(open_file_id, reason, until) — ertele ──────────────────
create or replace function public.snooze_open_file(p_open_file_id bigint, p_reason text, p_until timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_op bigint; v_count int; v_max int; v_actor uuid := auth.uid();
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Erteleme sebebi zorunludur.' using errcode = '22004';
  end if;
  if p_until is null or p_until <= now() then
    raise exception 'Erteleme tarihi gelecekte olmalı.' using errcode = '22007';
  end if;
  select operation_id into v_op from public.open_files where id = p_open_file_id and closed_at is null;
  if not found then raise exception 'Açık dosya bulunamadı.' using errcode = 'P0002'; end if;

  insert into public.open_file_snoozes (open_file_id, reason, snoozed_until, snoozed_by)
  values (p_open_file_id, trim(p_reason), p_until, v_actor);

  update public.open_files
    set snooze_until = p_until, snooze_count = snooze_count + 1
    where id = p_open_file_id
    returning snooze_count into v_count;

  insert into public.event_log (event_type, entity_type, entity_id, actor_id, payload)
  values ('open_file_snoozed', 'operation', v_op::text, v_actor,
          jsonb_build_object('open_file_id', p_open_file_id, 'reason', trim(p_reason), 'until', p_until, 'count', v_count));

  -- Azami erteleme aşıldı → yöneticiye yükselt (hemen, dosya susmuş olsa da)
  v_max := public.of_hours('alerts.max_snooze_count', 3);
  if v_count > v_max then
    insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url)
    select u.id, 'open_file_snooze_exceeded', 'critical',
           (select code from public.operations where id = v_op) || ' · çok kez ertelendi',
           'Bu açık dosya ' || v_count || '. kez ertelendi (azami ' || v_max || '). Yöneticiye yükseltildi. Sebep: ' || trim(p_reason),
           'operation', v_op::text, '/talepler/' || v_op
    from public.users u join public.roles r on r.id = u.role_id
    where r.key in ('owner','admin','manager') and u.is_active;
  end if;

  return jsonb_build_object('snooze_count', v_count, 'escalated', v_count > v_max);
end; $$;
grant execute on function public.snooze_open_file(bigint, text, timestamptz) to authenticated;

-- ── MOTOR güncellemesi: erteleme bitince uyarı GERİ GELİR ───────────────────
-- Susma penceresi (snooze_until > now) → atla. Pencere bitince (snooze_until <= now) → mevcut
-- kademeyle bir kez yeniden hatırlat, snooze_until temizlenir. Normal kademe ilerlemesi aynen.
create or replace function public.process_open_file_alerts()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_warn numeric := public.of_hours('alerts.warn_at_percent', 50);
  v_urgent numeric := public.of_hours('alerts.urgent_at_percent', 85);
  v_esc numeric := public.of_hours('alerts.escalate_after_hours', 48);
  rec record; v_lvl int; v_eff int; v_return boolean; v_fire boolean; v_won int;
  v_code text; v_sev text; v_type text; v_title text; v_body text; v_cnt int := 0; v_flabel text; v_llabel text;
begin
  for rec in select * from public.open_files where closed_at is null loop
    -- Hâlâ erteli → sessiz
    if rec.snooze_until is not null and rec.snooze_until > now() then continue; end if;
    v_lvl := public.open_file_level(rec.opened_at, rec.due_at, now(), v_warn, v_urgent, v_esc, rec.file_type);
    v_return := rec.snooze_until is not null and rec.snooze_until <= now();
    v_eff := greatest(v_lvl, case when v_return then rec.last_level else 0 end);
    v_fire := false;

    if v_return then
      -- erteleme bitti → mevcut kademeyle yeniden hatırlat, snooze temizle
      update public.open_files set snooze_until = null, last_level = greatest(last_level, v_lvl), last_notified_at = now()
        where id = rec.id;
      v_fire := (v_eff >= 1);
    elsif v_lvl > rec.last_level then
      update public.open_files set last_level = v_lvl, last_notified_at = now() where id = rec.id and last_level < v_lvl;
      get diagnostics v_won = row_count;
      v_fire := (v_won > 0);
      v_eff := v_lvl;
    end if;

    if v_fire then
      select code into v_code from public.operations where id = rec.operation_id;
      v_flabel := case rec.file_type when 'teklif_bekleniyor' then 'Teklif' when 'sonuc_bekleniyor' then 'Sonuç' else 'Takip' end;
      v_sev := case when v_eff >= 3 then 'critical' when v_eff = 2 then 'warning' else 'info' end;
      v_type := 'open_file_' || case v_eff when 4 then 'escalated' when 3 then 'overdue' else 'warning' end;
      v_llabel := case v_eff when 1 then 'süresi yaklaşıyor' when 2 then 'süresi kritik' when 3 then 'süresi doldu' else 'yöneticiye yükseltildi' end;
      v_title := coalesce(v_code, 'Talep') || ' · ' || v_flabel || ' ' || v_llabel;
      v_body := v_flabel || ' açık dosyası ' || v_llabel || '. Son tarih: ' ||
                to_char(rec.due_at at time zone public.app_timezone(), 'DD.MM.YYYY HH24:MI') || '.';
      insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url)
      select uid, v_type, v_sev, v_title, v_body, 'operation', rec.operation_id::text, '/talepler/' || rec.operation_id
      from public.resolve_alert_recipients(rec.file_type, v_eff, rec.assigned_to) uid;
      v_cnt := v_cnt + 1;
    end if;
  end loop;
  return v_cnt;
end; $$;
