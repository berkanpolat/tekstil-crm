-- P4B.9 — operation_catalog_items → catalog_products gerçek FK. Mevcut metin kod korunur;
-- eşleşen kayıtlar bağlanır (şu an 0 kayıt). Talep kartı seçilen ürünleri görselleriyle gösterir.
alter table public.operation_catalog_items add column if not exists catalog_product_id bigint references public.catalog_products(id);
create index if not exists operation_catalog_items_product_idx on public.operation_catalog_items (catalog_product_id);

-- Mevcut metin kodları eşle (idempotent)
update public.operation_catalog_items oci
  set catalog_product_id = cp.id
from public.catalog_products cp
where oci.catalog_product_id is null and cp.code = oci.catalog_product_code;
