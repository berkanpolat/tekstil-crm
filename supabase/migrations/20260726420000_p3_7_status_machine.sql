-- =====================================================================
-- P3.7 — Durum makinesi ve geçiş kuralları.
--   • status_transitions: hangi geçiş mümkün — KODA GÖMÜLMEZ, tabloda, ayarlardan görülür.
--   • SERT kapılar (engeller): kalemsiz teklif gönderilemez; müşterisiz operasyon açılamaz
--     (customer_id NOT NULL zaten); iptal/red gerekçesiz kaydedilemez.
--   • YUMUŞAK kapılar (uyarır, engellemez): log_soft_gate_override() gerekçeyi event_log'a yazar.
-- Her durum değişikliği zaten modül trigger'larında event_log'a yazılıyor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- status_transitions — izinli geçişler (anahtarla; farklı durum tabloları için tek yapı).
-- ---------------------------------------------------------------------
create table public.status_transitions (
  id             bigint generated always as identity primary key,
  entity_type    text not null check (entity_type in ('operation','quote','sample','order')),
  from_key       text not null,          -- kaynak durum/aşama anahtarı ('*' = herhangi)
  to_key         text not null,          -- hedef durum/aşama anahtarı
  requires_reason boolean not null default false,
  is_active      boolean not null default true,
  is_system      boolean not null default false,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (entity_type, from_key, to_key)
);
comment on table public.status_transitions is
  'İzinli durum/aşama geçişleri (koda gömülmez). Ayarlardan görülür; UI ileri geçişleri buradan önerebilir.';

create trigger status_transitions_touch before update on public.status_transitions
  for each row execute function public.touch_updated_at();
create trigger status_transitions_audit after insert or update or delete on public.status_transitions
  for each row execute function public.audit_trigger();

alter table public.status_transitions enable row level security;
create policy status_transitions_select on public.status_transitions for select to authenticated using (public.is_active_user());
create policy status_transitions_write on public.status_transitions for all to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());
revoke all on public.status_transitions from anon;
grant select, insert, update on public.status_transitions to authenticated;

-- Operasyon aşama akışı (talep→teklif→numune→siparis→uretim→teslimat→tamamlandi; iptal her yerden).
insert into public.status_transitions (entity_type, from_key, to_key, is_system, sort_order) values
  ('operation','talep','teklif',true,1),
  ('operation','teklif','numune',true,2),
  ('operation','teklif','siparis',true,3),
  ('operation','numune','siparis',true,4),
  ('operation','siparis','uretim',true,5),
  ('operation','uretim','teslimat',true,6),
  ('operation','teslimat','tamamlandi',true,7),
  ('operation','*','iptal',true,99);

-- ---------------------------------------------------------------------
-- SERT KAPI 1 — kalemsiz teklif gönderilemez.
-- ---------------------------------------------------------------------
create or replace function public.quotes_hard_gate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_new_key text; v_cnt int;
begin
  -- Gönderim: sent_at ilk kez dolarken en az bir kalem olmalı.
  if new.sent_at is not null and old.sent_at is null then
    select count(*) into v_cnt from public.quote_items where quote_id = new.id and deleted_at is null;
    if v_cnt = 0 then
      raise exception 'Kalemi olmayan teklif gönderilemez. Önce en az bir kalem ekleyin.' using errcode = 'check_violation';
    end if;
  end if;
  -- Red gerekçesi zorunlu.
  if new.status_id is distinct from old.status_id then
    select key into v_new_key from public.quote_statuses where id = new.status_id;
    if v_new_key = 'reddedildi' and new.rejection_reason_id is null and coalesce(btrim(new.rejection_note),'') = '' then
      raise exception 'Teklif reddi gerekçesiz kaydedilemez (neden ya da not girin).' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end; $$;
create trigger quotes_hard_gate before update on public.quotes
  for each row execute function public.quotes_hard_gate();

-- ---------------------------------------------------------------------
-- SERT KAPI 2 — numune reddi gerekçesiz olamaz.
-- ---------------------------------------------------------------------
create or replace function public.samples_hard_gate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_new_key text;
begin
  if new.status_id is distinct from old.status_id then
    select key into v_new_key from public.sample_statuses where id = new.status_id;
    if v_new_key = 'reddedildi' and coalesce(btrim(new.rejection_reason),'') = '' then
      raise exception 'Numune reddi gerekçesiz kaydedilemez (red nedeni girin).' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end; $$;
create trigger samples_hard_gate before update on public.samples
  for each row execute function public.samples_hard_gate();

-- ---------------------------------------------------------------------
-- SERT KAPI 3 — operasyon iptali gerekçesiz olamaz.
-- ---------------------------------------------------------------------
create or replace function public.operations_hard_gate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.cancelled_at is not null and old.cancelled_at is null
     and new.cancellation_reason_id is null and coalesce(btrim(new.cancellation_note),'') = '' then
    raise exception 'Operasyon iptali gerekçesiz kaydedilemez (iptal nedeni ya da not girin).' using errcode = 'check_violation';
  end if;
  return new;
end; $$;
create trigger operations_hard_gate before update on public.operations
  for each row execute function public.operations_hard_gate();

-- ---------------------------------------------------------------------
-- YUMUŞAK KAPI — uyarı geçilince gerekçe event_log'a. Doküman 5.11: numune onayı
-- olmadan üretime geçmek istisnai; yasak değil ama kim hangi gerekçeyle atladı kayıtta.
-- ---------------------------------------------------------------------
create or replace function public.log_soft_gate_override(p_operation_id bigint, p_gate text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(btrim(p_reason),'') = '' then
    raise exception 'Uyarıyı geçmek için gerekçe zorunludur.' using errcode = 'check_violation';
  end if;
  perform public.log_event('gate.overridden', 'operation', p_operation_id::text,
    jsonb_build_object('gate', p_gate, 'reason', p_reason));
end; $$;
comment on function public.log_soft_gate_override(bigint, text, text) is
  'Yumuşak kapı geçişi: kullanıcı uyarıyı gerekçeyle geçince event_log''a "gate.overridden" yazar.';
grant execute on function public.log_soft_gate_override(bigint, text, text) to authenticated;
