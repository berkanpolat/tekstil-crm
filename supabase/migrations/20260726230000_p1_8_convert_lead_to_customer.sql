-- =====================================================================
-- P1.8 — Dönüşüm fonksiyonu: potansiyel → müşteri.
-- Kararlar (kullanıcı onayı):
--  * customer_type_id ZORUNLU parametre; tax_office/tax_number/iban opsiyonel.
--  * Alt kayıtlar + event_log RELINK (entity 'lead'→'customer'); event_log'da
--    occurred_at/created_at DOKUNULMAZ (geçmiş dönüşüm tarihine yığılmasın).
--  * Lead arşiv kaydı olur (converted_customer_id + status=donusturuldu).
--  * relink sonrası last_interaction_at/next_action_at ELLE düzeltilir
--    (interactions_touch_parent UPDATE'te eski parent'ı hesaplamıyor).
-- Tek transaction, SECURITY DEFINER (RLS baypas; actor auth.uid() korunur).
-- =====================================================================
create or replace function public.convert_lead_to_customer(
  p_lead_id          bigint,
  p_customer_type_id bigint,
  p_tax_office       text default null,
  p_tax_number       text default null,
  p_iban             text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead        public.leads%rowtype;
  v_customer_id bigint;
  v_donusturuldu bigint;
begin
  if p_customer_type_id is null then
    raise exception 'Müşteri türü zorunludur.' using errcode = '22004';
  end if;
  if not exists (select 1 from public.customer_types where id = p_customer_type_id and is_active) then
    raise exception 'Geçersiz müşteri türü (id=%).', p_customer_type_id using errcode = '22004';
  end if;

  -- Lead'i kilitle + doğrula
  select * into v_lead from public.leads where id = p_lead_id and deleted_at is null for update;
  if not found then
    raise exception 'Potansiyel bulunamadı veya silinmiş (id=%).', p_lead_id using errcode = 'P0002';
  end if;
  if v_lead.converted_customer_id is not null then
    raise exception 'Bu potansiyel zaten müşteriye dönüştürülmüş (müşteri id=%).',
      v_lead.converted_customer_id using errcode = 'P0001';
  end if;

  -- 1) Müşteri oluştur (alan eşlemesi + source_id + opsiyonel ticari bilgiler)
  --    status_id verilmez → trigger 'aktif' atar; customer_code (MUS) trigger üretir.
  insert into public.customers (
    full_name, company_name, sector, country, city, district, address,
    source_id, customer_type_id, assigned_to, next_action_at, last_interaction_at,
    external_source, external_id, tax_office, tax_number, iban,
    converted_from_lead_id, converted_at, converted_by, created_by
  ) values (
    v_lead.full_name, v_lead.company_name, v_lead.sector, v_lead.country, v_lead.city, v_lead.district, v_lead.address,
    v_lead.source_id, p_customer_type_id, v_lead.assigned_to, v_lead.next_action_at, v_lead.last_interaction_at,
    v_lead.external_source, v_lead.external_id, p_tax_office, p_tax_number, p_iban,
    p_lead_id, now(), auth.uid(), auth.uid()
  ) returning id into v_customer_id;

  -- 2) Alt kayıtları taşı (entity 'lead'→'customer')
  update public.contact_points set entity_type = 'customer', entity_id = v_customer_id
    where entity_type = 'lead' and entity_id = p_lead_id;
  update public.interactions set entity_type = 'customer', entity_id = v_customer_id
    where entity_type = 'lead' and entity_id = p_lead_id;
  update public.notes set entity_type = 'customer', entity_id = v_customer_id
    where entity_type = 'lead' and entity_id = p_lead_id;
  update public.entity_tags set entity_type = 'customer', entity_id = v_customer_id
    where entity_type = 'lead' and entity_id = p_lead_id;
  update public.files set entity_type = 'customer', entity_id = v_customer_id::text
    where entity_type = 'lead' and entity_id = p_lead_id::text;

  -- 3) event_log geçmişini taşı — occurred_at/created_at DOKUNULMAZ
  update public.event_log set entity_type = 'customer', entity_id = v_customer_id::text
    where entity_type = 'lead' and entity_id = p_lead_id::text;

  -- 4) Sayaç düzeltmesi: lead arşiv (null), customer taşınan etkileşimlerden hesap
  update public.leads set last_interaction_at = null, next_action_at = null where id = p_lead_id;
  update public.customers set last_interaction_at = (
    select max(occurred_at) from public.interactions
    where entity_type = 'customer' and entity_id = v_customer_id and deleted_at is null
  ) where id = v_customer_id;

  -- 5) Lead'i dönüştürüldü/arşiv yap → lead.converted event (leads_timeline trigger)
  select id into v_donusturuldu from public.lead_statuses where key = 'donusturuldu';
  update public.leads
    set converted_customer_id = v_customer_id, converted_at = now(), converted_by = auth.uid(),
        status_id = coalesce(v_donusturuldu, status_id)
    where id = p_lead_id;

  return v_customer_id;
end;
$$;

comment on function public.convert_lead_to_customer(bigint, bigint, text, text, text) is
  'Potansiyeli müşteriye dönüştürür: müşteri oluşturur, alt kayıt + event_log taşır (timestamp korunur), lead''i arşivler. customer_type_id zorunlu.';

revoke all on function public.convert_lead_to_customer(bigint, bigint, text, text, text) from anon;
grant execute on function public.convert_lead_to_customer(bigint, bigint, text, text, text) to authenticated;
