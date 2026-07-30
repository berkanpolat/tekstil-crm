-- =====================================================================
-- P1.9 — Global arama + mükerrer aday tespiti (iki RPC).
-- SECURITY INVOKER: RLS uygulanır (kullanıcı yalnız görebildiğini bulur).
-- Sorgu SUNUCUDA normalize edilir (normalize_tr / normalize_contact_value / rakam).
-- =====================================================================

-- ---------- Global arama: leads + customers birlikte ----------
create or replace function public.global_search(p_query text, p_limit int default 20)
returns table (
  entity_type  text,
  id           bigint,
  code         text,
  title        text,
  subtitle     text,
  status_label text,
  reason       text
)
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select
      trim(p_query) as raw,
      public.normalize_tr(p_query) as norm,
      nullif(regexp_replace(coalesce(p_query,''), '[^0-9]', '', 'g'), '') as digits,
      public.normalize_contact_value('phone', p_query) as phone_norm,
      upper(regexp_replace(coalesce(p_query,''), '[^A-Za-z0-9-]', '', 'g')) as code_up
  ),
  cand as (
    -- İsim/firma/şehir (normalize) — leads
    select 'lead'::text et, l.id, 'ad/firma/şehir'::text reason
    from public.leads l, q
    where l.deleted_at is null and q.norm is not null
      and (l.company_name_normalized ilike '%'||q.norm||'%'
        or l.full_name_normalized ilike '%'||q.norm||'%'
        or l.city_normalized ilike '%'||q.norm||'%')
    union all
    -- İsim/firma/şehir — customers
    select 'customer', c.id, 'ad/firma/şehir'
    from public.customers c, q
    where c.deleted_at is null and q.norm is not null
      and (c.company_name_normalized ilike '%'||q.norm||'%'
        or c.full_name_normalized ilike '%'||q.norm||'%'
        or c.city_normalized ilike '%'||q.norm||'%')
    union all
    -- Müşteri kodu
    select 'customer', c.id, 'müşteri kodu'
    from public.customers c, q
    where c.deleted_at is null and length(q.code_up) >= 3 and c.customer_code ilike '%'||q.code_up||'%'
    union all
    -- Vergi numarası
    select 'customer', c.id, 'vergi no'
    from public.customers c, q
    where c.deleted_at is null and q.digits is not null and length(q.digits) >= 4
      and c.tax_number_normalized ilike '%'||q.digits||'%'
    union all
    -- İletişim (telefon E.164 tam eşleşme / e-posta içerir)
    select cp.entity_type, cp.entity_id, 'iletişim'
    from public.contact_points cp, q
    where (q.phone_norm is not null and cp.value_normalized = q.phone_norm)
       or (position('@' in q.raw) > 0 and cp.value_normalized ilike '%'||lower(q.raw)||'%')
  ),
  agg as (
    select et, id, string_agg(distinct reason, ', ' order by reason) reason
    from cand group by et, id
  )
  select
    a.et,
    a.id,
    case when a.et = 'customer' then c.customer_code end,
    case when a.et = 'lead' then coalesce(l.full_name, l.company_name)
         else coalesce(c.company_name, c.full_name) end,
    case when a.et = 'lead' then coalesce(l.company_name, l.city, l.sector)
         else coalesce(c.city, c.sector) end,
    case when a.et = 'lead' then ls.label else cs.label end,
    a.reason
  from agg a
  left join public.leads l on a.et = 'lead' and l.id = a.id
  left join public.customers c on a.et = 'customer' and c.id = a.id
  left join public.lead_statuses ls on a.et = 'lead' and ls.id = l.status_id
  left join public.customer_statuses cs on a.et = 'customer' and cs.id = c.status_id
  order by a.et, a.id desc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.global_search(text, int) to authenticated;

-- ---------- Mükerrer aday tespiti ----------
-- Kayıt oluştururken/düzenlerken/dönüştürürken uyarı (engelleme değil).
-- Sinyaller: aynı normalize firma adı · aynı telefon (E.164) · aynı vergi no.
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
    -- Aynı firma adı (normalize, TAM eşleşme = güçlü sinyal)
    select 'lead'::text et, l.id, 'aynı firma adı'::text reason
    from public.leads l, q
    where l.deleted_at is null and q.norm_company is not null
      and l.company_name_normalized = q.norm_company
    union all
    select 'customer', c.id, 'aynı firma adı'
    from public.customers c, q
    where c.deleted_at is null and q.norm_company is not null
      and c.company_name_normalized = q.norm_company
    union all
    -- Aynı telefon
    select cp.entity_type, cp.entity_id, 'aynı telefon'
    from public.contact_points cp, q
    where q.phone_norm is not null
      and cp.type in ('phone', 'whatsapp') and cp.value_normalized = q.phone_norm
    union all
    -- Aynı vergi numarası (yalnız customers)
    select 'customer', c.id, 'aynı vergi no'
    from public.customers c, q
    where c.deleted_at is null and q.tax_digits is not null
      and c.tax_number_normalized = q.tax_digits
  ),
  agg as (
    select et, id, string_agg(distinct reason, ', ' order by reason) reason
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
  order by a.reason, a.et;
$$;

grant execute on function public.find_duplicates(text, text, text, text, bigint) to authenticated;
