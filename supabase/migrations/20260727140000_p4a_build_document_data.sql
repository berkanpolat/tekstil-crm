-- =====================================================================
-- P4A.4 — Belge veri toplama (iç-not GÜVENLİ). Operasyon + müşteri + settings.company.*
-- alanlarından render'a hazır jsonb üretir. internal_notes / is_internal notlar HİÇ okunmaz.
-- Üretici bilgileri settings.company.* — koda gömülü değil.
-- =====================================================================
insert into public.settings (key, value, category, description) values
  ('documents.default_payment_terms', '"%50 Peşin, %50 Sevk Öncesi"'::jsonb, 'documents', 'Belgelerde varsayılan ödeme koşulu metni.')
on conflict (key) do nothing;

create or replace function public.build_document_data(p_operation_id bigint, p_type text, p_language text default 'tr')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  o record; c record; v_days int; v_kdv text; v_odeme text; v_musteri text; v_grup text; v_tur text;
  v_code6 text; v_teslimat text; v_search text;
begin
  select * into o from public.operations where id = p_operation_id and deleted_at is null;
  if not found then raise exception 'Operasyon bulunamadı (id=%).', p_operation_id using errcode = 'P0002'; end if;
  select * into c from public.customers where id = o.customer_id;
  select label into v_grup from public.product_categories where id = o.category_id;
  select label into v_tur from public.product_categories where id = o.type_id;
  v_musteri := coalesce(c.company_name, c.full_name, '');
  v_days := coalesce((select (value #>> '{}')::int from public.settings where key = 'quotes.default_validity_days'), 7);
  v_kdv := coalesce((select value #>> '{}' from public.settings where key = 'quotes.default_tax_rate'), '10');
  v_odeme := coalesce((select value #>> '{}' from public.settings where key = 'documents.default_payment_terms'), '%50 Peşin, %50 Sevk Öncesi');
  v_code6 := right(o.code, 6);                         -- TAS-XXXXXX → XXXXXX
  v_teslimat := to_char((now() at time zone public.app_timezone())::date + v_days, 'YYYY-MM-DD');
  v_search := concat_ws(' ', o.code, v_musteri, v_grup, v_tur, o.title);

  if p_type = 'fiyat_teklifi' then
    return jsonb_build_object('_search', v_search, 'tkS', jsonb_build_object(
      'talep', v_code6, 'musteri', v_musteri, 'grup', v_grup, 'tur', v_tur,
      'teslimat', v_teslimat, 'gecerli', v_days || ' Gün', 'odeme', v_odeme,
      'para', 'TRY', 'kdv', v_kdv, 'indirim', '0', 'not', '', 'opts', '[]'::jsonb));

  elsif p_type = 'siparis_onay' then
    return jsonb_build_object('_search', v_search, 'soS', jsonb_build_object(
      'kod', v_code6, 'dtarih', to_char((now() at time zone public.app_timezone())::date, 'YYYY-MM-DD'),
      'musteri', v_musteri, 'yetkili', coalesce(c.full_name, ''),
      'ftarih', to_char((now() at time zone public.app_timezone())::date, 'YYYY-MM-DD'),
      'grup', v_grup, 'tur', v_tur, 'kumas', '', 'renk', '', 'beden', '', 'adet', '', 'birim', '', 'termin', ''));

  elsif p_type = 'numune_etiketi' then
    return jsonb_build_object('_search', v_search,
      'norder', jsonb_build_object('musteri', v_musteri, 'urunkodu', o.code),
      'numuneler', '[]'::jsonb);  -- beden/renk elle girilir

  elsif p_type = 'siparis_formu' then
    return jsonb_build_object('_search', v_search, 'sip', jsonb_build_object(
      'no6', v_code6, 'urunkodu', o.code, 'tarih', to_char((now() at time zone public.app_timezone())::date, 'YYYY-MM-DD'),
      'toplam', '', 'alici', jsonb_build_object('unvan', v_musteri, 'vno', coalesce(c.tax_number,''), 'vd', coalesce(c.tax_office,''),
        'adres', coalesce(c.address, concat_ws(' / ', c.city, c.district), '')),
      'grup', v_grup, 'tur', v_tur, 'bsistem', 'Alfa', 'bedenler', '["XS","S","M","L","XL"]'::jsonb,
      'renkler', '[]'::jsonb, 'kompozisyon', '', 'bakim', '[]'::jsonb, 'para', 'TRY'));

  elsif p_type = 'koli_ustu' then
    return jsonb_build_object('_search', v_search,
      'order', jsonb_build_object('musteri', v_musteri, 'icerik', o.code,
        'adres', coalesce(c.address, concat_ws(' / ', c.city, c.district), ''), 'toplam', 1),
      'koliler', '[]'::jsonb);  -- koli detayları elle girilir
  end if;

  raise exception 'bilinmeyen belge tipi: %', p_type using errcode = '22023';
end; $$;
comment on function public.build_document_data(bigint, text, text) is
  'Belge için render-hazır jsonb (iç-not güvenli: internal_notes okunmaz). Üretici settings.company.*, alıcı müşteri kaydından.';
grant execute on function public.build_document_data(bigint, text, text) to authenticated;
