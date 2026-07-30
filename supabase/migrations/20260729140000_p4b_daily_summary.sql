-- =====================================================================
-- B.9 — GÜNLÜK ÖZET. Kullanıcının EYLEM GEREKTİREN kalemleri (bilgi satırı yok). Boş gün
-- geçerli sonuçtur (uydurma satır üretilmez). Kullanıcıya özel; yönetici ek ekip özeti görür.
-- Ses çalmaz — bu bir bildirim değil, bir ekran.
-- =====================================================================
create or replace function public.daily_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid(); v_end timestamptz := (now() at time zone public.app_timezone())::date + 1;
  v_mine int; v_due int; v_pool int; v_samples int; v_deliveries jsonb; v_is_mgr boolean; v_team_due int; v_name text;
begin
  select full_name into v_name from public.users where id = me;
  select exists(select 1 from public.users u join public.roles r on r.id=u.role_id where u.id=me and r.key in ('owner','admin','manager')) into v_is_mgr;

  select count(*) into v_mine from public.open_files where assigned_to = me and closed_at is null;
  select count(*) into v_due from public.open_files where assigned_to = me and closed_at is null and due_at <= v_end;
  select count(*) into v_pool from public.open_files where assigned_to is null and closed_at is null;

  -- Bu hafta teslim edilecek siparişlerim (owner me)
  select coalesce(jsonb_agg(jsonb_build_object('operation_id', o.id, 'code', o.code, 'due', ord.promised_delivery)
           order by ord.promised_delivery), '[]'::jsonb) into v_deliveries
  from public.orders ord
  join public.operations o on o.id = ord.operation_id
  join public.order_statuses s on s.id = ord.status_id
  where o.owner_id = me and ord.deleted_at is null and ord.promised_delivery is not null
    and s.key not in ('teslim_edildi','iptal_edildi','tamamlandi','sevk_edildi')
    and ord.promised_delivery::date <= (now() at time zone public.app_timezone())::date + 7;

  -- Müşteride geri bildirim bekleyen numunelerim
  select count(*) into v_samples from public.samples sm
  join public.operations o on o.id = sm.operation_id
  join public.sample_statuses ss on ss.id = sm.status_id
  where o.owner_id = me and sm.deleted_at is null and ss.key in ('musteriye_gonderildi','teslim_edildi','inceleniyor');

  if v_is_mgr then
    select count(*) into v_team_due from public.open_files where closed_at is null and due_at <= v_end;
  end if;

  return jsonb_build_object(
    'name', coalesce(v_name, ''),
    'mine_open', v_mine, 'mine_due_today', v_due, 'pool', v_pool,
    'samples_pending', v_samples, 'deliveries', v_deliveries,
    'is_manager', v_is_mgr, 'team_due_today', coalesce(v_team_due, 0)
  );
end; $$;
grant execute on function public.daily_summary() to authenticated;
