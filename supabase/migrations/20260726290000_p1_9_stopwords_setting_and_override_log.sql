-- =====================================================================
-- P1.9 düzeltme v5 — (1) firma çekirdek sözlüğü AYARDA (kod değil), yerli+yabancı
-- legal/kalıp kelimeler; ileride ayardan genişletilir. (2) Eşik izlenebilirliği:
-- benzerlikle eşleşip kullanıcının "farklı kayıt" deyip devam ettiği durumlar
-- event_log'a 'dedup.overridden' olarak yazılır → Faz 7'de eşik veriyle ayarlanır.
-- =====================================================================

-- (1) Sözlük ayarı (matching.company_stopwords). normalize_tr sonrası (ascii küçük).
insert into public.settings (key, value, category, description)
values (
  'matching.company_stopwords',
  '["a","s","as","ltd","sti","san","tic","sanayi","ticaret","limited","sirketi","anonim","ve","kollektif","komandit","dis","gmbh","inc","corp","co","sa","srl","bv","nv","ab","oy","plc","llc","company","textile","textil","tekstil","konfeksiyon"]'::jsonb,
  'matching',
  'Firma çekirdek adı çıkarılırken atılan legal/kalıp kelimeler (yerli+yabancı). Mükerrer kıyası.'
) on conflict (key) do nothing;

-- İki-argümanlı çekirdek (IMMUTABLE; find_duplicates sözlüğü bir kez okuyup geçer → hızlı).
create or replace function public.normalize_company_core_arr(input text, p_stop text[])
returns text
language sql
immutable
as $$
  select nullif(array_to_string(array(
    select w from unnest(string_to_array(coalesce(input, ''), ' ')) w
    where w <> '' and not (w = any(p_stop))
  ), ' '), '');
$$;

-- Tek-argümanlı kolaylık sürümü (STABLE; sözlüğü ayardan okur).
create or replace function public.normalize_company_core(input text)
returns text
language sql
stable
as $$
  select public.normalize_company_core_arr(
    input,
    (select array(select jsonb_array_elements_text(value) from public.settings where key = 'matching.company_stopwords'))
  );
$$;

-- find_duplicates: sözlüğü q'da bir kez oku, çekirdeği _arr ile hesapla.
create or replace function public.find_duplicates(
  p_company    text default null,
  p_phone      text default null,
  p_tax_number text default null,
  p_exclude_type text default null,
  p_exclude_id   bigint default null
)
returns table (
  entity_type text, id bigint, code text, title text, subtitle text, reason text
)
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select
      public.normalize_contact_value('phone', p_phone) as phone_norm,
      nullif(regexp_replace(coalesce(p_tax_number,''), '[^0-9]', '', 'g'), '') as tax_digits,
      (select array(select jsonb_array_elements_text(value) from public.settings where key='matching.company_stopwords')) as stop
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
      and similarity(public.normalize_company_core_arr(l.company_name_normalized, q2.stop), q2.core_company) >= 0.6
    union all
    select 'customer', c.id, 'benzer firma adı', 3
    from public.customers c, q2
    where c.deleted_at is null and length(q2.core_company) >= 4
      and public.normalize_company_core_arr(c.company_name_normalized, q2.stop) <> q2.core_company
      and similarity(public.normalize_company_core_arr(c.company_name_normalized, q2.stop), q2.core_company) >= 0.6
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
$$;
grant execute on function public.find_duplicates(text, text, text, text, bigint) to authenticated;

-- (2) Eşik izlenebilirliği: kayıt oluşturulduktan sonra, mükerrer aday VARSA
-- (kullanıcı uyarıyı görüp yine de devam etti) event_log'a yaz. INVOKER: RLS'e saygılı.
create or replace function public.log_dedup_override(
  p_entity_type text, p_entity_id bigint,
  p_company text default null, p_phone text default null, p_tax_number text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare v_cands jsonb;
begin
  select jsonb_agg(jsonb_build_object('entity_type', entity_type, 'id', id, 'reason', reason))
    into v_cands
  from public.find_duplicates(p_company, p_phone, p_tax_number, p_entity_type, p_entity_id);
  if v_cands is not null then
    perform public.log_event('dedup.overridden', p_entity_type, p_entity_id::text,
      jsonb_build_object('company', p_company, 'phone', p_phone, 'candidates', v_cands));
  end if;
end;
$$;
grant execute on function public.log_dedup_override(text, bigint, text, text, text) to authenticated;
