-- =====================================================================
-- P6.1 — Görev, ekip ve hedef şeması (baslangıc.docx Böl. 11 + 22).
--
-- Verilen kararlar (tartışmaya kapalı):
--   • Görev sistemi bildirim altyapısı üzerine kurulur (yeni bildirim sistemi yok).
--   • Açık dosya (sistem takibi) ≠ görev (kullanıcı planı) — ayrı kalır.
--   • Gerçekleşen değer HESAPLANIR, saklanmaz (goal_actual); Faz 7 raporları aynı fonksiyonu kullanır.
--   • Sorumluluk değişiklikleri geçmişte tutulur (task_assignments — Böl. 11.7).
--
-- Kullanıcı §5 cevapları: ekip ataması YOK (yalnız kişi; teams şeması hazır dursun),
-- hedefler TAM, alt görev düz liste (parent_task_id şemada kalır, arayüz hiyerarşi göstermez),
-- YZ 500 çağrı/gün. Kabul 2 (alt görev hiyerarşisi) kullanıcı kararıyla düz listeye indirildi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Ekipler (şema hazır; arayüz Faz 6'da sade — yalnız kişi ataması)
-- ---------------------------------------------------------------------
create table public.teams (
  id            bigint generated always as identity primary key,
  name          text not null,
  code          text unique,
  department_id bigint references public.departments (id) on delete set null,
  lead_user_id  uuid references public.users (id) on delete set null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create table public.team_members (
  id        bigint generated always as identity primary key,
  team_id   bigint not null references public.teams (id) on delete cascade,
  user_id   uuid   not null references public.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (team_id, user_id)
);

-- ---------------------------------------------------------------------
-- 2) Referans tablolar (ayarlardan yönetilir; order_statuses deseni)
-- ---------------------------------------------------------------------
create table public.task_statuses (
  id bigint generated always as identity primary key,
  key text not null unique, label text not null, sort_order int not null default 0,
  color text, is_default boolean not null default false, is_closed boolean not null default false,
  is_active boolean not null default true, is_system boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.task_statuses (key,label,sort_order,color,is_default,is_closed,is_system) values
  ('olusturuldu','Oluşturuldu',1,'neutral',true,false,true),
  ('beklemede','Beklemede',2,'warning',false,false,true),
  ('baslandi','Başlandı',3,'info',false,false,true),
  ('devam_ediyor','Devam Ediyor',4,'info',false,false,true),
  ('incelemede','İncelemede',5,'info',false,false,true),
  ('tamamlandi','Tamamlandı',6,'success',false,true,true),
  ('iptal_edildi','İptal Edildi',7,'danger',false,true,true);
create unique index task_statuses_single_default on public.task_statuses (is_default) where is_default;

create table public.task_priorities (
  id bigint generated always as identity primary key,
  key text not null unique, label text not null, sort_order int not null default 0,
  color text, weight int not null default 0, is_default boolean not null default false,
  is_active boolean not null default true, is_system boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.task_priorities (key,label,sort_order,color,weight,is_default,is_system) values
  ('dusuk','Düşük',1,'neutral',1,false,true),
  ('normal','Normal',2,'info',2,true,true),
  ('yuksek','Yüksek',3,'warning',3,false,true),
  ('kritik','Kritik',4,'danger',4,false,true);
create unique index task_priorities_single_default on public.task_priorities (is_default) where is_default;

-- ---------------------------------------------------------------------
-- 3) Görevler
-- ---------------------------------------------------------------------
create table public.tasks (
  id               bigint generated always as identity primary key,
  title            text not null,
  description      text,
  status_id        bigint references public.task_statuses (id) on delete restrict,
  priority_id      bigint references public.task_priorities (id) on delete restrict,
  assigned_to      uuid references public.users (id) on delete set null,
  assigned_team_id bigint references public.teams (id) on delete set null,
  created_by       uuid references public.users (id) on delete set null,
  parent_task_id   bigint references public.tasks (id) on delete set null,   -- düz liste (arayüz hiyerarşi göstermez)
  entity_type      text check (entity_type in ('operation','customer','lead')),
  entity_id        bigint,
  started_at       timestamptz,
  due_at           timestamptz,
  completed_at     timestamptz,
  estimated_hours  numeric(6,2),
  source           text not null default 'manuel' check (source in ('manuel','otomatik','ai_onerisi')),
  sort_order       int not null default 0,
  deleted_at       timestamptz, deleted_by uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default now(), updated_at timestamptz not null default now()
);
comment on table public.tasks is 'Kullanıcı görevleri (Böl. 11). Açık dosyalardan ayrı; kayda (operasyon/müşteri/lead) bağlanabilir ya da bağımsız.';
create index tasks_assigned_idx on public.tasks (assigned_to) where deleted_at is null;
create index tasks_status_idx   on public.tasks (status_id) where deleted_at is null;
create index tasks_due_idx      on public.tasks (due_at) where deleted_at is null and completed_at is null;
create index tasks_entity_idx   on public.tasks (entity_type, entity_id) where deleted_at is null;
create index tasks_parent_idx   on public.tasks (parent_task_id) where parent_task_id is not null;

-- durum → tamamlandı: completed_at otomatik; başlandı: started_at
create or replace function public.tasks_stamp()
returns trigger language plpgsql set search_path = '' as $$
declare v_closed boolean; v_key text;
begin
  if new.status_id is null then
    select id into new.status_id from public.task_statuses where is_default limit 1;
  end if;
  select key, is_closed into v_key, v_closed from public.task_statuses where id = new.status_id;
  if v_key = 'tamamlandi' and new.completed_at is null then new.completed_at := now(); end if;
  if v_key <> 'tamamlandi' then new.completed_at := null; end if;
  if new.started_at is null and v_key in ('baslandi','devam_ediyor','incelemede') then new.started_at := now(); end if;
  if new.priority_id is null then select id into new.priority_id from public.task_priorities where is_default limit 1; end if;
  return new;
end; $$;
create trigger tasks_stamp before insert or update on public.tasks for each row execute function public.tasks_stamp();
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();
create trigger tasks_audit after insert or update or delete on public.tasks for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- 4) Bağımlılıklar (Böl. 11.9) — yumuşak kapı: uyarır, engellemez
-- ---------------------------------------------------------------------
create table public.task_dependencies (
  id                 bigint generated always as identity primary key,
  task_id            bigint not null references public.tasks (id) on delete cascade,
  depends_on_task_id bigint not null references public.tasks (id) on delete cascade,
  dependency_type    text not null default 'finish_to_start',
  created_at         timestamptz not null default now(),
  unique (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);
-- Bir görevin tamamlanmamış bağımlılıkları (yumuşak kapı için).
create or replace function public.task_blocking(p_task_id bigint)
returns table (depends_on_task_id bigint, title text, status_key text)
language sql stable security definer set search_path = '' as $$
  select d.depends_on_task_id, t.title, s.key
  from public.task_dependencies d
  join public.tasks t on t.id = d.depends_on_task_id and t.deleted_at is null
  join public.task_statuses s on s.id = t.status_id
  where d.task_id = p_task_id and not s.is_closed;   -- kapalı (tamamlandı/iptal) değilse bekliyor
$$;
grant execute on function public.task_blocking(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 5) Sorumluluk geçmişi (Böl. 11.7) — assigned_to değişince otomatik kaydedilir
-- ---------------------------------------------------------------------
create table public.task_assignments (
  id            bigint generated always as identity primary key,
  task_id       bigint not null references public.tasks (id) on delete cascade,
  assigned_to   uuid references public.users (id) on delete set null,
  assigned_by   uuid references public.users (id) on delete set null,
  assigned_at   timestamptz not null default now(),
  unassigned_at timestamptz,
  reason        text
);
create index task_assignments_task_idx on public.task_assignments (task_id, assigned_at);

create or replace function public.tasks_track_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.assigned_to is not null then
      insert into public.task_assignments (task_id, assigned_to, assigned_by, assigned_at)
      values (new.id, new.assigned_to, auth.uid(), now());
    end if;
  elsif tg_op = 'UPDATE' and new.assigned_to is distinct from old.assigned_to then
    -- öncekini kapat
    update public.task_assignments set unassigned_at = now()
    where task_id = new.id and unassigned_at is null;
    if new.assigned_to is not null then
      insert into public.task_assignments (task_id, assigned_to, assigned_by, assigned_at)
      values (new.id, new.assigned_to, auth.uid(), now());
    end if;
  end if;
  return new;
end; $$;
create trigger tasks_assignment after insert or update of assigned_to on public.tasks
  for each row execute function public.tasks_track_assignment();

-- ---------------------------------------------------------------------
-- 6) Alt görev ilerlemesi (arayüz düz liste; fonksiyon ileride hiyerarşi için hazır)
-- ---------------------------------------------------------------------
create or replace function public.task_subtree_progress(p_task_id bigint)
returns numeric language sql stable security definer set search_path = '' as $$
  select case when count(*) = 0 then null
    else round(100.0 * count(*) filter (where s.is_closed and s.key = 'tamamlandi') / count(*), 0) end
  from public.tasks t join public.task_statuses s on s.id = t.status_id
  where t.parent_task_id = p_task_id and t.deleted_at is null;
$$;
grant execute on function public.task_subtree_progress(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 7) İş yükü göstergesi (Böl. 11.7) — atama sırasında görünür
-- ---------------------------------------------------------------------
create or replace function public.user_workload(p_user_id uuid)
returns table (open_count bigint, estimated_hours numeric)
language sql stable security definer set search_path = '' as $$
  select count(*), coalesce(sum(t.estimated_hours), 0)
  from public.tasks t join public.task_statuses s on s.id = t.status_id
  where t.assigned_to = p_user_id and t.deleted_at is null and not s.is_closed;
$$;
grant execute on function public.user_workload(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8) Hedefler (Böl. 11 hedefler; gerçekleşen HESAPLANIR)
--    Kapsam tipli sütunlar (person = uuid; şemadaki tek scope_id bigint uuid taşıyamaz).
-- ---------------------------------------------------------------------
create table public.goals (
  id                   bigint generated always as identity primary key,
  name                 text not null,
  goal_type            text not null check (goal_type in ('talep_sayisi','teklif_sayisi','siparis_sayisi','ciro','donusum_orani','etkilesim_sayisi')),
  scope                text not null check (scope in ('sirket','departman','ekip','kisi')),
  scope_user_id        uuid   references public.users (id) on delete cascade,
  scope_department_id  bigint references public.departments (id) on delete cascade,
  scope_team_id        bigint references public.teams (id) on delete cascade,
  period_type          text not null check (period_type in ('aylik','ceyreklik','yillik')),
  period_start         date not null,
  period_end           date not null,
  target_value         numeric(14,2) not null,
  currency             text,   -- ciro hedeflerinde
  is_active            boolean not null default true,
  created_by           uuid references public.users (id) on delete set null,
  created_at           timestamptz not null default now(), updated_at timestamptz not null default now()
);
comment on table public.goals is 'Hedefler. Gerçekleşen goal_actual() ile HESAPLANIR (saklanmaz); Faz 7 raporları aynı fonksiyonu kullanır.';
create trigger goals_touch before update on public.goals for each row execute function public.touch_updated_at();
create trigger goals_audit after insert or update or delete on public.goals for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- notes/files: 'task' kapsamını da kabul etsin (P6.2 not/dosya için)
-- ---------------------------------------------------------------------
alter table public.notes drop constraint if exists notes_entity_type_check;
alter table public.notes add constraint notes_entity_type_check
  check (entity_type in ('lead','customer','operation','task'));

-- ---------------------------------------------------------------------
-- RLS: görevler işbirlikçidir → aktif kullanıcı okur/yazar (Böl. 11 görünürlük).
-- ---------------------------------------------------------------------
alter table public.teams              enable row level security;
alter table public.team_members       enable row level security;
alter table public.task_statuses      enable row level security;
alter table public.task_priorities    enable row level security;
alter table public.tasks              enable row level security;
alter table public.task_dependencies  enable row level security;
alter table public.task_assignments   enable row level security;
alter table public.goals              enable row level security;

-- referans + görev okuma: aktif kullanıcı; yazma: aktif kullanıcı (görevler herkese açık iş)
do $$ declare t text; begin
  foreach t in array array['teams','team_members','tasks','task_dependencies','task_assignments','goals'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.is_active_user());', t);
    execute format('create policy %1$s_write  on public.%1$s for all to authenticated using (public.is_active_user()) with check (public.is_active_user());', t);
    execute format('revoke all on public.%1$s from anon; grant select, insert, update, delete on public.%1$s to authenticated;', t);
  end loop;
end $$;
-- statü/öncelik: okuma herkes, yazma owner/admin (referans yönetimi)
create policy task_statuses_select on public.task_statuses for select to authenticated using (public.is_active_user());
create policy task_statuses_write  on public.task_statuses for all to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());
create policy task_priorities_select on public.task_priorities for select to authenticated using (public.is_active_user());
create policy task_priorities_write  on public.task_priorities for all to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());
revoke all on public.task_statuses, public.task_priorities from anon;
grant select, insert, update, delete on public.task_statuses, public.task_priorities to authenticated;

-- ---------------------------------------------------------------------
-- 9) goal_actual — hedef tipine göre gerçekleşen (kapsam + dönem). Faz 7 de kullanır.
--    NOT: ciro finansal veri okur ama bu YALNIZ hedef/rapor içindir; YZ'ye GÖNDERİLMEZ.
-- ---------------------------------------------------------------------
create or replace function public.goal_actual(p_goal_id bigint)
returns numeric language plpgsql stable security definer set search_path = '' as $$
declare g public.goals; v numeric := 0; v_uids uuid[];
begin
  select * into g from public.goals where id = p_goal_id;
  if not found then return 0; end if;

  -- kapsamdaki kullanıcılar (kisi/ekip/departman); sirket → null (hepsi)
  if g.scope = 'kisi' then v_uids := array[g.scope_user_id];
  elsif g.scope = 'ekip' then select array_agg(user_id) into v_uids from public.team_members where team_id = g.scope_team_id;
  elsif g.scope = 'departman' then select array_agg(id) into v_uids from public.users where department_id = g.scope_department_id and is_active;
  end if;

  if g.goal_type = 'talep_sayisi' then
    select count(*) into v from public.operations o
    where o.deleted_at is null and o.created_at::date between g.period_start and g.period_end
      and (v_uids is null or o.owner_id = any(v_uids));
  elsif g.goal_type = 'teklif_sayisi' then
    select count(*) into v from public.quotes q join public.operations o on o.id = q.operation_id
    where q.deleted_at is null and q.created_at::date between g.period_start and g.period_end
      and (v_uids is null or o.owner_id = any(v_uids));
  elsif g.goal_type = 'siparis_sayisi' then
    select count(*) into v from public.orders ord join public.operations o on o.id = ord.operation_id
    where ord.deleted_at is null and ord.order_date between g.period_start and g.period_end
      and (v_uids is null or o.owner_id = any(v_uids));
  elsif g.goal_type = 'ciro' then
    -- ÇOK PARA BİRİMİ DOĞRU: ham total toplanmaz (1000$+1000₺≠2000). Faz 5 account_transactions'tan
    -- besle — her hareketin amount_usd/amount_try'si işlem anındaki kurla DONMUŞ. Hedef para birimi
    -- USD ise amount_usd, TRY ise amount_try. Kaynak: dönemdeki 'siparis' borç hareketleri.
    select coalesce(sum(case when coalesce(g.currency,'TRY') = 'USD' then at.amount_usd else at.amount_try end), 0)
      into v from public.account_transactions at
      join public.operations o on o.id = at.operation_id
    where at.deleted_at is null and at.source_type = 'siparis' and at.direction = 'borc'
      and at.occurred_at::date between g.period_start and g.period_end
      and (v_uids is null or o.owner_id = any(v_uids));
  elsif g.goal_type = 'etkilesim_sayisi' then
    select count(*) into v from public.interactions i
    where i.deleted_at is null and i.created_at::date between g.period_start and g.period_end
      and (v_uids is null or i.created_by = any(v_uids));
  elsif g.goal_type = 'donusum_orani' then
    -- dönemde müşteriye dönüşen lead / toplam lead (%).
    select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where converted_at is not null) / count(*), 2) end
      into v from public.leads l
    where l.deleted_at is null and l.created_at::date between g.period_start and g.period_end;
  end if;
  return coalesce(v, 0);
end; $$;
grant execute on function public.goal_actual(bigint) to authenticated;
