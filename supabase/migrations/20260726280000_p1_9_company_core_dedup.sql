-- =====================================================================
-- P1.9 düzeltme v4 — mükerrer firma karşılaştırması ÇEKİRDEK ad üzerinden.
-- Sorun: pg_trgm tam adı (legal ek "san tic ltd sti" + "a s") üzerinden ölçünce
-- boilerplate trigramları benzerliği şişiriyordu → 17 alakasız "benzer".
-- Çözüm: legal/kalıp kelimeleri at, ayırt edici çekirdeği kıyasla.
--   aynı firma  = çekirdek EŞİT (legal formdan bağımsız: "X A.Ş." ≈ "X Ltd.")
--   benzer firma = çekirdek similarity ≥ 0.6, eşit değil.
-- =====================================================================
create or replace function public.normalize_company_core(input text)
returns text
language sql
immutable
as $$
  select nullif(array_to_string(array(
    select w from unnest(string_to_array(coalesce(input, ''), ' ')) w
    where w <> '' and w <> all (array[
      'a','s','as','ltd','sti','san','tic','sanayi','ticaret','limited','sirketi','anonim','ve','kollektif','komandit'
    ])
  ), ' '), '');
$$;
comment on function public.normalize_company_core(text) is
  'Firma adının ayırt edici çekirdeği (legal/kalıp kelimeler atılır). Mükerrer kıyası için.';

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
      public.normalize_company_core(public.normalize_tr(p_company)) as core_company,
      public.normalize_contact_value('phone', p_phone) as phone_norm,
      nullif(regexp_replace(coalesce(p_tax_number,''), '[^0-9]', '', 'g'), '') as tax_digits
  ),
  cand as (
    -- Aynı firma (çekirdek eşit; legal formdan bağımsız)
    select 'lead'::text et, l.id, 'aynı firma adı'::text reason, 1 rank
    from public.leads l, q
    where l.deleted_at is null and q.core_company is not null
      and public.normalize_company_core(l.company_name_normalized) = q.core_company
    union all
    select 'customer', c.id, 'aynı firma adı', 1
    from public.customers c, q
    where c.deleted_at is null and q.core_company is not null
      and public.normalize_company_core(c.company_name_normalized) = q.core_company
    union all
    -- Benzer firma (çekirdek similarity ≥ 0.6, eşit değil; boilerplate şişirmez)
    select 'lead', l.id, 'benzer firma adı', 3
    from public.leads l, q
    where l.deleted_at is null and length(q.core_company) >= 4
      and public.normalize_company_core(l.company_name_normalized) <> q.core_company
      and similarity(public.normalize_company_core(l.company_name_normalized), q.core_company) >= 0.6
    union all
    select 'customer', c.id, 'benzer firma adı', 3
    from public.customers c, q
    where c.deleted_at is null and length(q.core_company) >= 4
      and public.normalize_company_core(c.company_name_normalized) <> q.core_company
      and similarity(public.normalize_company_core(c.company_name_normalized), q.core_company) >= 0.6
    union all
    select cp.entity_type, cp.entity_id, 'aynı telefon', 1
    from public.contact_points cp, q
    where q.phone_norm is not null and cp.type in ('phone', 'whatsapp') and cp.value_normalized = q.phone_norm
    union all
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
