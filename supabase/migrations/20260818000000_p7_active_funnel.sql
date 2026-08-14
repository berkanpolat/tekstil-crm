-- =====================================================================
-- Gösterge paneli — ANLIK durum sayıları (madde 1).
--
-- Sorun: "Numunede" / "Siparişte" kartları metric_funnel'den besleniyordu;
-- o RPC operasyonu AÇILIŞ tarihine (requested_at/created_at ∈ [p_from,p_to))
-- göre kesip "aşamaya ULAŞMIŞ operasyon" (kümülatif huni) sayıyor. Sonuç:
-- bugün 3 numune sürüyor olsa da operasyonlar dünden önce açıldıysa kart 0
-- gösteriyordu. Bunlar bir AKIŞ değil DURUM sorusu ("şu an kaç iş sürüyor").
--
-- Çözüm: tarih parametresiz, operasyonun GÜNCEL aşamasına (operations.stage_id
-- → operation_stages.key) bakan ayrı bir RPC. Dönem seçicisinden bağımsız.
--   • Numunede  = stage 'numune'
--   • Siparişte = stage 'siparis' + 'uretim' (üretimdeki iş de "siparişte" sayılır)
--   • Terminal aşamalar (tamamlandi/teklif_reddedildi/iptal) ve deleted_at hariç.
--   • Yetki: metrics.guard(null) → reports.view (diğer metric_* ile aynı kapı).
-- =====================================================================

create or replace function metrics.metric_active_funnel()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_s int; v_o int;
begin
  perform metrics.guard(null);
  select
    count(*) filter (where st.key = 'numune'),
    count(*) filter (where st.key in ('siparis', 'uretim'))
    into v_s, v_o
  from public.operations o
  join public.operation_stages st on st.id = o.stage_id
  where o.deleted_at is null and st.is_terminal = false;
  return jsonb_build_object('samples', coalesce(v_s, 0), 'orders', coalesce(v_o, 0));
end; $$;

-- public köprü (PostgREST'e açık; metrics.* kapalı — diğer wrapper'larla aynı desen)
create or replace function public.metric_active_funnel()
returns jsonb language sql stable as $$ select metrics.metric_active_funnel() $$;

grant execute on function metrics.metric_active_funnel() to authenticated;
grant execute on function public.metric_active_funnel() to authenticated;
revoke execute on function public.metric_active_funnel() from anon;
