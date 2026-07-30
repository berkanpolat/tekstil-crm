-- =====================================================================
-- P3.4 düzeltme — Teklif varsayılanları koda gömülü değil, AYARDAN gelsin:
--   quotes.default_validity_days (7)  — teklif geçerlilik süresi
--   quotes.default_tax_rate     (20)  — KDV oranı (devlet kararıyla değişir)
-- Kolon default'ları kaldırılır; BEFORE INSERT trigger değer verilmemişse ayardan
-- okur. Böylece "kullanıcı 20 yazdı" ile "default 20" ayrışır; ileride oran/süre
-- değişince migration gerekmez, ayar satırı güncellenir.
-- =====================================================================

insert into public.settings (key, value, category, description) values
  ('quotes.default_validity_days', '7'::jsonb, 'quotes',
   'Yeni teklifin geçerlilik süresi (gün). valid_until = teklif tarihi + bu değer.'),
  ('quotes.default_tax_rate', '20'::jsonb, 'quotes',
   'Yeni tekliflerde varsayılan KDV oranı (%). Devlet kararıyla değişir; buradan güncellenir.')
on conflict (key) do nothing;

-- Statik kolon default'larını kaldır (artık trigger dolduruyor). NOT NULL kalır —
-- BEFORE INSERT trigger, constraint kontrolünden önce çalışıp değeri set eder.
alter table public.quotes alter column valid_until drop default;
alter table public.quotes alter column tax_rate drop default;

-- Ayardan okuma yardımcıları (STABLE — settings STABLE'dır).
create or replace function public.quote_default_validity_days()
returns int language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::int from public.settings where key = 'quotes.default_validity_days'), 7);
$$;

create or replace function public.quote_default_tax_rate()
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::numeric from public.settings where key = 'quotes.default_tax_rate'), 20);
$$;

-- BEFORE INSERT: versiyon + varsayılan durum + geçerlilik + KDV (değer verilmemişse ayardan).
create or replace function public.quotes_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.version is null then
    select coalesce(max(version), 0) + 1 into new.version
      from public.quotes where operation_id = new.operation_id;   -- soft-deleted dahil: numara tekrar etmesin (boşluk arayüzde "vN (silindi)" gösterilir)
  end if;
  if new.status_id is null then
    select id into new.status_id from public.quote_statuses where is_default limit 1;
  end if;
  if new.valid_until is null then
    new.valid_until := current_date + public.quote_default_validity_days();
  end if;
  if new.tax_rate is null then
    new.tax_rate := public.quote_default_tax_rate();
  end if;
  return new;
end; $$;

-- Revizyonda geçerlilik de ayardan (KDV kaynaktan kopyalanmaya devam eder).
create or replace function public.create_quote_revision(p_quote_id bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_src public.quotes;
  v_new_id bigint;
  v_uid uuid := auth.uid();
begin
  select * into v_src from public.quotes where id = p_quote_id and deleted_at is null;
  if not found then
    raise exception 'Revize edilecek teklif bulunamadı (id=%).', p_quote_id using errcode = 'P0002';
  end if;

  insert into public.quotes (
    operation_id, status_id, valid_until, currency, tax_rate, payment_term_id,
    lead_time_days, technical_notes, commercial_notes, internal_notes,
    supersedes_quote_id, created_by
  ) values (
    v_src.operation_id, null, current_date + public.quote_default_validity_days(), v_src.currency, v_src.tax_rate, v_src.payment_term_id,
    v_src.lead_time_days, v_src.technical_notes, v_src.commercial_notes, v_src.internal_notes,
    v_src.id, v_uid
  ) returning id into v_new_id;

  insert into public.quote_items (
    quote_id, operation_item_id, name, description, quantity, unit, unit_price, discount_rate, sort_order, created_by
  )
  select v_new_id, operation_item_id, name, description, quantity, unit, unit_price, discount_rate, sort_order, v_uid
    from public.quote_items where quote_id = p_quote_id and deleted_at is null
    order by sort_order, id;

  perform public.recompute_quote_totals(v_new_id);
  return v_new_id;
end; $$;

grant execute on function public.quote_default_validity_days() to authenticated;
grant execute on function public.quote_default_tax_rate() to authenticated;
