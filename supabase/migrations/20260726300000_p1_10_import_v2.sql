-- =====================================================================
-- P1.10 düzeltme — (1) sütun eşlemesi hatırlansın (import_batches.column_mapping),
-- (2) içe aktarmada TÜM dosya mükerrer kontrolü (sunucu tarafı, tek çağrı):
--     aynı firma çekirdeği / aynı telefon / aynı vergi no → atlanacak satırlar.
-- =====================================================================
alter table public.import_batches
  add column column_mapping jsonb;

comment on column public.import_batches.column_mapping is
  'Sütun→alan eşlemesi (alan adı → CSV başlık adı). Aynı dosya/başlık gelince öntanımlı.';

-- Toplu mükerrer kontrolü: her satır için (firma çekirdeği/telefon/vergi) mevcut
-- kayıtlarla eşleşiyor mu? matched=true olanlar içe aktarmada atlanır.
create or replace function public.check_import_duplicates(p_rows jsonb)
returns table (idx int, matched boolean, reason text)
language sql
stable
security invoker
set search_path = public
as $$
  with stop as (
    select array(select jsonb_array_elements_text(value) from public.settings where key='matching.company_stopwords') as s
  ),
  rows as (
    select (ord - 1)::int as idx,
      public.normalize_company_core_arr(public.normalize_tr(t.r->>'company'), stop.s) as core,
      public.normalize_contact_value('phone', t.r->>'phone') as phone_norm,
      nullif(regexp_replace(coalesce(t.r->>'tax',''), '[^0-9]', '', 'g'), '') as tax
    from jsonb_array_elements(p_rows) with ordinality as t(r, ord), stop
  )
  select
    r.idx,
    (r.comp or r.ph or r.tx) as matched,
    nullif(concat_ws(', ',
      case when r.comp then 'aynı firma' end,
      case when r.ph then 'aynı telefon' end,
      case when r.tx then 'aynı vergi no' end), '') as reason
  from (
    select rr.idx,
      (rr.core is not null and length(rr.core) >= 2 and (
         exists (select 1 from public.leads l, stop where l.deleted_at is null
                 and public.normalize_company_core_arr(l.company_name_normalized, stop.s) = rr.core)
         or exists (select 1 from public.customers c, stop where c.deleted_at is null
                 and public.normalize_company_core_arr(c.company_name_normalized, stop.s) = rr.core)
      )) as comp,
      (rr.phone_norm is not null and exists (
         select 1 from public.contact_points cp where cp.type in ('phone','whatsapp') and cp.value_normalized = rr.phone_norm)) as ph,
      (rr.tax is not null and exists (
         select 1 from public.customers c where c.deleted_at is null and c.tax_number_normalized = rr.tax)) as tx
    from rows rr
  ) r;
$$;

grant execute on function public.check_import_duplicates(jsonb) to authenticated;
