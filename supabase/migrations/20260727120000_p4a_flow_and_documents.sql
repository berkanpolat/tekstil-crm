-- =====================================================================
-- Faz 4A akış kararları (P4A.4/P4A.5) + belge şeması (P4A.3).
--   1) Sipariş onay formu HER DURUMDA zorunlu (sert kapı): numune ya da sipariş
--      açmak için operasyonda siparis_onay belgesi bulunmalı.
--   2) Numune revizyonu AYNI kayıtta: revision_round + revision_reason; yeni kayıt yok.
--   3) Ödeme kontrolü üretim öncesi: payments tablosu (Faz 5 cari temeli). Engel yok (UI yumuşak kapı).
--   4) Durum listeleri sadeleşti: teklif 4, sipariş 6, numune 9.
-- + document_types / documents (P4A.3), data_hash idempotency (dil + şablon sürümü dahil).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4) DURUM LİSTELERİ
-- ---------------------------------------------------------------------
-- Teklif sonucu (4)
update public.quote_statuses set is_default = false where is_default;
insert into public.quote_statuses (key,label,sort_order,color,is_default,is_closed,is_system) values
  ('cevap_bekleniyor','Cevap Bekleniyor',1,'info',true,false,true),
  ('olumlu_beklemede','Olumlu — Beklemede',2,'warning',false,false,true),
  ('numune_asamasina_gecildi','Numune Aşamasına Geçildi',3,'success',false,true,true),
  ('olumsuz','Olumsuz',4,'danger',false,true,true)
on conflict (key) do update set label=excluded.label, sort_order=excluded.sort_order, color=excluded.color, is_default=excluded.is_default, is_closed=excluded.is_closed, is_active=true;
update public.quotes set status_id = (select id from public.quote_statuses where key = case
    (select key from public.quote_statuses s where s.id = quotes.status_id)
    when 'kabul_edildi' then 'numune_asamasina_gecildi' when 'reddedildi' then 'olumsuz'
    when 'revize_bekleniyor' then 'olumlu_beklemede' else 'cevap_bekleniyor' end);
update public.quote_statuses set is_active = false where key not in ('cevap_bekleniyor','olumlu_beklemede','numune_asamasina_gecildi','olumsuz');

-- Sipariş durumları (6)
update public.order_statuses set is_default = false where is_default;
insert into public.order_statuses (key,label,sort_order,color,is_default,is_closed,is_system) values
  ('uretimde','Üretimde',1,'info',true,false,true),
  ('kargo_bekleniyor','Kargo Bekleniyor',2,'info',false,false,true),
  ('kargoda','Kargoda',3,'info',false,false,true),
  ('teslim_edildi','Teslim Edildi',4,'success',false,true,true),
  ('bekletiliyor','Bekletiliyor',5,'warning',false,false,true),
  ('iptal_edildi','İptal Edildi',6,'danger',false,true,true)
on conflict (key) do update set label=excluded.label, sort_order=excluded.sort_order, color=excluded.color, is_default=excluded.is_default, is_closed=excluded.is_closed, is_active=true;
update public.orders set status_id = (select id from public.order_statuses where key = case
    (select key from public.order_statuses s where s.id = orders.status_id)
    when 'sevk_edildi' then 'kargoda' when 'tamamlandi' then 'teslim_edildi'
    when 'askiya_alindi' then 'bekletiliyor' when 'iptal_edildi' then 'iptal_edildi'
    when 'sevkiyata_hazir' then 'kargo_bekleniyor' when 'paketleniyor' then 'kargo_bekleniyor' else 'uretimde' end);
update public.order_statuses set is_active = false where key not in ('uretimde','kargo_bekleniyor','kargoda','teslim_edildi','bekletiliyor','iptal_edildi');

-- Numune durumları (9)
update public.sample_statuses set is_default = false where is_default;
insert into public.sample_statuses (key,label,sort_order,color,is_default,is_closed,is_system) values
  ('musteri_numunesi_bekleniyor','Müşteri Numunesi Bekleniyor',1,'info',true,false,true),
  ('numune_uretimde','Numune Üretimde',2,'info',false,false,true),
  ('kargo_bekleniyor','Kargo Bekleniyor',3,'info',false,false,true),
  ('kargoda','Kargoda',4,'info',false,false,true),
  ('teslim_edildi','Teslim Edildi',5,'info',false,false,true),
  ('onaylandi','Onaylandı',6,'success',false,true,true),
  ('reddedildi','Reddedildi',7,'danger',false,true,true),
  ('revize','Revize',8,'warning',false,false,true),
  ('iptal_edildi','İptal Edildi',9,'danger',false,true,true)
on conflict (key) do update set label=excluded.label, sort_order=excluded.sort_order, color=excluded.color, is_default=excluded.is_default, is_closed=excluded.is_closed, is_active=true;
update public.samples set status_id = (select id from public.sample_statuses where key = case
    (select key from public.sample_statuses s where s.id = samples.status_id)
    when 'onaylandi' then 'onaylandi' when 'reddedildi' then 'reddedildi' when 'iptal_edildi' then 'iptal_edildi'
    when 'musteriye_gonderildi' then 'kargoda' when 'uretimde' then 'numune_uretimde'
    when 'kalite_kontrolunde' then 'numune_uretimde' when 'revize_bekleniyor' then 'revize'
    else 'musteri_numunesi_bekleniyor' end);
update public.sample_statuses set is_active = false where key not in ('musteri_numunesi_bekleniyor','numune_uretimde','kargo_bekleniyor','kargoda','teslim_edildi','onaylandi','reddedildi','revize','iptal_edildi');

-- ---------------------------------------------------------------------
-- 2) NUMUNE REVİZYONU AYNI KAYITTA
-- ---------------------------------------------------------------------
alter table public.samples add column if not exists revision_round int not null default 1;
alter table public.samples add column if not exists revision_reason text;
comment on column public.samples.revision_round is 'Kaçıncı revizyon turu. Revize edildikçe artar; 3''ten sonra kartta uyarı.';

-- Numune revizyonu: aynı kayıtta tur artır, sebep yaz, durum numune_uretimde'ye dön, olay yaz.
create or replace function public.revise_sample(p_sample_id bigint, p_reason text)
returns int language plpgsql security definer set search_path = '' as $$
declare v_round int; v_opid bigint;
begin
  if coalesce(btrim(p_reason),'') = '' then
    raise exception 'Revizyon sebebi zorunludur.' using errcode = 'check_violation';
  end if;
  update public.samples set revision_round = revision_round + 1, revision_reason = p_reason,
    status_id = (select id from public.sample_statuses where key = 'numune_uretimde'),
    approved_at = null, approved_by = null, approval_method = null, approval_note = null
    where id = p_sample_id and deleted_at is null
    returning revision_round, operation_id into v_round, v_opid;
  if v_opid is null then raise exception 'Numune bulunamadı (id=%).', p_sample_id using errcode='P0002'; end if;
  perform public.log_event('sample.revised', 'operation', v_opid::text,
    jsonb_build_object('sample_id', p_sample_id, 'round', v_round, 'reason', p_reason));
  return v_round;
end; $$;
grant execute on function public.revise_sample(bigint, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3) ÖDEMELER (Faz 5 cari temeli)
-- ---------------------------------------------------------------------
create table public.payments (
  id           bigint generated always as identity primary key,
  operation_id bigint not null references public.operations (id) on delete restrict,
  order_id     bigint references public.orders (id) on delete set null,
  direction    text not null default 'gelen' check (direction in ('gelen','giden')),
  kind         text not null default 'on_odeme' check (kind in ('on_odeme','bakiye','diger')),
  amount       numeric(14,2) not null,
  currency     text not null default 'TRY',
  paid_at      date not null default current_date,
  note         text,
  deleted_at   timestamptz, deleted_by uuid,
  created_by   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now(), updated_at timestamptz not null default now()
);
comment on table public.payments is 'Basit ödeme kayıtları (gelen/giden). Faz 5''te cari hesaba dönüşür.';
create index payments_operation_idx on public.payments (operation_id) where deleted_at is null;
create index payments_order_idx on public.payments (order_id) where order_id is not null;
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();
create trigger payments_audit after insert or update or delete on public.payments for each row execute function public.audit_trigger();
alter table public.payments enable row level security;
create policy payments_select on public.payments for select to authenticated using (public.is_active_user());
create policy payments_insert on public.payments for insert to authenticated with check (public.is_active_user());
create policy payments_update on public.payments for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
revoke all on public.payments from anon;
grant select, insert, update on public.payments to authenticated;

-- ---------------------------------------------------------------------
-- P4A.3 — BELGE ŞEMASI
-- ---------------------------------------------------------------------
create table public.document_types (
  id bigint generated always as identity primary key,
  key text not null unique, label_tr text not null, label_en text not null,
  template_name text not null, page_size text not null default 'A4', orientation text not null default 'portrait',
  is_active boolean not null default true, sort_order int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.document_types (key,label_tr,label_en,template_name,orientation,sort_order) values
  ('fiyat_teklifi','Fiyat Teklifi','Price Quotation','fiyat_teklifi','portrait',1),
  ('siparis_onay','Sipariş Onay Formu','Order Confirmation Form','siparis_onay','portrait',2),
  ('numune_etiketi','Numune Etiketi','Production Sample Label','numune_etiketi','portrait',3),
  ('siparis_formu','Sipariş Formu','Order Form','siparis_formu','portrait',4),
  ('koli_ustu','Koli Üstü Etiketi','Carton Label','koli_ustu','portrait',5);
alter table public.document_types enable row level security;
create policy document_types_select on public.document_types for select to authenticated using (public.is_active_user());
create policy document_types_write on public.document_types for all to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());
revoke all on public.document_types from anon;
grant select, insert, update on public.document_types to authenticated;
create trigger document_types_touch before update on public.document_types for each row execute function public.touch_updated_at();

create table public.documents (
  id bigint generated always as identity primary key,
  operation_id bigint not null references public.operations (id) on delete restrict,
  document_type_id bigint not null references public.document_types (id) on delete restrict,
  version int not null default 1,
  language text not null default 'tr' check (language in ('tr','en')),
  data jsonb not null default '{}'::jsonb,
  data_hash text,                             -- idempotency: veri + dil + şablon sürümü
  content_search text generated always as (public.normalize_tr(coalesce(data->>'_search',''))) stored,
  file_id bigint references public.files (id) on delete set null,
  generated_by uuid references public.users (id) on delete set null,
  generated_at timestamptz,
  supersedes_id bigint references public.documents (id) on delete set null,
  deleted_at timestamptz, deleted_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
comment on table public.documents is 'Üretilen belgeler. data tüm girdileri saklar (birebir yeniden üretim). content_search aranabilir.';
comment on column public.documents.data_hash is 'sha(data + language + template_version). Aynı hash = birebir aynı belge → önbellek döner.';
create index documents_operation_idx on public.documents (operation_id) where deleted_at is null;
create index documents_type_idx on public.documents (document_type_id) where deleted_at is null;
create index documents_hash_idx on public.documents (data_hash) where deleted_at is null;
create index documents_content_idx on public.documents using gin (content_search gin_trgm_ops);
create trigger documents_touch before update on public.documents for each row execute function public.touch_updated_at();
create trigger documents_audit after insert or update or delete on public.documents for each row execute function public.audit_trigger();
alter table public.documents enable row level security;
create policy documents_select on public.documents for select to authenticated using (public.is_active_user());
create policy documents_insert on public.documents for insert to authenticated with check (public.is_active_user());
create policy documents_update on public.documents for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
revoke all on public.documents from anon;
grant select, insert, update on public.documents to authenticated;

-- ---------------------------------------------------------------------
-- 1) SERT KAPI — sipariş onay belgesi olmadan numune ya da sipariş açılamaz
-- ---------------------------------------------------------------------
create or replace function public.require_siparis_onay(p_operation_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.documents d join public.document_types dt on dt.id = d.document_type_id
    where d.operation_id = p_operation_id and dt.key = 'siparis_onay' and d.deleted_at is null
  ) then
    raise exception 'Sipariş onay formu yüklenmeden numune ya da sipariş oluşturulamaz.' using errcode = 'check_violation';
  end if;
end; $$;

create or replace function public.samples_require_onay()
returns trigger language plpgsql security definer set search_path = '' as $$
begin perform public.require_siparis_onay(new.operation_id); return new; end; $$;
create trigger samples_require_onay before insert on public.samples
  for each row execute function public.samples_require_onay();

create or replace function public.orders_require_onay()
returns trigger language plpgsql security definer set search_path = '' as $$
begin perform public.require_siparis_onay(new.operation_id); return new; end; $$;
create trigger orders_require_onay before insert on public.orders
  for each row execute function public.orders_require_onay();
