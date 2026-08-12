-- P7 Gösterge paneli — "Teklif bekliyor" satırında ürün görseli.
-- manager_pending_requests RPC'sine, operasyonun İLK görsel dosyasının storage yolu
-- ('image_path') eklenir. İmzalama + thumbnail dönüşümü istemcide (useSignedUrl) yapılır.
-- Görsel seçimi OperationsListPage'deki Thumb ile aynı mantık: entity_type='operation',
-- bucket='documents', mime image/*, en eski (created_at asc).
--
-- ⚠️ ÜRETİM: bu migration ELLE uygulanır (bkz. CLAUDE.md migration defter kayması notu).
--    Uygulanana kadar image_path null döner; panel yer tutucu (gömlek ikonu) gösterir.

CREATE OR REPLACE FUNCTION public.manager_pending_requests(p_limit integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  perform metrics.guard(null);
  select coalesce(jsonb_agg(x order by ordkey), '[]'::jsonb) into v from (
    select
      jsonb_build_object(
        'operation_id', o.id, 'code', o.code,
        'customer', coalesce(c.company_name, c.full_name),
        'category', cat.label, 'owner_name', u.full_name,
        'unowned', (o.owner_id is null),
        'sla_deadline', o.sla_deadline, 'requested_at', o.requested_at,
        'image_path', (
          select f.storage_path from files f
          where f.entity_type = 'operation' and f.entity_id = o.id::text
            and f.bucket = 'documents' and f.mime_type like 'image/%'
          order by f.created_at asc
          limit 1
        )
      ) x,
      coalesce(o.sla_deadline, o.requested_at, now()) ordkey
    from operations o
      left join customers c on c.id=o.customer_id
      left join product_categories cat on cat.id=o.category_id
      left join users u on u.id=o.owner_id
    where o.deleted_at is null and o.cancelled_at is null and o.stage_id not in (select id from public.operation_stages where is_terminal)
      and not exists (select 1 from quotes q where q.operation_id=o.id and q.deleted_at is null)
    order by ordkey asc
    limit p_limit
  ) t;
  return v;
end $function$;
