-- =====================================================================
-- P5.3 — Ön ödeme kontrolü (yumuşak kapı, GERÇEK ödeme kaydına bakar).
--
-- Faz 4A'da yumuşak kapı kurulmuştu ama gerçek ödemeye bakmıyordu. Şimdi bağlanır.
-- Merhaba.docx 6: "Sipariş öncesinde %50 ön ödeme alınması gerekmektedir. Ödeme
-- alınmadan üretime geçilmemelidir." — ama doküman esnekliği de şart koşar
-- ("her koşula uyum"). Bu yüzden ENGEL YOK; gerekçeyle geçilir, kayda yazılır.
--
-- Kullanıcı kararları (Faz 5):
--   • Kapı YALNIZ GEÇİŞLERDE açılır (sipariş zaten 'uretimde' oluşuyor; oluşturmada
--     pencere yok — kartta kalıcı ödeme durumu bandı kapsar). Elle/bekletmeden
--     'uretimde'ye dönüşte kontrol.
--   • Oran = alınan ÖN ÖDEME (is_advance=true) / sipariş tutarı (USD). Eşik ayardan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) order_advance_check — ön ödeme yeterlilik hesabı (USD bazında).
--    SECURITY DEFINER: siparişi üretime alan operasyon kullanıcısı da (finance.view
--    olmadan) kapıda gerekli/alınan tutarı görebilsin — geçiş kararı için gerekli.
-- ---------------------------------------------------------------------
create or replace function public.order_advance_check(p_order_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_sum  jsonb := public.order_paid_summary(p_order_id);
  v_pct  numeric := coalesce((select (value #>> '{}')::numeric from public.settings where key = 'finance.advance_payment_percent'), 50);
  v_total numeric := coalesce((v_sum->>'order_total_usd')::numeric, 0);
  v_adv   numeric := coalesce((v_sum->>'advance_usd')::numeric, 0);
  v_req   numeric := round(v_total * v_pct / 100, 2);
begin
  return jsonb_build_object(
    'required_percent', v_pct,
    'order_total_usd',  v_total,
    'required_usd',     v_req,
    'advance_usd',      v_adv,
    'paid_usd',         coalesce((v_sum->>'paid_usd')::numeric, 0),
    'advance_percent',  case when v_total > 0 then round(v_adv / v_total * 100, 1) else 0 end,
    'sufficient',       (v_adv + 0.005) >= v_req
  );
end; $$;
grant execute on function public.order_advance_check(bigint) to authenticated;
comment on function public.order_advance_check is
  'Ön ödeme yeterliliği: alınan ön ödeme (is_advance, USD) ≥ sipariş tutarı × eşik? Yumuşak kapı için.';

-- ---------------------------------------------------------------------
-- 2) advance_override — yetersiz ön ödemeyle üretime geçişi GEREKÇEYLE onayla.
--    event_log'a yazar + yöneticilere (owner/admin/manager) bildirim gönderir.
--    Durum değişikliğini İSTEMCİ yapar (bu sadece gerekçeyi kayda alır) — böylece
--    "engel yok" korunur; kayıt ve bildirim garanti olur.
-- ---------------------------------------------------------------------
create or replace function public.advance_override(p_order_id bigint, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_op    bigint;
  v_code  text;
  v_chk   jsonb := public.order_advance_check(p_order_id);
  v_uid   uuid := auth.uid();
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Yetersiz ön ödemeyle üretime geçmek için gerekçe zorunludur.' using errcode = 'check_violation';
  end if;
  select o.operation_id, op.code into v_op, v_code
  from public.orders o join public.operations op on op.id = o.operation_id
  where o.id = p_order_id;

  perform public.log_event('gate.overridden', 'operation', v_op::text,
    jsonb_build_object('gate', 'on_odeme_yetersiz', 'order_id', p_order_id,
      'required_usd', v_chk->'required_usd', 'advance_usd', v_chk->'advance_usd', 'reason', p_reason));

  -- Yöneticilere bildirim (owner/admin/manager) — kendisi hariç.
  insert into public.notifications (user_id, type, severity, title, body, entity_type, entity_id, action_url)
  select u.id, 'advance_override', 'warning',
    'Yetersiz ön ödemeyle üretime geçildi',
    coalesce(v_code, 'Sipariş') || ': beklenen ' || (v_chk->>'required_usd') || ' $, alınan ' ||
      (v_chk->>'advance_usd') || ' $. Gerekçe: ' || p_reason,
    'operation', v_op::text, '/talepler/' || v_op
  from public.users u join public.roles r on r.id = u.role_id
  where r.key in ('owner', 'admin', 'manager') and u.is_active and u.deleted_at is null
    and (v_uid is null or u.id <> v_uid);

  return v_chk;
end; $$;
grant execute on function public.advance_override(bigint, text) to authenticated;
comment on function public.advance_override is
  'Yetersiz ön ödeme geçişini gerekçeyle kayda alır + yöneticilere bildirir. Durumu istemci değiştirir (engel yok).';
