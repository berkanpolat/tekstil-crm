-- =====================================================================
-- P7-B — metric_pipeline: Dönüşüm hunisinin adım-adım İLERLEYEN / BEKLEYEN
-- (+ ÖLEN) kırılımı. metric_funnel yalnız "aşamaya ulaşan" kümülatif sayıyı
-- verir; bu RPC her adımda takılıp kalanı da ayırır ki raporlar
-- "199 talep → 142 teklife geçti, 57 hâlâ teklif bekliyor; 142 teklifin
--  118'i red, 24'ü kabul (3'ü numunede, 21'i henüz numuneye geçmedi)"
-- gibi cümleler kurabilsin.
--
-- MODEL — her operasyon için (dönem = talep açılış tarihi ∈ [p_from,p_to)):
--   Adımlar: Talep → Teklif → Numune → Sipariş → Üretim → Teslimat
--   Bir adımda:
--     • reached  = o adıma ULAŞAN operasyon (kümülatif; ilgili kayıt var)
--     • advanced = bir SONRAKİ adıma geçen (= sonraki adımın reached'i)
--     • waiting  = ulaştı, ilerlemedi, HÂLÂ AÇIK (red/iptal değil)  → "takılan"
--     • dead     = ulaştı, ilerlemedi, o adımda ÖLDÜ (teklif_reddedildi / iptal)
--   Özdeşlik (terminal olmayan adımlarda): reached = advanced + waiting + dead
--
-- Adım kaynakları:
--   Talep    = tüm operasyonlar
--   Teklif   = quotes var
--   Numune   = samples var
--   Sipariş  = orders var
--   Üretim   = order durumu üretim ve sonrası (uretimde/kargo_bekleniyor/kargoda/teslim_edildi)
--   Teslimat = order teslim_edildi ya da actual_delivery dolu  (başarı terminali)
--   dead     = operasyonun GÜNCEL aşaması teklif_reddedildi | iptal
--
-- Yetki: metrics.guard(p_scope_user) — diğer metric_* ile aynı kapı
--        (scope null → reports.view; başka kullanıcı → reports.view).
-- Dönem: p_from/p_to diğer metric_* ile birebir tutarlı (talep açılışına göre).
-- =====================================================================

create or replace function metrics.metric_pipeline(
  p_from timestamptz, p_to timestamptz, p_scope_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  n_talep int; n_teklif int; n_numune int; n_siparis int; n_uretim int; n_teslimat int;
  w_talep int; w_teklif int; w_numune int; w_siparis int; w_uretim int;
  d_talep int; d_teklif int; d_numune int; d_siparis int;
begin
  perform metrics.guard(p_scope_user);

  with base as materialized (
    select
      exists(select 1 from public.quotes q  where q.operation_id = o.id and q.deleted_at is null) has_q,
      exists(select 1 from public.samples s where s.operation_id = o.id and s.deleted_at is null) has_s,
      exists(select 1 from public.orders  r where r.operation_id = o.id and r.deleted_at is null) has_o,
      exists(select 1 from public.orders r join public.order_statuses os on os.id = r.status_id
             where r.operation_id = o.id and r.deleted_at is null
               and os.key in ('uretimde','kargo_bekleniyor','kargoda','teslim_edildi')) in_prod,
      exists(select 1 from public.orders r left join public.order_statuses os on os.id = r.status_id
             where r.operation_id = o.id and r.deleted_at is null
               and (os.key = 'teslim_edildi' or r.actual_delivery is not null)) delivered,
      coalesce(st.key in ('teklif_reddedildi','iptal'), false) dead
    from public.operations o
    left join public.operation_stages st on st.id = o.stage_id
    where o.deleted_at is null
      and coalesce(o.requested_at, o.created_at) >= p_from
      and coalesce(o.requested_at, o.created_at) <  p_to
      and (p_scope_user is null or o.owner_id = p_scope_user)
  )
  select
    count(*),
    count(*) filter (where has_q),
    count(*) filter (where has_s),
    count(*) filter (where has_o),
    count(*) filter (where in_prod),
    count(*) filter (where delivered),
    -- waiting (ulaştı, ilerlemedi, açık)
    count(*) filter (where not has_q and not dead),
    count(*) filter (where has_q and not has_s and not dead),
    count(*) filter (where has_s and not has_o and not dead),
    count(*) filter (where has_o and not in_prod and not dead),
    count(*) filter (where in_prod and not delivered and not dead),
    -- dead (o adımda öldü)
    count(*) filter (where dead and not has_q),
    count(*) filter (where dead and has_q and not has_s),
    count(*) filter (where dead and has_s and not has_o),
    count(*) filter (where dead and has_o)
  into
    n_talep, n_teklif, n_numune, n_siparis, n_uretim, n_teslimat,
    w_talep, w_teklif, w_numune, w_siparis, w_uretim,
    d_talep, d_teklif, d_numune, d_siparis
  from base;

  return jsonb_build_object(
    'total', n_talep,
    'steps', jsonb_build_array(
      metrics.pipeline_step('talep',    'Talep',    n_talep,    n_teklif,   w_talep,  d_talep),
      metrics.pipeline_step('teklif',   'Teklif',   n_teklif,   n_numune,   w_teklif, d_teklif),
      metrics.pipeline_step('numune',   'Numune',   n_numune,   n_siparis,  w_numune, d_numune),
      metrics.pipeline_step('siparis',  'Sipariş',  n_siparis,  n_uretim,   w_siparis,d_siparis),
      metrics.pipeline_step('uretim',   'Üretim',   n_uretim,   n_teslimat, w_uretim, 0),
      -- Teslimat: başarı terminali. advanced/waiting/dead yok; reached = teslim edilen.
      metrics.pipeline_step('teslimat', 'Teslimat', n_teslimat, 0,          0,        0)
    )
  );
end; $$;

-- Adım nesnesi kurucu (tekrarı önler): reached/advanced/waiting/dead + oranlar.
--   advance_rate = advanced / reached  (bu adımdan bir sonrakine geçiş oranı)
--   stuck_rate   = waiting  / reached  (bu adımda takılı kalma oranı)
create or replace function metrics.pipeline_step(
  p_key text, p_label text, p_reached int, p_advanced int, p_waiting int, p_dead int)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'key', p_key, 'label', p_label,
    'reached', p_reached, 'advanced', p_advanced, 'waiting', p_waiting, 'dead', p_dead,
    'advance_rate', case when p_reached = 0 then null else round(100.0 * p_advanced / p_reached, 1) end,
    'stuck_rate',   case when p_reached = 0 then null else round(100.0 * p_waiting  / p_reached, 1) end
  );
$$;

-- public köprü (PostgREST'e açık; metrics.* kapalı — diğer wrapper'larla aynı desen)
create or replace function public.metric_pipeline(
  p_from timestamptz, p_to timestamptz, p_scope_user uuid default null)
returns jsonb language sql stable as $$ select metrics.metric_pipeline(p_from, p_to, p_scope_user) $$;

grant execute on function metrics.metric_pipeline(timestamptz, timestamptz, uuid) to authenticated;
grant execute on function metrics.pipeline_step(text, text, int, int, int, int) to authenticated;
grant execute on function public.metric_pipeline(timestamptz, timestamptz, uuid) to authenticated;
revoke execute on function public.metric_pipeline(timestamptz, timestamptz, uuid) from anon;
