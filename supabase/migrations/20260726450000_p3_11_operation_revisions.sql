-- =====================================================================
-- P3.11 — Revizyon geçmişi. Yeni tablo YOK; audit_log üzerine okuma katmanı.
-- Bir operasyonun kendisi + alt kayıtları (ürün kalemi, teklif, teklif kalemi,
-- numune, sipariş, sipariş kalemi) için değişiklik kayıtlarını toplar.
-- Türkçe etiket + önemli alan vurgusu arayüzde yapılır.
-- =====================================================================
create or replace function public.operation_revisions(p_operation_id bigint)
returns table (
  id bigint, table_name text, action text, changed_fields text[],
  old_values jsonb, new_values jsonb, actor_id uuid, actor_email text, created_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select a.id, a.table_name, a.action::text, a.changed_fields, a.old_values, a.new_values,
         a.actor_id, a.actor_email, a.created_at
  from public.audit_log a
  where a.source is not null and (
        (a.table_name = 'operations' and a.record_id = p_operation_id::text)
     or (a.table_name in ('operation_items','quotes','samples','orders')
         and coalesce(a.new_values->>'operation_id', a.old_values->>'operation_id') = p_operation_id::text)
     or (a.table_name = 'quote_items'
         and coalesce(a.new_values->>'quote_id', a.old_values->>'quote_id')
             in (select q.id::text from public.quotes q where q.operation_id = p_operation_id))
     or (a.table_name = 'order_items'
         and coalesce(a.new_values->>'order_id', a.old_values->>'order_id')
             in (select o.id::text from public.orders o where o.operation_id = p_operation_id))
  )
  order by a.created_at desc, a.id desc
  limit 300;
$$;
comment on function public.operation_revisions(bigint) is
  'Operasyon + alt kayıtlarının audit_log değişiklikleri (revizyon geçmişi). Türkçe etiketleme UI''da.';
grant execute on function public.operation_revisions(bigint) to authenticated;
