-- =====================================================================
-- H1 — Teklif SLA'sı DÜZ 24 TAKVİM SAATİ. Çalışma-saati (iş günü/mesai) hesabı kalkar;
-- talep tarihinden itibaren sabit N saat (ayar: sla.request_response_hours, varsayılan 24).
-- add_working_hours fonksiyonu korunur ama sla_deadline artık onu kullanmaz.
-- =====================================================================
create or replace function public.operations_set_sla()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.sla_deadline is null then
    new.sla_deadline := coalesce(new.requested_at, now())
      + coalesce((select (value #>> '{}')::numeric from public.settings where key = 'sla.request_response_hours'), 24) * interval '1 hour';
  end if;
  return new;
end; $$;
comment on function public.operations_set_sla() is
  'sla_deadline boşsa talep tarihi + N takvim saati (sla.request_response_hours, vars. 24). İş-saati hesabı yok (H1).';

-- Açık (teklif bekleyen, iptal olmamış) operasyonların son tarihini takvim kuralıyla yeniden hesapla.
update public.operations o set sla_deadline = coalesce(o.requested_at, o.created_at)
  + coalesce((select (value #>> '{}')::numeric from public.settings where key = 'sla.request_response_hours'), 24) * interval '1 hour'
where o.deleted_at is null and o.cancelled_at is null and o.sla_deadline is not null;
