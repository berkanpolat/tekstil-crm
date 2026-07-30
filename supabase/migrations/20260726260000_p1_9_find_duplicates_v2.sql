-- =====================================================================
-- P1.9 düzeltme — find_duplicates: TAM firma eşitliğine ek olarak BENZER firma
-- (kısmi/ilike) sinyali. "ŞIKTAŞ" gibi kısmi yazımlar da uyarı versin.
-- Telefon/vergi sinyalleri aynı. leads + customers birlikte taranır.
-- =====================================================================
create or replace function public.find_duplicates(
  p_company    text default null,
  p_phone      text default null,
  p_tax_number text default null,
  p_exclude_type text default null,
  p_exclude_id   bigint default null
)
returns table (
  entity_type text,
  id          bigint,
  code        text,
  title       text,
  subtitle    text,
  reason      text
)
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select
      nullif(public.normalize_tr(p_company), '') as norm_company,
      public.normalize_contact_value('phone', p_phone) as phone_norm,
      nullif(regexp_replace(coalesce(p_tax_number,''), '[^0-9]', '', 'g'), '') as tax_digits
  ),
  cand as (
    -- Aynı firma adı (TAM normalize eşitlik = güçlü sinyal)
    select 'lead'::text et, l.id, 'aynı firma adı'::text reason, 1 rank
    from public.leads l, q
    where l.deleted_at is null and q.norm_company is not null and l.company_name_normalized = q.norm_company
    union all
    select 'customer', c.id, 'aynı firma adı', 1
    from public.customers c, q
    where c.deleted_at is null and q.norm_company is not null and c.company_name_normalized = q.norm_company
    union all
    -- Benzer firma adı (kısmi; en az 4 karakter → gürültüyü sınırla)
    select 'lead', l.id, 'benzer firma adı', 3
    from public.leads l, q
    where l.deleted_at is null and q.norm_company is not null and length(q.norm_company) >= 4
      and l.company_name_normalized <> q.norm_company
      and (l.company_name_normalized ilike '%'||q.norm_company||'%' or q.norm_company ilike '%'||l.company_name_normalized||'%')
    union all
    select 'customer', c.id, 'benzer firma adı', 3
    from public.customers c, q
    where c.deleted_at is null and q.norm_company is not null and length(q.norm_company) >= 4
      and c.company_name_normalized <> q.norm_company
      and (c.company_name_normalized ilike '%'||q.norm_company||'%' or q.norm_company ilike '%'||c.company_name_normalized||'%')
    union all
    -- Aynı telefon (leads + customers, contact_points üzerinden)
    select cp.entity_type, cp.entity_id, 'aynı telefon', 1
    from public.contact_points cp, q
    where q.phone_norm is not null and cp.type in ('phone', 'whatsapp') and cp.value_normalized = q.phone_norm
    union all
    -- Aynı vergi numarası (yalnız customers)
    select 'customer', c.id, 'aynı vergi no', 1
    from public.customers c, q
    where c.deleted_at is null and q.tax_digits is not null and c.tax_number_normalized = q.tax_digits
  ),
  agg as (
    select et, id, string_agg(distinct reason, ', ' order by reason) reason, min(rank) rank
    from cand
    where not (et = coalesce(p_exclude_type, '') and id = coalesce(p_exclude_id, -1))
    group by et, id
  )
  select
    a.et, a.id,
    case when a.et = 'customer' then c.customer_code end,
    case when a.et = 'lead' then coalesce(l.full_name, l.company_name)
         else coalesce(c.company_name, c.full_name) end,
    case when a.et = 'lead' then coalesce(l.company_name, l.city)
         else coalesce(c.city, c.customer_code) end,
    a.reason
  from agg a
  left join public.leads l on a.et = 'lead' and l.id = a.id
  left join public.customers c on a.et = 'customer' and c.id = a.id
  order by a.rank, a.et
  limit 25;
$$;

grant execute on function public.find_duplicates(text, text, text, text, bigint) to authenticated;
