-- =====================================================================
-- Talep kartında eşleşmeyen katalog kodunu çözme (A — anlık çözüm).
-- Eşleşmeyen kalem: operation_catalog_items.catalog_product_id IS NULL.
--   • resolve: mevcut bir katalog ürününe bağla (elle eşleştir)
--   • create : koddan yeni katalog ürünü oluştur + bağla
-- =====================================================================

create or replace function public.resolve_catalog_item(p_item_id bigint, p_product_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_code text; v_name text;
begin
  if not exists (select 1 from users u join roles r on r.id=u.role_id where u.id=auth.uid() and r.key in ('owner','admin','manager','sales')) then
    raise exception 'Yetkiniz yok.' using errcode='42501';
  end if;
  select code, name into v_code, v_name from catalog_products where id = p_product_id and deleted_at is null;
  if v_code is null then raise exception 'Katalog ürünü bulunamadı.' using errcode='P0002'; end if;
  update operation_catalog_items
    set catalog_product_id = p_product_id, catalog_product_code = v_code, label = coalesce(label, v_name)
    where id = p_item_id;
end $$;

create or replace function public.create_catalog_product_and_link(p_item_id bigint, p_code text, p_name text, p_collection_id bigint default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_prod_id bigint; v_cat_id bigint;
begin
  if not exists (select 1 from users u join roles r on r.id=u.role_id where u.id=auth.uid() and r.key in ('owner','admin','manager','sales')) then
    raise exception 'Yetkiniz yok.' using errcode='42501';
  end if;
  if coalesce(btrim(p_code),'')='' then raise exception 'Ürün kodu gerekli.' using errcode='check_violation'; end if;
  -- Aynı kod zaten varsa onu kullan (çift oluşturma)
  select id into v_prod_id from catalog_products where code = btrim(p_code) and deleted_at is null limit 1;
  if v_prod_id is null then
    select id into v_cat_id from catalogs order by id limit 1;
    insert into catalog_products (catalog_id, collection_id, code, name)
    values (v_cat_id, p_collection_id, btrim(p_code), coalesce(nullif(btrim(p_name),''), btrim(p_code)))
    returning id into v_prod_id;
  end if;
  perform public.resolve_catalog_item(p_item_id, v_prod_id);
  return v_prod_id;
end $$;

grant execute on function public.resolve_catalog_item(bigint,bigint) to authenticated;
grant execute on function public.create_catalog_product_and_link(bigint,text,text,bigint) to authenticated;
