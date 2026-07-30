-- =====================================================================
-- P3.3 revizyon — Talep formu sadeleştirme.
-- Saatte 10+ talep girilir; form 15 saniyede dolmalı. Yeni yapı:
--   • Kategori/Tür = iki bağlı açılır menü (Kadın Giyim → Bluz). Katalog yapısıyla
--     aynı: product_categories self-referential (parent_id). Ayarlardan yönetilir.
--   • operations.category_id + type_id + requested_at (talep tarihi, geçmişe girilebilir).
--   • title artık zorunlu değil; boşsa sistem üretir ("Kadın Giyim Bluz — 26.07.2026").
--   • operation.created olayı occurred_at = requested_at (geçmiş talep zaman çizelgesinde doğru yerde).
-- =====================================================================

-- ---------------------------------------------------------------------
-- product_categories — hiyerarşik referans (2 seviye: kategori → tür).
-- parent_id null = üst kategori; dolu = alt tür.
-- ---------------------------------------------------------------------
create table public.product_categories (
  id          bigint generated always as identity primary key,
  key         text not null unique,
  label       text not null,
  parent_id   bigint references public.product_categories (id) on delete restrict,
  color       text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.product_categories is
  'Ürün kategori/tür hiyerarşisi (parent_id null=kategori, dolu=tür). Talep formundaki bağlı menüler ve katalog buradan.';

create index product_categories_parent_idx on public.product_categories (parent_id);
create index product_categories_active_idx on public.product_categories (is_active, sort_order);

create trigger product_categories_touch before update on public.product_categories
  for each row execute function public.touch_updated_at();
create trigger product_categories_guard_system before update on public.product_categories
  for each row execute function public.guard_system_reference();
create trigger product_categories_no_delete before delete on public.product_categories
  for each row execute function public.prevent_reference_delete();
create trigger product_categories_audit after insert or update or delete on public.product_categories
  for each row execute function public.audit_trigger();

alter table public.product_categories enable row level security;
create policy product_categories_select on public.product_categories for select to authenticated using (public.is_active_user());
create policy product_categories_write on public.product_categories for all to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());
revoke all on public.product_categories from anon;
grant select, insert, update on public.product_categories to authenticated;

-- Başlangıç hiyerarşisi (kullanıcı ayarlardan genişletir).
insert into public.product_categories (key, label, sort_order, is_system) values
  ('kadin_giyim','Kadın Giyim',1,true),
  ('erkek_giyim','Erkek Giyim',2,true),
  ('cocuk_giyim','Çocuk Giyim',3,true),
  ('kurumsal_promosyon','Kurumsal / Promosyon',4,true);

insert into public.product_categories (key, label, parent_id, sort_order)
select v.key, v.label, p.id, v.so from (values
  ('kadin_bluz','Bluz','kadin_giyim',1),
  ('kadin_gomlek','Gömlek','kadin_giyim',2),
  ('kadin_elbise','Elbise','kadin_giyim',3),
  ('kadin_tshirt','T-Shirt','kadin_giyim',4),
  ('kadin_tayt','Tayt','kadin_giyim',5),
  ('kadin_sweatshirt','Sweatshirt','kadin_giyim',6),
  ('erkek_tshirt','T-Shirt','erkek_giyim',1),
  ('erkek_polo','Polo Yaka','erkek_giyim',2),
  ('erkek_gomlek','Gömlek','erkek_giyim',3),
  ('erkek_sweatshirt','Sweatshirt','erkek_giyim',4),
  ('erkek_hoodie','Hoodie','erkek_giyim',5),
  ('cocuk_body','Body / Zıbın','cocuk_giyim',1),
  ('cocuk_tshirt','T-Shirt','cocuk_giyim',2),
  ('cocuk_sweatshirt','Sweatshirt','cocuk_giyim',3),
  ('kurumsal_onluk','İş Önlüğü','kurumsal_promosyon',1),
  ('kurumsal_yelek','Yelek','kurumsal_promosyon',2),
  ('kurumsal_sapka','Şapka','kurumsal_promosyon',3),
  ('kurumsal_canta','Çanta','kurumsal_promosyon',4)
) as v(key,label,pkey,so)
join public.product_categories p on p.key = v.pkey;

-- ---------------------------------------------------------------------
-- operations — yeni alanlar + title zorunlu değil.
-- ---------------------------------------------------------------------
alter table public.operations alter column title drop not null;
alter table public.operations add column category_id bigint references public.product_categories (id) on delete set null;
alter table public.operations add column type_id     bigint references public.product_categories (id) on delete set null;
alter table public.operations add column requested_at timestamptz not null default now();

create index operations_category_idx on public.operations (category_id) where deleted_at is null;
create index operations_type_idx on public.operations (type_id) where deleted_at is null;

comment on column public.operations.requested_at is 'Talep tarihi (kullanıcı değiştirebilir; geçmiş talep girilebilir). operation.created olayının occurred_at değeri.';
comment on column public.operations.title is 'Boş bırakılırsa trigger üretir: "<Kategori> <Tür> — GG.AA.YYYY".';

-- BEFORE INSERT: kod + varsayılan aşama/durum/öncelik + başlık üretimi.
create or replace function public.operations_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_cat text; v_type text;
begin
  if new.code is null then
    new.code := public.generate_operation_code('operation', new.id::text);
  end if;
  if new.stage_id is null then
    select id into new.stage_id from public.operation_stages where is_default limit 1;
  end if;
  if new.request_status_id is null then
    select id into new.request_status_id from public.request_statuses where is_default limit 1;
  end if;
  if new.priority_id is null then
    select id into new.priority_id from public.priorities where is_default limit 1;
  end if;
  -- Başlık boşsa üret: "<Kategori> <Tür> — GG.AA.YYYY"
  if new.title is null or btrim(new.title) = '' then
    select label into v_cat from public.product_categories where id = new.category_id;
    select label into v_type from public.product_categories where id = new.type_id;
    new.title := btrim(concat_ws(' ', v_cat, v_type));
    if new.title = '' then new.title := 'Talep'; end if;
    new.title := new.title || ' — ' || to_char(coalesce(new.requested_at, now()), 'DD.MM.YYYY');
  end if;
  return new;
end; $$;

-- Timeline: oluşturma olayı occurred_at = requested_at (geçmiş talepler doğru sıralanır).
create or replace function public.operations_timeline_events()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event('operation.created', 'operation', new.id::text,
      jsonb_build_object('code', new.code, 'title', new.title, 'customer_id', new.customer_id),
      new.requested_at);
  end if;
  return null;
end; $$;
