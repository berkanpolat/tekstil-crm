-- =====================================================================
-- P7.3 iyileştirmeleri (kullanıcı geri bildirimi 28 Tem 2026)
--
-- #5 DÖNÜŞÜM AYRIMI: conversion_rate = kabul / (kabul + red) — yani yalnız
--    SONUÇLANMIŞ teklifler payda. Cevap bekleyen (sonuçsuz) teklifler
--    paydadan çıkar, ayrı `quotes_pending` olarak gösterilir. Eskiden payda
--    quotes_sent (bekleyen dahil) olduğu için oran yanıltıcı düşük çıkıyordu.
--
-- #2 KÜÇÜK TABAN EŞİĞİ: dashboard.change_min_base ayarı (varsayılan 10) —
--    önceki dönem bu değerin altındaysa panel yüzde yerine ham sayı yazar.
-- =====================================================================

-- #2 — eşik ayarı
insert into public.settings (key, value, category, description)
values ('dashboard.change_min_base', '10'::jsonb, 'dashboard',
        'Değişim yüzdesi göstermek için önceki dönemin en az kaç olması gerektiği; altındaysa ham sayı gösterilir.')
on conflict (key) do nothing;

-- #5 — metric_employees: dönüşüm yalnız sonuçlanmış tekliflerde + bekleyen sayısı
create or replace function metrics.metric_employees(p_from timestamp with time zone, p_to timestamp with time zone)
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
begin
  perform metrics.guard(null);
  return (select coalesce(jsonb_agg(to_jsonb(e) order by e.quotes_sent desc, e.requests_handled desc),'[]') from (
    with q as (
      select q.created_by, q.responded_at,
        (s.key in ('kabul_edildi','numune_asamasina_gecildi')) accepted,
        (s.key in ('reddedildi','olumsuz')) rejected
      from public.quotes q join public.quote_statuses s on s.id=q.status_id
      where q.deleted_at is null and q.created_at>=p_from and q.created_at<p_to
    )
    select u.id user_id, u.full_name name, u.email email,
      (select count(*) from public.interactions i where i.created_by=u.id and i.deleted_at is null and i.occurred_at>=p_from and i.occurred_at<p_to) interactions,
      (select count(*) from public.operations o where o.owner_id=u.id and o.deleted_at is null and coalesce(o.requested_at,o.created_at)>=p_from and coalesce(o.requested_at,o.created_at)<p_to) requests_handled,
      (select count(*) from q where q.created_by=u.id) quotes_sent,
      (select count(*) from q where q.created_by=u.id and q.accepted) quotes_accepted,
      (select count(*) from q where q.created_by=u.id and q.rejected) quotes_rejected,
      (select count(*) from q where q.created_by=u.id and not q.accepted and not q.rejected) quotes_pending,
      (select count(*) from public.open_file_snoozes sn where sn.snoozed_by=u.id and sn.created_at>=p_from and sn.created_at<p_to) snooze_count,
      (select round(avg(extract(epoch from (q2.responded_at-q2.created_at))/3600)::numeric,1)
        from public.quotes q2 where q2.created_by=u.id and q2.deleted_at is null and q2.responded_at is not null and q2.created_at>=p_from and q2.created_at<p_to) avg_response_hours,
      -- dönüşüm: kabul / (kabul + red); sonuçlanmış teklif yoksa null
      (select case when (select count(*) from q where q.created_by=u.id and (q.accepted or q.rejected))=0 then null
        else round(100.0*(select count(*) from q where q.created_by=u.id and q.accepted)
          /(select count(*) from q where q.created_by=u.id and (q.accepted or q.rejected)),1) end) conversion_rate
    from public.users u where u.is_active and u.deleted_at is null
  ) e where (e.interactions>0 or e.requests_handled>0 or e.quotes_sent>0));
end; $function$;
