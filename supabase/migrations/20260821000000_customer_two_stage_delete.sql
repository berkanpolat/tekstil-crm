-- =====================================================================
-- Müşteri silme — İKİ AŞAMALI (arşivle → kalıcı sil)
--   Amaç: yanlış/deneme müşterileri raporları kirletmeden temizlemek.
--   (a) ARŞİVLE  : geri alınabilir soft-delete; müşteri + (halen silinmemiş)
--                  operasyonları deleted_at ile gizlenir. Birlikte arşivlenen
--                  operasyonlar archived_with_customer=true ile işaretlenir ki
--                  geri alınca yalnız onlar geri gelsin (önceden silinmişler kalsın).
--   (b) KALICI SİL: SECURITY DEFINER, tek transaction, sıralı silme.
--                  Yalnız customers.delete yetkisi (owner+admin). Cari/ödeme varsa
--                  YASAK (muhasebe izi). Storage yolları çağırana döndürülür
--                  (RPC bucket'ı silemez → istemci supabase.storage.remove ile siler).
--
--   Polimorfik ek tabloları (FK YOK): files(entity_id TEXT), notes/entity_tags/
--   contact_points(entity_id BIGINT). entity_type = 'customer' | 'operation'.
--   Belge/teklif/sipariş PDF'leri files'ta documents.file_id / quotes.quote_file_id /
--   orders.order_file_id ile bağlı — bunlar da toplanır ve silinir.
-- =====================================================================

-- ── 0) Operasyonlara "müşteriyle birlikte arşivlendi" bayrağı ────────
alter table public.operations
  add column if not exists archived_with_customer boolean not null default false;

-- ── 1) Yeni yetki: customers.delete (owner otomatik; admin'e açıkça ver) ──
insert into public.permissions (key, module, action, description)
values ('customers.delete', 'customers', 'delete', 'Müşteriyi kalıcı olarak siler (geri alınamaz).')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key in ('owner', 'admin') and p.key = 'customers.delete'
on conflict do nothing;

-- ── 2) ÖNİZLEME RPC — kalıcı silmede neyin gideceğini gösterir ───────
create or replace function public.customer_delete_preview(p_customer_id bigint)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with ops as (select id from public.operations where customer_id = p_customer_id)
  select jsonb_build_object(
    'customer_id',    p_customer_id,
    'talep',          (select count(*) from ops),
    'teklif',         (select count(*) from public.quotes   where operation_id in (select id from ops)),
    'numune',         (select count(*) from public.samples  where operation_id in (select id from ops)),
    'siparis',        (select count(*) from public.orders   where operation_id in (select id from ops)),
    'belge',          (select count(*) from public.documents where operation_id in (select id from ops)),
    'etkilesim',      (select count(*) from public.interactions where operation_id in (select id from ops)),
    'dosya',          (select count(*) from public.files
                         where (entity_type = 'operation' and entity_id in (select id::text from ops))
                            or (entity_type = 'customer'  and entity_id = p_customer_id::text)),
    'cari_hareket',   (select count(*) from public.account_transactions where customer_id = p_customer_id),
    'odeme',          (select count(*) from public.payments where customer_id = p_customer_id),
    'can_hard_delete',
        not exists (select 1 from public.account_transactions where customer_id = p_customer_id)
    and not exists (select 1 from public.payments where customer_id = p_customer_id)
  );
$$;

-- ── 3) ARŞİVLE — müşteri + halen silinmemiş operasyonları soft-delete ──
create or replace function public.customer_archive(p_customer_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_now   timestamptz := now();
begin
  if not public.is_active_user() then
    raise exception 'Yetkisiz.' using errcode = '42501';
  end if;
  select email into v_email from public.users where id = v_uid;

  update public.customers
     set deleted_at = v_now, deleted_by = v_uid
   where id = p_customer_id and deleted_at is null;

  -- yalnız HALEN AÇIK operasyonları arşivle + işaretle (önceden silinmişlere dokunma)
  update public.operations
     set deleted_at = v_now, deleted_by = v_uid, archived_with_customer = true
   where customer_id = p_customer_id and deleted_at is null;

  insert into public.audit_log(table_name, record_id, action, actor_id, actor_email, source, new_values)
  values ('customers', p_customer_id::text, 'update', v_uid, v_email, 'rpc',
          jsonb_build_object('archived', true));
end;
$$;

-- ── 4) ARŞİVDEN ÇIKAR — müşteri + yalnız birlikte arşivlenen operasyonlar ──
create or replace function public.customer_unarchive(p_customer_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  if not public.is_active_user() then
    raise exception 'Yetkisiz.' using errcode = '42501';
  end if;
  select email into v_email from public.users where id = v_uid;

  update public.customers
     set deleted_at = null, deleted_by = null
   where id = p_customer_id;

  -- yalnız müşteriyle BİRLİKTE arşivlenenleri geri getir; bayrağı temizle
  update public.operations
     set deleted_at = null, deleted_by = null, archived_with_customer = false
   where customer_id = p_customer_id and archived_with_customer = true;

  insert into public.audit_log(table_name, record_id, action, actor_id, actor_email, source, new_values)
  values ('customers', p_customer_id::text, 'restore', v_uid, v_email, 'rpc',
          jsonb_build_object('archived', false));
end;
$$;

-- ── 5) KALICI SİL — guard + sıralı silme, storage yollarını döndürür ──
create or replace function public.customer_hard_delete(p_customer_id bigint)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_email    text;
  v_paths    jsonb;
  v_snapshot jsonb;
begin
  -- YETKİ: yalnız customers.delete (owner otomatik geçer)
  if not public.has_permission('customers.delete') then
    raise exception 'Bu işlem için customers.delete yetkisi gerekli.' using errcode = '42501';
  end if;

  -- GUARD: cari hareketi veya ödemesi olan müşteri kalıcı silinemez
  if exists (select 1 from public.account_transactions where customer_id = p_customer_id)
     or exists (select 1 from public.payments where customer_id = p_customer_id) then
    raise exception 'Cari hareketi veya ödemesi olan müşteri kalıcı silinemez; arşivleyin.'
      using errcode = '23503';
  end if;

  select email into v_email from public.users where id = v_uid;

  -- silinecek operasyonlar
  create temp table _ops on commit drop as
    select id from public.operations where customer_id = p_customer_id;

  -- silinecek dosya id'leri: operasyon/müşteri ekleri + belge/teklif/sipariş PDF'leri
  create temp table _fileids on commit drop as
    select id from public.files
      where (entity_type = 'operation' and entity_id in (select id::text from _ops))
         or (entity_type = 'customer'  and entity_id = p_customer_id::text)
    union
    select file_id from public.documents where operation_id in (select id from _ops) and file_id is not null
    union
    select quote_file_id from public.quotes where operation_id in (select id from _ops) and quote_file_id is not null
    union
    select order_file_id from public.orders where operation_id in (select id from _ops) and order_file_id is not null;

  -- storage yolları (silmeden ÖNCE topla; RPC bucket'ı silemez → çağırana döndürülür)
  select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket, 'path', storage_path)), '[]'::jsonb)
    into v_paths
    from public.files where id in (select id from _fileids);

  -- audit için müşteri anlık görüntüsü
  select to_jsonb(c.*) into v_snapshot from public.customers c where id = p_customer_id;

  -- ── sıralı silme (RESTRICT çocuklar önce) ──
  delete from public.documents where operation_id in (select id from _ops);
  delete from public.orders     where operation_id in (select id from _ops);
  delete from public.quotes     where operation_id in (select id from _ops);
  delete from public.samples    where operation_id in (select id from _ops);

  -- polimorfik ekler (FK yok): entity_id tipleri farklı!
  --   files.entity_id = TEXT ; notes/entity_tags/contact_points.entity_id = BIGINT
  delete from public.notes
    where (entity_type = 'customer'  and entity_id = p_customer_id)
       or (entity_type = 'operation' and entity_id in (select id from _ops));
  delete from public.entity_tags
    where (entity_type = 'customer'  and entity_id = p_customer_id)
       or (entity_type = 'operation' and entity_id in (select id from _ops));
  delete from public.contact_points
    where (entity_type = 'customer'  and entity_id = p_customer_id)
       or (entity_type = 'operation' and entity_id in (select id from _ops));
  delete from public.files where id in (select id from _fileids);

  -- operasyonlar: CASCADE (open_files, operation_items, operation_catalog_items,
  --   task_suggestion_state) ; SET NULL (interactions, account_transactions)
  delete from public.operations where customer_id = p_customer_id;

  -- müşteri
  delete from public.customers where id = p_customer_id;

  insert into public.audit_log(table_name, record_id, action, actor_id, actor_email, source, old_values)
  values ('customers', p_customer_id::text, 'delete', v_uid, v_email, 'rpc', v_snapshot);

  return v_paths;  -- [{bucket, path}, ...] — istemci storage.remove ile temizler
end;
$$;

-- ── 6) Yetki: authenticated rolü çağırabilsin (içeride yetki kontrolü var) ──
grant execute on function public.customer_delete_preview(bigint) to authenticated;
grant execute on function public.customer_archive(bigint)        to authenticated;
grant execute on function public.customer_unarchive(bigint)      to authenticated;
grant execute on function public.customer_hard_delete(bigint)    to authenticated;
