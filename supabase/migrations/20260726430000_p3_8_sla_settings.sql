-- =====================================================================
-- P3.8 — SLA merdiveni (hepsi ayarlardan). Talep açılınca sla_deadline = 24 iş saati
-- sonrası (working_hours.* kullanılır). Eşikler okuma anında hesaplanır; cron yok.
-- Bildirimler uygulama içi (Faz 2 atlandı); eşik aşımı event_log'a → Faz 6 okur.
-- =====================================================================
insert into public.settings (key, value, category, description) values
  ('sla.request_response_hours', '24'::jsonb, 'sla', 'Talep ilk yanıt SLA süresi (iş saati). sla_deadline bu kadar iş saati sonrası.'),
  ('sla.warn_at_percent', '50'::jsonb, 'sla', 'SLA''nın yüzde kaçında sorumluya uyarı (varsayılan %50 → 12. saat).'),
  ('sla.escalate_after_hours', '48'::jsonb, 'sla', 'Bu iş saatinden sonra yöneticiye tırmandırma (varsayılan 48).')
on conflict (key) do nothing;

-- Eşik taraması — idempotent. Okuma anında çağrılabilir; süresi dolmuş ama daha önce
-- 'sla.overdue' olayı yazılmamış operasyonlar için olay üretir (Faz 6 bildirim merkezi okur).
create or replace function public.sla_sweep()
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int := 0; r record;
begin
  for r in
    select o.id from public.operations o
    where o.deleted_at is null and o.cancelled_at is null and o.sla_deadline is not null
      and o.sla_deadline < now()
      and o.request_status_id in (select id from public.request_statuses where is_default)  -- hâlâ ilk durumda
      and not exists (
        select 1 from public.event_log e
        where e.entity_type = 'operation' and e.entity_id = o.id::text and e.event_type = 'sla.overdue')
  loop
    perform public.log_event('sla.overdue', 'operation', r.id::text, jsonb_build_object('at', now()));
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;
comment on function public.sla_sweep() is
  'SLA süresi dolan (ve hâlâ yanıtlanmamış) operasyonlar için idempotent olarak sla.overdue olayı yazar. Okuma anında çağrılır; cron gerekmez.';
grant execute on function public.sla_sweep() to authenticated;
