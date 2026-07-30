-- =====================================================================
-- B.2 — KADEMELİ UYARI MOTORU + destekleyici tablolar (notifications [B.4 şeması],
-- notification_rules [B.6 şeması]). Motor okuma anında çalışır (cron yok): arayüz
-- periyodik RPC çağırır, fonksiyon açık dosyaların kademesini hesaplar, yeni kademe
-- geçişinde bildirim üretir. Her kademe BİR KEZ (last_level). Yarış-güvenli (koşullu update).
-- =====================================================================

-- Kademe eşikleri (B.1'de quote/result due saat vardı; kalanlar burada)
insert into public.settings (key, value, category, description) values
  ('alerts.warn_at_percent',      '50'::jsonb, 'alerts', 'Yumuşak uyarı eşiği (sürenin %''si).'),
  ('alerts.urgent_at_percent',    '85'::jsonb, 'alerts', 'Belirgin uyarı eşiği (sürenin %''si).'),
  ('alerts.escalate_after_hours', '48'::jsonb, 'alerts', 'Süre dolduktan sonra yöneticiye yükseltme (saat).'),
  ('alerts.check_interval_minutes','15'::jsonb, 'alerts', 'Arayüz uyarı kontrol sıklığı (dakika).'),
  ('alerts.pool_recipients', '[{"type":"rol","ref":"operations"}]'::jsonb, 'alerts',
     'Sahipsiz (havuz) açık dosyaların bildirim alıcıları. Boşsa o dosyalar kimseye görünmez.')
on conflict (key) do nothing;

-- ── notifications (B.4 şeması) ──────────────────────────────────────────────
create table public.notifications (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  type         text not null,
  severity     text not null default 'info' check (severity in ('info','warning','critical')),
  title        text not null,
  body         text,
  entity_type  text,
  entity_id    text,
  action_url   text,
  read_at      timestamptz,
  dismissed_at timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null and dismissed_at is null;
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
-- Kullanıcı yalnızca kendi bildirimlerini görür/günceller
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.notifications from anon;
grant select, update on public.notifications to authenticated;
-- Gerçek zamanlı (B.4)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ── notification_rules (B.6 şeması) — hangi kademe kime gider ───────────────
create table public.notification_rules (
  id             bigserial primary key,
  file_type      text not null,
  level          int not null,
  scope          text not null default 'assigned' check (scope in ('assigned','pool')),
  recipient_type text not null check (recipient_type in ('sorumlu','kisi','departman','rol')),
  recipient_ref  text,   -- kisi=uuid · departman=id · rol=key · sorumlu=null (dinamik)
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index notification_rules_lookup_idx on public.notification_rules (file_type, level, scope) where is_active;
alter table public.notification_rules enable row level security;
create policy notification_rules_select on public.notification_rules for select to authenticated using (public.is_active_user());
revoke all on public.notification_rules from anon;
grant select on public.notification_rules to authenticated;
create trigger notification_rules_touch before update on public.notification_rules for each row execute function public.touch_updated_at();

-- Varsayılan kurallar: atanmış → L1-2 sorumlu, L3 sorumlu, L4 yönetici (admin+owner).
insert into public.notification_rules (file_type, level, scope, recipient_type, recipient_ref)
select ft, lvl, 'assigned', 'sorumlu', null from unnest(array['teklif_bekleniyor','sonuc_bekleniyor','olumlu_beklemede']) ft, unnest(array[1,2,3]) lvl
union all
select ft, 4, 'assigned', 'rol', r from unnest(array['teklif_bekleniyor','sonuc_bekleniyor','olumlu_beklemede']) ft, unnest(array['admin','owner']) r;
-- Havuz (sahipsiz) → operations ekibi tüm kademelerde + L4 yönetici
insert into public.notification_rules (file_type, level, scope, recipient_type, recipient_ref)
select ft, lvl, 'pool', 'rol', 'operations' from unnest(array['teklif_bekleniyor','sonuc_bekleniyor']) ft, unnest(array[1,2,3,4]) lvl
union all
select ft, 4, 'pool', 'rol', 'admin' from unnest(array['teklif_bekleniyor','sonuc_bekleniyor']) ft;

-- ── kademe hesabı ───────────────────────────────────────────────────────────
-- 4 kademe: 1 yumuşak(%warn) · 2 belirgin(%urgent) · 3 süre doldu(%100) · 4 yükseltme(due+escalate).
-- olumlu_beklemede: erken uyarı yok (yalnızca due=3 ve escalate=4) — "o tarihte hatırlat".
create or replace function public.open_file_level(p_opened timestamptz, p_due timestamptz, p_now timestamptz,
  p_warn numeric, p_urgent numeric, p_escalate_hours numeric, p_file_type text)
returns int language sql immutable as $$
  select case
    when p_now >= p_due + (p_escalate_hours * interval '1 hour') then 4
    when p_now >= p_due then 3
    when p_file_type = 'olumlu_beklemede' then 0
    when extract(epoch from p_now - p_opened) / nullif(extract(epoch from p_due - p_opened), 0) * 100 >= p_urgent then 2
    when extract(epoch from p_now - p_opened) / nullif(extract(epoch from p_due - p_opened), 0) * 100 >= p_warn then 1
    else 0 end;
$$;

-- ── alıcı çözümü (atanmışsa 'assigned' kuralları; sahipsizse 'pool') ─────────
create or replace function public.resolve_alert_recipients(p_file_type text, p_level int, p_assigned uuid)
returns setof uuid language plpgsql stable security definer set search_path = '' as $$
declare v_scope text := case when p_assigned is null then 'pool' else 'assigned' end; r record;
begin
  for r in select recipient_type, recipient_ref from public.notification_rules
           where file_type = p_file_type and level = p_level and scope = v_scope and is_active loop
    if r.recipient_type = 'sorumlu' then
      if p_assigned is not null then return next p_assigned; end if;
    elsif r.recipient_type = 'kisi' then
      return query select u.id from public.users u where u.id = r.recipient_ref::uuid and u.is_active;
    elsif r.recipient_type = 'departman' then
      return query select u.id from public.users u where u.department_id = r.recipient_ref::bigint and u.is_active;
    elsif r.recipient_type = 'rol' then
      return query select u.id from public.users u join public.roles ro on ro.id = u.role_id
                   where ro.key = r.recipient_ref and u.is_active;
    end if;
  end loop;
end; $$;

-- ── MOTOR: açık dosyaların kademelerini hesapla, yeni geçişte bildirim üret ──
create or replace function public.process_open_file_alerts()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_warn numeric := public.of_hours('alerts.warn_at_percent', 50);
  v_urgent numeric := public.of_hours('alerts.urgent_at_percent', 85);
  v_esc numeric := public.of_hours('alerts.escalate_after_hours', 48);
  rec record; v_lvl int; v_code text; v_sev text; v_type text; v_title text; v_body text; v_cnt int := 0; v_won int;
  v_flabel text; v_llabel text;
begin
  for rec in
    select * from public.open_files
    where closed_at is null and (snooze_until is null or snooze_until <= now())
  loop
    v_lvl := public.open_file_level(rec.opened_at, rec.due_at, now(), v_warn, v_urgent, v_esc, rec.file_type);
    if v_lvl > rec.last_level then
      -- yarış-güvenli ilerletme: yalnızca gerçekten ilerleten kazanır → tek bildirim
      update public.open_files set last_level = v_lvl, last_notified_at = now()
        where id = rec.id and last_level < v_lvl;
      get diagnostics v_won = row_count;
      if v_won > 0 then
        select code into v_code from public.operations where id = rec.operation_id;
        v_flabel := case rec.file_type when 'teklif_bekleniyor' then 'Teklif' when 'sonuc_bekleniyor' then 'Sonuç' else 'Takip' end;
        v_sev := case when v_lvl >= 3 then 'critical' when v_lvl = 2 then 'warning' else 'info' end;
        v_type := 'open_file_' || case v_lvl when 4 then 'escalated' when 3 then 'overdue' else 'warning' end;
        v_llabel := case v_lvl when 1 then 'süresi yaklaşıyor' when 2 then 'süresi kritik' when 3 then 'süresi doldu' else 'yöneticiye yükseltildi' end;
        v_title := coalesce(v_code, 'Talep') || ' · ' || v_flabel || ' ' || v_llabel;
        v_body := v_flabel || ' açık dosyası ' || v_llabel || '. Son tarih: ' ||
                  to_char(rec.due_at at time zone public.app_timezone(), 'DD.MM.YYYY HH24:MI') || '.';
        insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url)
        select uid, v_type, v_sev, v_title, v_body, 'operation', rec.operation_id::text, '/talepler/' || rec.operation_id
        from public.resolve_alert_recipients(rec.file_type, v_lvl, rec.assigned_to) uid;
        v_cnt := v_cnt + 1;
      end if;
    end if;
  end loop;
  return v_cnt;
end; $$;
grant execute on function public.process_open_file_alerts() to authenticated;
comment on function public.process_open_file_alerts() is
  'B.2 — Açık dosyaların kademesini hesaplar, yeni geçişte notifications üretir. Arayüz alerts.check_interval_minutes''de bir çağırır. Yarış-güvenli, her kademe bir kez.';

-- Havuz üstlenme (kabul 12): sahipsiz dosya üstlenilince (owner null→dolu) DİĞER havuz
-- alıcılarının okunmamış açık-dosya bildirimleri kapanır. open_files_on_operation'a eklenir.
create or replace function public.open_files_on_operation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_new_key text; v_old_key text;
begin
  if tg_op = 'INSERT' then
    if new.cancelled_at is null then
      perform public.of_open(new.id, 'teklif_bekleniyor',
        coalesce(new.requested_at, now()) + public.of_hours('alerts.quote_due_hours', 24) * interval '1 hour');
    end if;
    return null;
  end if;

  if new.cancelled_at is not null and old.cancelled_at is null then
    perform public.of_close(new.id, 'teklif_bekleniyor', 'operasyon_iptal');
    perform public.of_close(new.id, 'sonuc_bekleniyor', 'operasyon_iptal');
    perform public.of_close(new.id, 'olumlu_beklemede', 'operasyon_iptal');
    return null;
  end if;

  if new.owner_id is distinct from old.owner_id then
    update public.open_files set assigned_to = new.owner_id where operation_id = new.id and closed_at is null;
    -- Üstlenildi → diğer havuz alıcılarının bekleyen bildirimleri kapanır
    if old.owner_id is null and new.owner_id is not null then
      update public.notifications set dismissed_at = now()
        where entity_type = 'operation' and entity_id = new.id::text and type like 'open_file_%'
          and user_id <> new.owner_id and dismissed_at is null and read_at is null;
    end if;
  end if;

  if new.request_status_id is distinct from old.request_status_id then
    select key into v_new_key from public.request_statuses where id = new.request_status_id;
    select key into v_old_key from public.request_statuses where id = old.request_status_id;
    if v_new_key = 'teklif_iletildi' then
      perform public.of_close(new.id, 'teklif_bekleniyor', 'teklif_uretildi');
      perform public.of_open(new.id, 'sonuc_bekleniyor',
        now() + public.of_hours('alerts.result_due_hours', 36) * interval '1 hour');
    elsif v_new_key = 'teklif_bekliyor' then
      perform public.of_close(new.id, 'sonuc_bekleniyor', 'teklif_geri_alindi');
      perform public.of_close(new.id, 'olumlu_beklemede', 'teklif_geri_alindi');
      perform public.of_open(new.id, 'teklif_bekleniyor',
        now() + public.of_hours('alerts.quote_due_hours', 24) * interval '1 hour');
    end if;
  end if;
  return null;
end; $$;
