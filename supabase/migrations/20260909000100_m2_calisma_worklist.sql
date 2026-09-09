-- =====================================================================
-- M2 — /calisma iş listesi özeti: calisma_worklist(p_from, p_to)
-- ---------------------------------------------------------------------
-- TEK RPC; 5 kovanın hem SAYISINI hem operation_id[] listesini tek sorguda döndürür
-- (kart sayıları + karta tıklayınca listelenecek talepler aynı yerden). Kart başına
-- ayrı sorgu YOK.
--
-- Kovalar:
--   bugun_aranacaklar (ANLIK, dönemsiz):
--     (A) aşama=teklif_iletildi VE en son teklifin sent_at'i > 1 gün önce VE o sent_at'ten
--         SONRA "karar bildiren" bir aksiyon YOK
--     ∪ (B) operations.next_action_at <= bugün (talep-bazlı elle takip — M1)
--   arandi        (DÖNEM): dönem içinde aksiyon (interaction) eklenmiş talepler
--   gelen_talep   (DÖNEM): requested_at dönemde olan talepler
--   bekleyen_talep(ANLIK): aşama=teklif_bekliyor VE hiç teklifi olmayan talepler
--   iletilen_teklif(DÖNEM): teklifi (quotes.sent_at) dönemde iletilen talepler
--
-- "Karar bildiren aksiyon" = outcome'u dolu VE key NOT IN ('sonra_aranacak','ulasilamadi').
--   Yani: ulasildi / teklif_isteniyor / numune_isteniyor / siparis_olustu / olumsuz sayılır;
--   "sonra aranacak" ve "ulaşılamadı" KARAR DEĞİLDİR → talep listede kalır.
--
-- Zaman dilimi: app_timezone() (Europe/Istanbul). "1 gün": now() - interval '1 day'.
-- Dönem varsayılanı: p_from/p_to verilmezse ikisi de BUGÜN. ANLIK kovalar dönemi yok sayar.
-- =====================================================================

create or replace function public.calisma_worklist(
  p_from date default null,
  p_to   date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz       text := public.app_timezone();
  v_today    date;
  v_from     date;
  v_to       date;
  v_bugun    bigint[];
  v_arandi   bigint[];
  v_gelen    bigint[];
  v_bekleyen bigint[];
  v_iletilen bigint[];
begin
  -- Yalnız aktif çalışan (anon/pasif erişemez; SECURITY DEFINER RLS'i atladığı için kapı burada).
  if not public.is_active_user() then
    raise exception 'Yetkisiz erişim.' using errcode = '42501';
  end if;

  v_today := (now() at time zone v_tz)::date;
  v_from  := coalesce(p_from, v_today);
  v_to    := coalesce(p_to,   v_today);

  -- 1) BUGÜN ARANACAKLAR (anlık) = A ∪ B
  --    Sıra: en eski teklif önce (sent_at ASC, nulls last) — en uzun bekleyen üstte.
  select coalesce(array_agg(t.id order by t.sort_sent asc nulls last, t.id), '{}')
    into v_bugun
  from (
    select o.id,
      (select max(q3.sent_at) from public.quotes q3
       where q3.operation_id = o.id and q3.deleted_at is null and q3.sent_at is not null) as sort_sent
    from public.operations o
    join public.operation_stages s on s.id = o.stage_id
    where o.deleted_at is null and o.merged_into is null
      and s.key not in ('tamamlandi', 'iptal', 'teklif_reddedildi')
      and (
        -- (A) teklif iletildi, >1 gün geçti, sonrasında karar yok
        (
          s.key = 'teklif_iletildi'
          and exists (
            select 1 from public.quotes q
            where q.operation_id = o.id and q.deleted_at is null
              and q.sent_at is not null and q.sent_at < now() - interval '1 day'
          )
          and not exists (
            select 1
            from public.interactions i
            join public.interaction_outcomes io on io.id = i.outcome_id
            where i.operation_id = o.id and i.deleted_at is null
              and io.key not in ('sonra_aranacak', 'ulasilamadi')  -- karar bildiren
              and i.occurred_at > (
                select max(q2.sent_at) from public.quotes q2
                where q2.operation_id = o.id and q2.deleted_at is null and q2.sent_at is not null
              )
          )
        )
        -- (B) talep-bazlı elle takip tarihi bugüne gelmiş
        or (
          o.next_action_at is not null
          and (o.next_action_at at time zone v_tz)::date <= v_today
        )
      )
  ) t;

  -- 2) ARANDI (dönem): dönem içinde aksiyon eklenmiş distinct talepler
  select coalesce(array_agg(id order by id), '{}')
    into v_arandi
  from (
    select distinct i.operation_id as id
    from public.interactions i
    join public.operations o on o.id = i.operation_id
    where i.deleted_at is null and i.operation_id is not null
      and o.deleted_at is null and o.merged_into is null
      and (i.occurred_at at time zone v_tz)::date between v_from and v_to
  ) t;

  -- 3) GELEN TALEP (dönem): requested_at dönemde
  select coalesce(array_agg(id order by id), '{}')
    into v_gelen
  from (
    select o.id
    from public.operations o
    where o.deleted_at is null and o.merged_into is null
      and (o.requested_at at time zone v_tz)::date between v_from and v_to
  ) t;

  -- 4) BEKLEYEN TALEP (anlık): teklif bekliyor + hiç teklif yok
  select coalesce(array_agg(id order by id), '{}')
    into v_bekleyen
  from (
    select o.id
    from public.operations o
    join public.operation_stages s on s.id = o.stage_id
    where o.deleted_at is null and o.merged_into is null
      and s.key = 'teklif_bekliyor'
      and not exists (
        select 1 from public.quotes q where q.operation_id = o.id and q.deleted_at is null
      )
  ) t;

  -- 5) İLETİLEN TEKLİF (dönem): teklifi dönemde iletilmiş distinct talepler
  select coalesce(array_agg(id order by id), '{}')
    into v_iletilen
  from (
    select distinct q.operation_id as id
    from public.quotes q
    join public.operations o on o.id = q.operation_id
    where q.deleted_at is null and q.sent_at is not null
      and o.deleted_at is null and o.merged_into is null
      and (q.sent_at at time zone v_tz)::date between v_from and v_to
  ) t;

  return jsonb_build_object(
    'from', v_from,
    'to',   v_to,
    'counts', jsonb_build_object(
      'bugun_aranacaklar', coalesce(array_length(v_bugun,    1), 0),
      'arandi',            coalesce(array_length(v_arandi,   1), 0),
      'gelen_talep',       coalesce(array_length(v_gelen,    1), 0),
      'bekleyen_talep',    coalesce(array_length(v_bekleyen, 1), 0),
      'iletilen_teklif',   coalesce(array_length(v_iletilen, 1), 0)
    ),
    'ids', jsonb_build_object(
      'bugun_aranacaklar', to_jsonb(v_bugun),
      'arandi',            to_jsonb(v_arandi),
      'gelen_talep',       to_jsonb(v_gelen),
      'bekleyen_talep',    to_jsonb(v_bekleyen),
      'iletilen_teklif',   to_jsonb(v_iletilen)
    )
  );
end;
$$;

comment on function public.calisma_worklist(date, date) is
  '/calisma iş listesi: 5 kovanın sayısı + operation_id[] (tek sorgu). ANLIK kovalar '
  '(bugun_aranacaklar, bekleyen_talep) dönemi yok sayar; arandi/gelen_talep/iletilen_teklif '
  'p_from..p_to (varsayılan bugün) arası. Karar bildiren outcome = sonra_aranacak/ulasilamadi hariç.';

-- Yalnız authenticated çağırabilir (güvenlik sertleştirmesiyle uyumlu).
revoke all on function public.calisma_worklist(date, date) from public, anon;
grant execute on function public.calisma_worklist(date, date) to authenticated;
