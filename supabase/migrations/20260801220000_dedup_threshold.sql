-- =====================================================================
-- 1.3 — Mükerrer tespiti yanlış alarmı azalt.
--   • Benzerlik eşiği ayardan yönetilir: matching.company_similarity_threshold (0.75).
--   • Kısa çekirdek (<4) zaten atlanıyor (korunur).
--   • YALNIZ rakamla ayrışan isimler benzer SAYILMAZ (Deneme01 / Deneme02).
-- =====================================================================

insert into public.settings (key, value, category, description)
values ('matching.company_similarity_threshold', '0.75'::jsonb, 'matching', 'Benzer firma adı eşiği (pg_trgm 0–1). Yüksek = daha az yanlış alarm.')
on conflict (key) do nothing;

create or replace function public.find_duplicates(
  p_company text default null, p_phone text default null, p_tax_number text default null,
  p_exclude_type text default null, p_exclude_id bigint default null)
returns table(entity_type text, id bigint, code text, title text, subtitle text, reason text)
language sql stable set search_path to 'public' as $function$
  with q as (
    select
      public.normalize_contact_value('phone', p_phone) as phone_norm,
      nullif(regexp_replace(coalesce(p_tax_number,''), '[^0-9]', '', 'g'), '') as tax_digits,
      (select array(select jsonb_array_elements_text(value) from public.settings where key='matching.company_stopwords')) as stop,
      coalesce((select (value#>>'{}')::numeric from public.settings where key='matching.company_similarity_threshold'), 0.75) as thr
  ),
  q2 as (
    select *, public.normalize_company_core_arr(public.normalize_tr(p_company), stop) as core_company from q
  ),
  cand as (
    select 'lead'::text et, l.id, 'aynı firma adı'::text reason, 1 rank
    from public.leads l, q2
    where l.deleted_at is null and q2.core_company is not null
      and public.normalize_company_core_arr(l.company_name_normalized, q2.stop) = q2.core_company
    union all
    select 'customer', c.id, 'aynı firma adı', 1
    from public.customers c, q2
    where c.deleted_at is null and q2.core_company is not null
      and public.normalize_company_core_arr(c.company_name_normalized, q2.stop) = q2.core_company
    union all
    select 'lead', l.id, 'benzer firma adı', 3
    from public.leads l, q2
    where l.deleted_at is null and length(q2.core_company) >= 4
      and public.normalize_company_core_arr(l.company_name_normalized, q2.stop) <> q2.core_company
      -- yalnız rakamla ayrışıyorsa benzer sayma (Deneme01 / Deneme02)
      and regexp_replace(public.normalize_company_core_arr(l.company_name_normalized, q2.stop), '[0-9]+', '', 'g')
          is distinct from regexp_replace(q2.core_company, '[0-9]+', '', 'g')
      and similarity(public.normalize_company_core_arr(l.company_name_normalized, q2.stop), q2.core_company) >= q2.thr
    union all
    select 'customer', c.id, 'benzer firma adı', 3
    from public.customers c, q2
    where c.deleted_at is null and length(q2.core_company) >= 4
      and public.normalize_company_core_arr(c.company_name_normalized, q2.stop) <> q2.core_company
      and regexp_replace(public.normalize_company_core_arr(c.company_name_normalized, q2.stop), '[0-9]+', '', 'g')
          is distinct from regexp_replace(q2.core_company, '[0-9]+', '', 'g')
      and similarity(public.normalize_company_core_arr(c.company_name_normalized, q2.stop), q2.core_company) >= q2.thr
    union all
    select cp.entity_type, cp.entity_id, 'aynı telefon', 1
    from public.contact_points cp, q2
    where q2.phone_norm is not null and cp.type in ('phone','whatsapp') and cp.value_normalized = q2.phone_norm
    union all
    select 'customer', c.id, 'aynı vergi no', 1
    from public.customers c, q2
    where c.deleted_at is null and q2.tax_digits is not null and c.tax_number_normalized = q2.tax_digits
  ),
  agg as (
    select et, id, string_agg(distinct reason, ', ' order by reason) reason, min(rank) rank
    from cand
    where not (et = coalesce(p_exclude_type,'') and id = coalesce(p_exclude_id,-1))
    group by et, id
  )
  select a.et, a.id,
    case when a.et='customer' then c.customer_code end,
    case when a.et='lead' then coalesce(l.full_name, l.company_name) else coalesce(c.company_name, c.full_name) end,
    case when a.et='lead' then coalesce(l.company_name, l.city) else coalesce(c.city, c.customer_code) end,
    a.reason
  from agg a
  left join public.leads l on a.et='lead' and l.id=a.id
  left join public.customers c on a.et='customer' and c.id=a.id
  order by a.rank, a.et limit 25;
$function$;
