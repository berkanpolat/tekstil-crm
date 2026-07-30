-- =====================================================================
-- B.1 — AÇIK DOSYA MODELİ (onaylandı: sla_deadline korunur→B.7, assigned_to sahiple senkron, backfill gerçek tarihten + bildirimsiz)
-- İş sahibinin "açık dosya" kavramı: takip edilen, süre içinde kapanması gereken iş kalemleri.
--   teklif_bekleniyor  : talep geldi, teklif verilmedi   (varsayılan 24 saat)
--   sonuc_bekleniyor   : teklif iletildi, sonuç girilmedi (varsayılan 36 saat)
--   olumlu_beklemede   : olumlu ama bekliyor → due = kullanıcının girdiği tekrar-bak tarihi (H6)
-- Süreler TAKVİM saatiyle (H1 ile tutarlı). Eşikler settings'ten. Her açılış/kapanış event_log'a.
-- Mevcut yapıya bağlanır: operations.request_status_id (teklif_bekliyor/teklif_iletildi),
-- quotes.status_id sonucu + quotes.follow_up_at (H6), operations.owner_id (havuz).
-- =====================================================================

-- Eşikler (B.1 için gerekli ikisi; kademe eşikleri B.2'de eklenecek)
insert into public.settings (key, value, category, description) values
  ('alerts.quote_due_hours',  '24'::jsonb, 'alerts', 'Talep → teklif verme süresi (takvim saati).'),
  ('alerts.result_due_hours', '36'::jsonb, 'alerts', 'Teklif iletildi → sonuç girme süresi (takvim saati).')
on conflict (key) do nothing;

create table public.open_files (
  id                bigserial primary key,
  operation_id      bigint not null references public.operations(id) on delete cascade,
  file_type         text not null check (file_type in ('teklif_bekleniyor','sonuc_bekleniyor','olumlu_beklemede')),
  opened_at         timestamptz not null default now(),
  due_at            timestamptz not null,
  closed_at         timestamptz,
  closed_by         uuid references auth.users(id),
  close_reason      text,
  assigned_to       uuid references auth.users(id),   -- null = havuzda (operations.owner_id ile senkron)
  snooze_until      timestamptz,
  snooze_count      int not null default 0,
  last_notified_at  timestamptz,
  last_level        int not null default 0,           -- kaçıncı kademe uyarı gitti (B.2)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- Bir operasyonda aynı tipten aynı anda tek AÇIK dosya
create unique index open_files_one_open_uidx on public.open_files (operation_id, file_type) where closed_at is null;
create index open_files_open_idx on public.open_files (due_at) where closed_at is null;
create index open_files_assigned_idx on public.open_files (assigned_to) where closed_at is null;

alter table public.open_files enable row level security;
create policy open_files_select on public.open_files for select to authenticated using (public.is_active_user());
-- yazım yalnızca SECURITY DEFINER fonksiyonlar/trigger'lar ve RPC üzerinden
revoke all on public.open_files from anon;
grant select on public.open_files to authenticated;

create trigger open_files_touch before update on public.open_files for each row execute function public.touch_updated_at();

-- ── yardımcılar ───────────────────────────────────────────────────────────
create or replace function public.of_hours(p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::numeric from public.settings where key = p_key), p_default);
$$;

/** Açık dosya aç (aynı tip zaten açıksa dokunma). */
create or replace function public.of_open(p_op bigint, p_type text, p_due timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if exists (select 1 from public.open_files where operation_id = p_op and file_type = p_type and closed_at is null) then
    return;
  end if;
  select owner_id into v_owner from public.operations where id = p_op;
  insert into public.open_files (operation_id, file_type, opened_at, due_at, assigned_to)
  values (p_op, p_type, now(), p_due, v_owner);
  insert into public.event_log (event_type, entity_type, entity_id, payload)
  values ('open_file_opened', 'operation', p_op::text, jsonb_build_object('file_type', p_type, 'due_at', p_due));
end; $$;

/** Açık dosyayı kapat. */
create or replace function public.of_close(p_op bigint, p_type text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.open_files set closed_at = now(), close_reason = p_reason
    where operation_id = p_op and file_type = p_type and closed_at is null;
  if found then
    insert into public.event_log (event_type, entity_type, entity_id, payload)
    values ('open_file_closed', 'operation', p_op::text, jsonb_build_object('file_type', p_type, 'reason', p_reason));
  end if;
end; $$;

-- ── operations trigger: talep açılışı + durum geçişleri + iptal + havuz senkronu ──
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

  -- İptal → tüm açık dosyaları kapat
  if new.cancelled_at is not null and old.cancelled_at is null then
    perform public.of_close(new.id, 'teklif_bekleniyor', 'operasyon_iptal');
    perform public.of_close(new.id, 'sonuc_bekleniyor', 'operasyon_iptal');
    perform public.of_close(new.id, 'olumlu_beklemede', 'operasyon_iptal');
    return null;
  end if;

  -- Havuz senkronu: sahip değişince açık dosyaların assigned_to'su güncellenir
  if new.owner_id is distinct from old.owner_id then
    update public.open_files set assigned_to = new.owner_id where operation_id = new.id and closed_at is null;
  end if;

  -- Durum geçişleri
  if new.request_status_id is distinct from old.request_status_id then
    select key into v_new_key from public.request_statuses where id = new.request_status_id;
    select key into v_old_key from public.request_statuses where id = old.request_status_id;
    if v_new_key = 'teklif_iletildi' then
      perform public.of_close(new.id, 'teklif_bekleniyor', 'teklif_uretildi');
      perform public.of_open(new.id, 'sonuc_bekleniyor',
        now() + public.of_hours('alerts.result_due_hours', 36) * interval '1 hour');
    elsif v_new_key = 'teklif_bekliyor' then
      -- teklif silindi (A8) → geri dön
      perform public.of_close(new.id, 'sonuc_bekleniyor', 'teklif_geri_alindi');
      perform public.of_close(new.id, 'olumlu_beklemede', 'teklif_geri_alindi');
      perform public.of_open(new.id, 'teklif_bekleniyor',
        now() + public.of_hours('alerts.quote_due_hours', 24) * interval '1 hour');
    end if;
  end if;
  return null;
end; $$;
create trigger open_files_on_operation after insert or update on public.operations
  for each row execute function public.open_files_on_operation();

-- ── quotes trigger: sonuç girilince sonuc_bekleniyor kapanır; olumlu_beklemede açılır ──
create or replace function public.open_files_on_quote_result()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_new text; v_old text;
begin
  select key into v_new from public.quote_statuses where id = new.status_id;
  select key into v_old from public.quote_statuses where id = old.status_id;
  if v_new is distinct from v_old then
    -- Bir sonuç girildi → sonuç bekleme dosyası kapanır
    if v_new in ('numune_asamasina_gecildi','olumsuz','kabul_edildi','reddedildi','olumlu_beklemede') then
      perform public.of_close(new.operation_id, 'sonuc_bekleniyor', 'sonuc_girildi');
    end if;
    -- Olumlu—Beklemede → tekrar-bak tarihiyle yeni dosya (H6)
    if v_new = 'olumlu_beklemede' then
      perform public.of_open(new.operation_id, 'olumlu_beklemede',
        coalesce(new.follow_up_at, now() + interval '3 days'));
    elsif v_old = 'olumlu_beklemede' then
      perform public.of_close(new.operation_id, 'olumlu_beklemede', 'sonuc_guncellendi');
    end if;
  end if;
  return null;
end; $$;
create trigger open_files_on_quote_result after update on public.quotes
  for each row execute function public.open_files_on_quote_result();

-- ── Backfill (idempotent, tekrar çalıştırılabilir) ──────────────────────────
-- due_at GERÇEK tarihten hesaplanır (created_at / teklif tarihi) → geçmiş talepler
-- doğru şekilde "süresi dolmuş" görünür. last_level = 4 → geçmişe dönük BİLDİRİM AKINI YOK
-- (listede/rozette görünür, ses/bildirim çıkmaz). WHERE NOT EXISTS → mükerrer dosya açmaz.
insert into public.open_files (operation_id, file_type, opened_at, due_at, assigned_to, last_level)
select o.id, 'teklif_bekleniyor', o.created_at,
       o.created_at + public.of_hours('alerts.quote_due_hours', 24) * interval '1 hour', o.owner_id, 4
from public.operations o
where o.deleted_at is null and o.cancelled_at is null
  and (select key from public.request_statuses r where r.id = o.request_status_id) = 'teklif_bekliyor'
  and not exists (select 1 from public.open_files f where f.operation_id = o.id and f.file_type = 'teklif_bekleniyor' and f.closed_at is null);

insert into public.open_files (operation_id, file_type, opened_at, due_at, assigned_to, last_level)
select o.id, 'sonuc_bekleniyor', q.qdate,
       q.qdate + public.of_hours('alerts.result_due_hours', 36) * interval '1 hour', o.owner_id, 4
from public.operations o
cross join lateral (
  select coalesce(max(created_at), o.created_at) as qdate from public.quotes
  where operation_id = o.id and quote_file_id is not null and deleted_at is null
) q
where o.deleted_at is null and o.cancelled_at is null
  and (select key from public.request_statuses r where r.id = o.request_status_id) = 'teklif_iletildi'
  and not exists (select 1 from public.open_files f where f.operation_id = o.id and f.file_type = 'sonuc_bekleniyor' and f.closed_at is null);

-- H6'dan gelen mevcut "olumlu_beklemede" teklifler için takip dosyası (due = tekrar-bak tarihi)
insert into public.open_files (operation_id, file_type, opened_at, due_at, assigned_to, last_level)
select q.operation_id, 'olumlu_beklemede', coalesce(q.responded_at, q.created_at),
       coalesce(q.follow_up_at, coalesce(q.responded_at, q.created_at) + interval '3 days'), o.owner_id, 4
from public.quotes q
join public.quote_statuses s on s.id = q.status_id
join public.operations o on o.id = q.operation_id
where q.deleted_at is null and s.key = 'olumlu_beklemede' and o.cancelled_at is null
  and not exists (select 1 from public.open_files f where f.operation_id = q.operation_id and f.file_type = 'olumlu_beklemede' and f.closed_at is null);
