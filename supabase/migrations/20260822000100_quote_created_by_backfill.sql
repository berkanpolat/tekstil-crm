-- Geriye dönük teklif atıfı: created_by NULL olan mevcut tekliflere operations.owner_id yazılır.
-- Gerekçe: çalışan bazlı teklif raporu geçmiş veriyi de göstersin. Bu TÜRETİLMİŞ veridir
--   (teklifi gerçekte kim oluşturdu bilinmiyor; operasyon sahibinden türetildi) →
--   rapor ekranında "geçmiş teklifler operasyon sahibinden türetilmiştir" notu gösterilecek (UI işi, ayrı).
-- Kapsam: yalnız created_by IS NULL olanlar. Sahipsiz operasyonların teklifleri (owner_id NULL) BOŞ kalır.
-- Idempotent: created_by dolu olan (yeni trigger ile veya bu backfill ile) satırlara dokunmaz.
-- Soft-deleted teklifler dahil edilmez (rapor onları saymıyor).

update public.quotes q
   set created_by = o.owner_id
  from public.operations o
 where q.operation_id = o.id
   and q.created_by is null
   and o.owner_id is not null
   and q.deleted_at is null;

-- Doğrulama (bilgi amaçlı NOTICE): kaç teklif atandı, kaç sahipsiz boş kaldı.
do $$
declare v_assigned int; v_null_remaining int;
begin
  select count(*) into v_null_remaining
    from public.quotes where created_by is null and deleted_at is null;
  select count(*) into v_assigned
    from public.quotes where created_by is not null and deleted_at is null;
  raise notice 'Backfill sonrası: created_by dolu=%, hala boş (sahipsiz)=%', v_assigned, v_null_remaining;
end $$;
