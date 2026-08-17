-- 20260820000000_catalog_ys_random_code.sql
-- KAPSAM: Yeni katalog ürün kodlarını sıralı YS-0001…YS-0475 formatından
--         YS- + 6 rastgele karakter (YS-XXXXXX) formatına taşır.
-- ALFABE: generate_operation_code ile aynı → 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
--         (I, O, 0, 1 karışıklık yarattığı için YOK).
-- STORAGE: DOKUNULMAZ. files.storage_path (catalog/YS-0001/N.ext) DONUK kalır.
--          Yol ile code arasında hiçbir join/FK yok; yalnız catalog_products.code değişir.
-- GÜVENLİK ÖN-KONTROLÜ (2026-08-17, canlı DB, salt-okuma):
--   operation_catalog_items YS metin/FK = 0, quote_items 'YS-' = 0, documents 'YS-' = 0.
--   Hiçbir teklif/belge bu kodları metin olarak kopyalamamış → taşıma güvenli.
-- Yalnız eski format (^YS-[0-9]{4}$) hedeflenir; yeni üretilen YS-XXXXXX asla yeniden işlenmez.

begin;

-- 1) EŞLEME + ROLLBACK LOGU (kalıcı): source_code ↔ eski code ↔ yeni code
create table if not exists public.catalog_yscode_migration (
  catalog_product_id bigint primary key references public.catalog_products(id),
  source_code        text,
  old_code           text not null,
  new_code           text not null,
  migrated_at        timestamptz not null default now()
);
comment on table public.catalog_yscode_migration is
  'YS sıralı→rastgele kod taşıma logu. Geri alma: update catalog_products c set code=m.old_code from catalog_yscode_migration m where c.id=m.catalog_product_id.';

-- 2) KOD ÜRET + UYGULA (çakışmasız)
do $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- I,O,0,1 yok
  v_len      constant int  := length(v_alphabet);
  r     record;
  v_code text;
  v_full text;
  v_try  int;
  i      int;
begin
  for r in
    select id, code, source_code
    from public.catalog_products
    where code ~ '^YS-[0-9]{4}$'        -- YALNIZ eski sıralı format
    order by code
  loop
    v_try := 0;
    loop
      v_try := v_try + 1;
      v_code := '';
      for i in 1..6 loop
        v_code := v_code || substr(v_alphabet, 1 + floor(random() * v_len)::int, 1);
      end loop;
      v_full := 'YS-' || v_code;
      -- benzersizlik: hem tüm mevcut kodlara hem bu turda üretilenlere karşı
      exit when not exists (select 1 from public.catalog_products where code = v_full)
            and not exists (select 1 from public.catalog_yscode_migration where new_code = v_full);
      if v_try >= 20 then
        raise exception 'YS kodu üretilemedi (20 denemede çakışma) ürün id=%', r.id;
      end if;
    end loop;

    insert into public.catalog_yscode_migration (catalog_product_id, source_code, old_code, new_code)
    values (r.id, r.source_code, r.code, v_full);

    update public.catalog_products set code = v_full where id = r.id;
  end loop;
end $$;

-- 3) DOĞRULAMA (başarısızsa transaction geri alınır)
do $$
declare v_cnt int; v_dup int; v_left int;
begin
  select count(*) into v_cnt  from public.catalog_yscode_migration;
  select count(*) into v_dup  from (
    select new_code from public.catalog_yscode_migration group by new_code having count(*) > 1
  ) d;
  select count(*) into v_left from public.catalog_products where code ~ '^YS-[0-9]{4}$';
  raise notice 'Taşınan ürün: %  | mükerrer yeni kod: %  | kalan eski format: %', v_cnt, v_dup, v_left;
  if v_dup  > 0 then raise exception 'Mükerrer yeni kod üretildi (%).', v_dup; end if;
  if v_left > 0 then raise exception 'Hala % adet eski YS-#### kod var.', v_left; end if;
  if v_cnt <> 475 then raise warning 'Beklenen 475, taşınan %.', v_cnt; end if;
end $$;

commit;

-- GERİ ALMA (gerekirse, ayrı çalıştır):
--   update public.catalog_products c set code = m.old_code
--   from public.catalog_yscode_migration m where c.id = m.catalog_product_id;
