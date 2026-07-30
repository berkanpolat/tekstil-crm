-- P4B.2 — Katalog içe aktarma eşleşmesi: "Palto" türü ağaçta yok; Kadın Giyim / Dış Giyim'e eklenir.
-- (Diğer eşleşmeyenler alias ile: Tesettür→grup, Atlet ve Body→Body, Takım Elbise→İkili Takım.)
insert into public.product_categories (key, label, parent_id, sort_order, is_active, is_system)
select 'g_kadin_giyim_dis_giyim_palto', 'Palto', g.id,
       coalesce((select max(sort_order) from public.product_categories where parent_id = g.id), 0) + 10, true, false
from public.product_categories g
where g.parent_id is null and g.is_active and public.normalize_tr(g.label) = 'kadin giyim dis giyim'
  and not exists (select 1 from public.product_categories t where t.parent_id = g.id and public.normalize_tr(t.label) = 'palto');
