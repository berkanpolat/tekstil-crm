-- =====================================================================
-- Müşteri silme düzeltmeleri (v1.11.1)
--   BUG 1: customer_archive/unarchive/hard_delete audit'e source='rpc' yazıyor
--          ama audit_source enum'unda 'rpc' YOK → her çağrı son adımda
--          "invalid input value for enum audit_source: rpc" ile ROLLBACK.
--          → Enum'a 'rpc' ekle (audit izini korumak için source='user' YAPMIYORUZ).
--   BUG 2: manager_pending_requests / manager_pending_quotes customers join'inde
--          c.deleted_at filtrelenmiyor → arşivli müşterinin (operasyonu soft-delete
--          edilmemişse) operasyonları yönetici havuzunda görünüyor.
--
--   ⚠️ UYGULAMA NOTU: ALTER TYPE ... ADD VALUE bir transaction bloğu içinde
--   çalıştırılırsa yeni değer aynı transaction'da KULLANILAMAZ. Bu dosyayı
--   `psql -f` ile (tek transaction'a SARMADAN, -1 KULLANMADAN) uygula; her ifade
--   autocommit olur, enum değeri fonksiyonlar çağrılmadan önce commit'lenir.
--   CREATE OR REPLACE FUNCTION enum değerini DDL anında KULLANMAZ (yalnız metin),
--   bu yüzden fonksiyon yeniden tanımları güvenlidir.
-- =====================================================================

-- ── BUG 1: audit_source enum'una 'rpc' ekle (idempotent) ─────────────
ALTER TYPE public.audit_source ADD VALUE IF NOT EXISTS 'rpc';

-- ── BUG 2a: manager_pending_requests — arşivli müşteriyi dışla ───────
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
      and c.deleted_at is null  -- arşivli müşterinin operasyonlarını gizle (left join: müşterisiz op'lar geçer)
      and not exists (select 1 from quotes q where q.operation_id=o.id and q.deleted_at is null)
    order by ordkey asc
    limit p_limit
  ) t;
  return v;
end $function$;

-- ── BUG 2b: manager_pending_quotes — arşivli müşteriyi dışla ─────────
CREATE OR REPLACE FUNCTION public.manager_pending_quotes(p_limit integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  perform metrics.guard(null);
  select coalesce(jsonb_agg(x order by created_at asc), '[]'::jsonb) into v from (
    select
      jsonb_build_object(
        'operation_id', o.id, 'quote_id', q.id, 'code', o.code,
        'customer', coalesce(c.company_name, c.full_name),
        'owner_name', u.full_name, 'created_at', q.created_at,
        'hours', round(extract(epoch from (now()-q.created_at))/3600)
      ) x, q.created_at
    from quotes q
      join operations o on o.id=q.operation_id
      left join customers c on c.id=o.customer_id
      left join users u on u.id=coalesce(q.created_by, o.owner_id)
    where q.deleted_at is null and q.responded_at is null and q.rejection_reason_id is null
      and o.deleted_at is null and o.cancelled_at is null and o.stage_id not in (select id from public.operation_stages where is_terminal)
      and c.deleted_at is null  -- arşivli müşterinin tekliflerini gizle (left join: müşterisiz op'lar geçer)
    order by q.created_at asc
    limit p_limit
  ) t;
  return v;
end $function$;

-- ── BACKFILL: eski toplu "Sil" ile arşivlenmiş (customers.deleted_at dolu) ────
--   müşterilerin AKTİF operasyonlarını gizle + bayrakla. BUG 1 yüzünden
--   customer_archive çalışmadığından bu operasyonlar hiç soft-delete edilmemişti.
--   Idempotent: yalnız deleted_at IS NULL olan op'ları hedefler (tekrar → 0 satır).
UPDATE public.operations o
SET deleted_at = c.deleted_at, deleted_by = c.deleted_by, archived_with_customer = true
FROM public.customers c
WHERE o.customer_id = c.id
  AND c.deleted_at IS NOT NULL
  AND o.deleted_at IS NULL;
