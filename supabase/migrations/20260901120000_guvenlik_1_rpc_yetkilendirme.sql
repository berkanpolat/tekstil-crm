-- ============================================================================
-- GÜVENLİK 1/4 — RPC yetkilendirmesi
--
-- SAST taraması (1 Eyl 2026) kök neden A: fonksiyon EXECUTE grant'leri
-- PostgreSQL varsayılanına (PUBLIC) bırakılmış. Depoda blanket `revoke` yok,
-- yalnız 13 fonksiyona tek tek yazılmış. Sonuç: unutulan her SECURITY DEFINER
-- fonksiyon `anon`'a — yani herkese açık publishable anahtara — açılmış.
--
-- Canlıda doğrulandı: intake_process, post_account_transaction, customer_balance,
-- order_paid_summary, goal_actual, set_exchange_rate, undo_import_batch,
-- dismiss_merge → `anon` EXECUTE = true, gövdede yetki kontrolü yok.
--
-- Bu migration üç şey yapar:
--   1) Yetkilendirmesi olmayan RPC'lerin gövdesine kapı ekler.
--   2) Trigger'ların çağırdığı iç mantığı ayrı, erişilemez fonksiyonlara taşır
--      (böylece kapı, trigger zincirini kırmaz).
--   3) Şema genelinde PUBLIC/anon EXECUTE'u geri alır ve varsayılanı kapatır.
--
-- Geri alma: bu dosyanın altındaki "GERİ ALMA" bloğuna bakın.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CARİ HAREKET YAZIMI
--
-- post_account_transaction'ın tek `auth.uid()` geçişi `coalesce(p_created_by,
-- auth.uid())` idi — bu bir yetki kontrolü değil, alan doldurma. Üstelik
-- p_created_by parametre olduğu için çağıran denetim izini de sahteleyebiliyordu.
--
-- Fonksiyonu doğrudan gizleyemiyoruz: sync_order_debt ve payments_to_account
-- trigger'ları onu çağırıyor ve bu trigger'lar sıradan kullanıcının sipariş/ödeme
-- işlemi sırasında çalışıyor. finance.edit kapısını doğrudan gövdeye koyarsak
-- `sales` rolü sipariş oluşturamaz hâle gelirdi. Bu yüzden mantık iç fonksiyona
-- taşınıyor, dış yüzeye kapı konuyor.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.post_account_transaction_internal(
  p_customer_id bigint, p_direction text, p_source_type text, p_amount numeric,
  p_currency text, p_source_id bigint, p_operation_id bigint, p_exchange_rate numeric,
  p_usd_rate numeric, p_occurred_at timestamptz, p_description text,
  p_reverses_id bigint, p_created_by uuid
) returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_rate     numeric := coalesce(p_exchange_rate, public.rate_to_try(p_currency));
  v_usd      numeric := coalesce(p_usd_rate, public.rate_to_try('USD'));
  v_try      numeric;
  v_usd_amt  numeric;
  v_id       bigint;
begin
  if v_rate is null or v_rate <= 0 then
    raise exception 'Geçerli kur bulunamadı (%). Kur girin.', p_currency using errcode = 'check_violation';
  end if;
  if v_usd is null or v_usd <= 0 then
    raise exception 'USD kuru bulunamadı; USD karşılığı hesaplanamıyor.' using errcode = 'check_violation';
  end if;
  v_try     := round(p_amount * v_rate, 2);
  v_usd_amt := round(v_try / v_usd, 2);

  insert into public.account_transactions (
    customer_id, direction, source_type, source_id, operation_id,
    amount, currency, exchange_rate, usd_rate, amount_try, amount_usd,
    occurred_at, description, reverses_id, created_by
  ) values (
    p_customer_id, p_direction, p_source_type, p_source_id, p_operation_id,
    p_amount, p_currency, v_rate, v_usd, v_try, v_usd_amt,
    coalesce(p_occurred_at, now()), p_description, p_reverses_id,
    coalesce(p_created_by, auth.uid())
  ) returning id into v_id;
  return v_id;
end $$;

comment on function public.post_account_transaction_internal is
  'İÇ KULLANIM. Yetki kontrolü YOKTUR — yalnız SECURITY DEFINER trigger''lardan '
  '(sync_order_debt, payments_to_account) çağrılır. EXECUTE anon/authenticated''tan '
  'geri alınmıştır. Dış yüzey: post_account_transaction.';

-- Dış yüzey: finance.edit kapısı + denetim izi sahteciliğinin kapatılması.
-- NOT: mevcut fonksiyonun parametre varsayılanları korunmalı — `create or replace`
-- varsayılanları kaldırmaya izin vermez (42P13).
create or replace function public.post_account_transaction(
  p_customer_id bigint, p_direction text, p_source_type text, p_amount numeric,
  p_currency text, p_source_id bigint default null, p_operation_id bigint default null,
  p_exchange_rate numeric default null, p_usd_rate numeric default null,
  p_occurred_at timestamptz default null, p_description text default null,
  p_reverses_id bigint default null, p_created_by uuid default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.has_permission('finance.edit') then
    raise exception 'Cari hareket yazma yetkiniz yok.' using errcode = '42501';
  end if;
  -- p_created_by yok sayılır: denetim izi her zaman gerçek çağırandır.
  return public.post_account_transaction_internal(
    p_customer_id, p_direction, p_source_type, p_amount, p_currency,
    p_source_id, p_operation_id, p_exchange_rate, p_usd_rate,
    p_occurred_at, p_description, p_reverses_id, auth.uid());
end $$;

-- Trigger'lar artık iç fonksiyonu çağırıyor (yalnız `perform` satırı değişti).
create or replace function public.sync_order_debt()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_customer   bigint;
  v_cancelled  boolean;
  v_booked     numeric;
  v_new_total  numeric := coalesce(new.total, 0);
  v_ccy        text    := coalesce(new.currency, 'TRY');
  v_delta      numeric;
  v_desc       text;
  r            record;
begin
  select o.customer_id into v_customer from public.operations o where o.id = new.operation_id;
  if v_customer is null then return new; end if;

  v_cancelled := new.deleted_at is not null
    or exists (select 1 from public.order_statuses s where s.id = new.status_id and s.key = 'iptal_edildi');

  if v_cancelled then
    for r in
      select t.* from public.account_transactions t
      where t.source_type = 'siparis' and t.source_id = new.id and t.deleted_at is null
        and not exists (select 1 from public.account_transactions x where x.reverses_id = t.id and x.deleted_at is null)
    loop
      insert into public.account_transactions (
        customer_id, direction, source_type, source_id, operation_id,
        amount, currency, exchange_rate, usd_rate, amount_try, amount_usd,
        occurred_at, description, reverses_id, created_by
      ) values (
        r.customer_id, case r.direction when 'borc' then 'alacak' else 'borc' end, 'iade',
        r.source_id, r.operation_id,
        r.amount, r.currency, r.exchange_rate, r.usd_rate, r.amount_try, r.amount_usd,
        now(), 'Sipariş iptali/silme — borç geri alındı', r.id, auth.uid()
      );
    end loop;
    return new;
  end if;

  select coalesce(sum(case when t.direction = 'borc' then t.amount else -t.amount end), 0)
    into v_booked
  from public.account_transactions t
  where t.source_type = 'siparis' and t.source_id = new.id and t.deleted_at is null and t.reverses_id is null
    and not exists (select 1 from public.account_transactions x where x.reverses_id = t.id and x.deleted_at is null);

  v_delta := v_new_total - v_booked;
  if v_delta = 0 then return new; end if;

  if v_booked = 0 then
    v_desc := 'Sipariş tutarı';
  else
    v_desc := 'Sipariş tutarı güncellendi: ' ||
      trim(to_char(v_booked, 'FM999999999990D00')) || ' → ' ||
      trim(to_char(v_new_total, 'FM999999999990D00')) || ' ' || v_ccy;
  end if;

  perform public.post_account_transaction_internal(
    v_customer,
    case when v_delta > 0 then 'borc' else 'alacak' end,
    'siparis', abs(v_delta), v_ccy,
    new.id, new.operation_id,
    null, null,
    case when v_booked = 0 then new.order_date::timestamptz else now() end,
    v_desc, null, new.created_by);

  return new;
end $$;

create or replace function public.payments_to_account()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare v_orig public.account_transactions;
begin
  if tg_op = 'INSERT' then
    if new.direction = 'gelen' and new.deleted_at is null and new.customer_id is not null then
      perform public.post_account_transaction_internal(
        new.customer_id, 'alacak', 'odeme', new.amount, new.currency,
        new.id, new.operation_id, new.exchange_rate, new.usd_rate,
        new.paid_at::timestamptz,
        coalesce(nullif(new.note,''), 'Ödeme alındı'), null, new.created_by);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.deleted_at is not null and old.deleted_at is null then
    select * into v_orig from public.account_transactions
    where source_type = 'odeme' and source_id = new.id and direction = 'alacak' and deleted_at is null
      and not exists (select 1 from public.account_transactions r where r.reverses_id = account_transactions.id and r.deleted_at is null)
    limit 1;
    if v_orig.id is not null then
      insert into public.account_transactions (
        customer_id, direction, source_type, source_id, operation_id,
        amount, currency, exchange_rate, usd_rate, amount_try, amount_usd,
        occurred_at, description, reverses_id, created_by
      ) values (
        v_orig.customer_id, 'borc', 'duzeltme', v_orig.source_id, v_orig.operation_id,
        v_orig.amount, v_orig.currency, v_orig.exchange_rate, v_orig.usd_rate, v_orig.amount_try, v_orig.amount_usd,
        now(), 'Ödeme silindi — geri alındı', v_orig.id, coalesce(new.deleted_by, auth.uid())
      );
    end if;
  end if;
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. FİNANSAL OKUMALAR — finance.view kapısı
--
-- P5.8'de `sales` rolünden finance.view geri alınmıştı, ama bu RPC'ler
-- SECURITY DEFINER olduğu için account_transactions/payments RLS'ini aşıp
-- kararı etkisiz bırakıyordu.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.customer_balance(
  p_customer_id bigint, p_as_of timestamptz default null
) returns table(balance_usd numeric, balance_try numeric, last_transaction_at timestamptz)
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not public.has_permission('finance.view') then
    raise exception 'Cari bakiye görme yetkiniz yok.' using errcode = '42501';
  end if;
  return query
    select
      coalesce(sum(case when t.direction = 'alacak' then t.amount_usd else -t.amount_usd end), 0),
      coalesce(sum(case when t.direction = 'alacak' then t.amount_try else -t.amount_try end), 0),
      max(t.occurred_at)
    from public.account_transactions t
    where t.customer_id = p_customer_id
      and t.deleted_at is null
      and (p_as_of is null or t.occurred_at <= p_as_of);
end $$;

-- İç hesap: kapısız. order_advance_check bunu kullanır (ön ödeme kapısının
-- finance.view'siz rollerde de çalışması gerekir — aşağıya bakın).
create or replace function public.order_paid_summary_internal(p_order_id bigint)
returns jsonb
language sql
stable security definer
set search_path to ''
as $$
  with o as (select id, total, currency from public.orders where id = p_order_id),
  pay as (
    select
      coalesce(sum(amount_usd), 0)                                as paid_usd,
      coalesce(sum(amount_try), 0)                                as paid_try,
      coalesce(sum(amount_usd) filter (where is_advance), 0)      as advance_usd
    from public.payments
    where order_id = p_order_id and direction = 'gelen' and deleted_at is null
  ),
  ord as (
    select (select total from o) as total,
           (select currency from o) as currency,
           round((select total from o) * public.rate_to_try(coalesce((select currency from o),'TRY'))
                 / nullif(public.rate_to_try('USD'),0), 2) as total_usd
  )
  select jsonb_build_object(
    'order_total',    (select total from ord),
    'order_currency', (select currency from ord),
    'order_total_usd',(select total_usd from ord),
    'paid_usd',       (select paid_usd from pay),
    'paid_try',       (select paid_try from pay),
    'advance_usd',    (select advance_usd from pay),
    'remaining_usd',  round((select total_usd from ord) - (select paid_usd from pay), 2),
    'paid_percent',   case when coalesce((select total_usd from ord),0) > 0
                        then round((select paid_usd from pay) / (select total_usd from ord) * 100, 1) else 0 end
  );
$$;

comment on function public.order_paid_summary_internal is
  'İÇ KULLANIM. Yetki kontrolü YOKTUR. EXECUTE anon/authenticated''tan geri alınmıştır.';

create or replace function public.order_paid_summary(p_order_id bigint)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not public.has_permission('finance.view') then
    raise exception 'Tahsilat özeti görme yetkiniz yok.' using errcode = '42501';
  end if;
  return public.order_paid_summary_internal(p_order_id);
end $$;

-- Ön ödeme kapısı: HERKESE açık kalmalı.
--
-- Bunu finance.view arkasına almak bir düzeltme değil, gerileme olurdu:
-- OrdersTab.tsx:180 `if (enteringProd && adv && !adv.sufficient …)` yazıyor —
-- `adv` null gelirse kapı sessizce ATLANIR. Yani okumayı kapatmak, %50 ön ödeme
-- kuralını finance.view'i olmayan rollerde tamamen devre dışı bırakırdı.
-- Çözüm: erişim açık kalır, ama finansal ayrıntı yetkisizden gizlenir.
create or replace function public.order_advance_check(p_order_id bigint)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
declare
  v_sum  jsonb := public.order_paid_summary_internal(p_order_id);
  v_pct  numeric := coalesce((select (value #>> '{}')::numeric from public.settings where key = 'finance.advance_payment_percent'), 50);
  v_total numeric := coalesce((v_sum->>'order_total_usd')::numeric, 0);
  v_adv   numeric := coalesce((v_sum->>'advance_usd')::numeric, 0);
  v_req   numeric := round(v_total * v_pct / 100, 2);
  v_ok    boolean := (v_adv + 0.005) >= v_req;
begin
  if not public.is_active_user() then
    raise exception 'Yetkisiz.' using errcode = '42501';
  end if;

  -- finance.view yoksa: yalnız kapının çalışması için gereken alanlar.
  if not public.has_permission('finance.view') then
    return jsonb_build_object(
      'required_percent', v_pct,
      'order_total_usd',  0,
      'required_usd',     0,
      'advance_usd',      0,
      'paid_usd',         0,
      'advance_percent',  case when v_total > 0 then round(v_adv / v_total * 100, 1) else 0 end,
      'sufficient',       v_ok,
      'redacted',         true
    );
  end if;

  return jsonb_build_object(
    'required_percent', v_pct,
    'order_total_usd',  v_total,
    'required_usd',     v_req,
    'advance_usd',      v_adv,
    'paid_usd',         coalesce((v_sum->>'paid_usd')::numeric, 0),
    'advance_percent',  case when v_total > 0 then round(v_adv / v_total * 100, 1) else 0 end,
    'sufficient',       v_ok,
    'redacted',         false
  );
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. goal_actual — yalnız 'ciro' dalı finansal
--
-- Hedefler ekranı tüm rollere açık ve bir satışçının kendi hedef ilerlemesini
-- görmesi meşru. Bu yüzden fonksiyonun tamamı kapatılmıyor; sadece ciro dalı
-- için yetki (veya hedefin kişinin kendisine ait olması) aranıyor.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.goal_actual(p_goal_id bigint)
returns numeric
language plpgsql
stable security definer
set search_path to ''
as $$
declare g public.goals; v numeric := 0; v_uids uuid[];
begin
  if not public.is_active_user() then
    raise exception 'Yetkisiz.' using errcode = '42501';
  end if;

  select * into g from public.goals where id = p_goal_id;
  if not found then return 0; end if;

  if g.scope = 'kisi' then v_uids := array[g.scope_user_id];
  elsif g.scope = 'ekip' then select array_agg(user_id) into v_uids from public.team_members where team_id = g.scope_team_id;
  elsif g.scope = 'departman' then select array_agg(id) into v_uids from public.users where department_id = g.scope_department_id and is_active;
  end if;

  if g.goal_type = 'talep_sayisi' then
    select count(*) into v from public.operations o
    where o.deleted_at is null and o.created_at::date between g.period_start and g.period_end
      and (v_uids is null or o.owner_id = any(v_uids));
  elsif g.goal_type = 'teklif_sayisi' then
    select count(*) into v from public.quotes q join public.operations o on o.id = q.operation_id
    where q.deleted_at is null and q.created_at::date between g.period_start and g.period_end
      and (v_uids is null or o.owner_id = any(v_uids));
  elsif g.goal_type = 'siparis_sayisi' then
    select count(*) into v from public.orders ord join public.operations o on o.id = ord.operation_id
    where ord.deleted_at is null and ord.order_date between g.period_start and g.period_end
      and (v_uids is null or o.owner_id = any(v_uids));
  elsif g.goal_type = 'ciro' then
    -- FİNANSAL DAL: reports.finance/finance.view yoksa yalnız kendi kişisel hedefi.
    if not (public.has_permission('reports.finance') or public.has_permission('finance.view')
            or (g.scope = 'kisi' and g.scope_user_id = auth.uid())) then
      raise exception 'Ciro hedefi görme yetkiniz yok.' using errcode = '42501';
    end if;
    select coalesce(sum(case when coalesce(g.currency,'TRY') = 'USD' then at.amount_usd else at.amount_try end), 0)
      into v from public.account_transactions at
      join public.operations o on o.id = at.operation_id
    where at.deleted_at is null and at.source_type = 'siparis' and at.direction = 'borc'
      and at.occurred_at::date between g.period_start and g.period_end
      and (v_uids is null or o.owner_id = any(v_uids));
  elsif g.goal_type = 'etkilesim_sayisi' then
    select count(*) into v from public.interactions i
    where i.deleted_at is null and i.created_at::date between g.period_start and g.period_end
      and (v_uids is null or i.created_by = any(v_uids));
  elsif g.goal_type = 'donusum_orani' then
    select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where converted_at is not null) / count(*), 2) end
      into v from public.leads l
    where l.deleted_at is null and l.created_at::date between g.period_start and g.period_end;
  end if;
  return coalesce(v, 0);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. set_exchange_rate — kur bozma koruması
--
-- Kapatılamaz: useExchangeRates kur bayatladığında HERHANGİ bir kullanıcının
-- oturumundan otomatik yenileme tetikliyor (useCatalog.ts:32). finance.edit
-- arkasına alırsak satış/operasyon rollerinde kur hiç güncellenmez.
-- Bunun yerine: oturum şartı + pozitiflik (son sürümde düşmüştü) + makullük bandı.
-- Banttan sapan değer yalnız finance.edit ile yazılabilir.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.set_exchange_rate(
  p_currency text, p_rate numeric, p_source text default 'TCMB'
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_prev numeric;
  v_band numeric := 0.25;   -- ±%25
begin
  if not public.is_active_user() then
    raise exception 'Yetkisiz.' using errcode = '42501';
  end if;
  if p_rate is null or p_rate <= 0 then
    raise exception 'Kur pozitif olmalıdır (% verildi).', p_rate using errcode = 'check_violation';
  end if;

  select rate_try into v_prev
    from public.exchange_rates
   where currency = p_currency and is_current
   limit 1;

  -- Mevcut kura göre aşırı sapma: yalnız finance.edit yazabilir.
  if v_prev is not null and v_prev > 0
     and (p_rate > v_prev * (1 + v_band) or p_rate < v_prev * (1 - v_band))
     and not public.has_permission('finance.edit') then
    raise exception
      'Kur mevcut değerden aşırı sapıyor (% → %). Bu değişiklik için finans yetkisi gerekir.',
      v_prev, p_rate
      using errcode = '42501';
  end if;

  update public.exchange_rates set is_current = false where currency = p_currency and is_current;
  insert into public.exchange_rates (currency, rate_try, source, is_current, rate_date)
  values (p_currency, p_rate, coalesce(p_source, 'TCMB'), true, (now() at time zone public.app_timezone())::date);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Toplu geri alma işlemleri — sahiplik/yönetici kapısı
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.undo_import_batch(p_batch_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_type text;
  v_undone timestamptz;
  v_owner uuid;
  v_actor uuid := auth.uid();
  v_skip bigint[];
  v_undone_n int := 0;
begin
  select entity_type, undone_at, created_by into v_type, v_undone, v_owner
    from public.import_batches where id = p_batch_id;
  if not found then
    raise exception 'İçe aktarma partisi bulunamadı (id=%).', p_batch_id using errcode = 'P0002';
  end if;

  -- Yalnız partiyi açan kişi veya yönetici geri alabilir.
  if v_owner is distinct from v_actor and not public.has_permission('settings.manage') then
    raise exception 'Bu içe aktarma partisini geri alma yetkiniz yok.' using errcode = '42501';
  end if;

  if v_undone is not null then
    raise exception 'Bu parti zaten geri alınmış (%).', v_undone using errcode = 'P0001';
  end if;

  if v_type = 'lead' then
    select array_agg(l.id) into v_skip from public.leads l
    where l.import_batch_id = p_batch_id and l.deleted_at is null and (
      exists (select 1 from public.interactions i where i.entity_type='lead' and i.entity_id=l.id and i.deleted_at is null)
      or exists (select 1 from public.notes n where n.entity_type='lead' and n.entity_id=l.id and n.deleted_at is null));
    update public.leads set deleted_at = now(), deleted_by = v_actor
      where import_batch_id = p_batch_id and deleted_at is null
        and (v_skip is null or id <> all(v_skip));
    get diagnostics v_undone_n = row_count;
  elsif v_type = 'customer' then
    select array_agg(c.id) into v_skip from public.customers c
    where c.import_batch_id = p_batch_id and c.deleted_at is null and (
      exists (select 1 from public.interactions i where i.entity_type='customer' and i.entity_id=c.id and i.deleted_at is null)
      or exists (select 1 from public.notes n where n.entity_type='customer' and n.entity_id=c.id and n.deleted_at is null));
    update public.customers set deleted_at = now(), deleted_by = v_actor
      where import_batch_id = p_batch_id and deleted_at is null
        and (v_skip is null or id <> all(v_skip));
    get diagnostics v_undone_n = row_count;
  end if;

  update public.import_batches set undone_at = now(), undone_by = v_actor where id = p_batch_id;
  return jsonb_build_object('undone', v_undone_n, 'skipped', coalesce(array_length(v_skip, 1), 0));
end $$;

create or replace function public.dismiss_merge(p_operation bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.is_active_user() then
    raise exception 'Yetkisiz.' using errcode = '42501';
  end if;
  update public.operations set possible_merge_with = null where id = p_operation;
  perform public.log_event('operation.merge_dismissed', 'operation', p_operation::text, '{}'::jsonb);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ŞEMA GENELİ: PUBLIC/anon EXECUTE geri alınıyor
--
-- Güvenli: doğrulandı ki public şemasındaki HER fonksiyonun `authenticated` için
-- açık grant'i var (proacl taraması, 0 istisna). Dolayısıyla PUBLIC'ten geri
-- almak oturumlu kullanıcıları etkilemez.
--
-- anon'a bilinçli bırakılan iki fonksiyon geri veriliyor: ikisi de oturumsuz
-- çağrıda `false` döner ve önyüz açılışında hata üretmemeleri gerekir.
-- ─────────────────────────────────────────────────────────────────────────────

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;

grant execute on function public.is_active_user() to anon;
grant execute on function public.has_permission(text) to anon;

-- İç fonksiyonlar: hiçbir istemci rolüne açık değil.
revoke execute on function public.post_account_transaction_internal(
  bigint, text, text, numeric, text, bigint, bigint, numeric, numeric, timestamptz, text, bigint, uuid
) from public, anon, authenticated;
revoke execute on function public.order_paid_summary_internal(bigint) from public, anon, authenticated;

-- intake_process yalnız intake-request edge fonksiyonundan (service_role) çağrılır.
-- Paylaşılan sırrın (X-Intake-Secret) tek koruma olmasını engeller: sır ifşa olsa
-- bile RPC doğrudan çağrılamaz.
revoke execute on function public.intake_process(jsonb) from public, anon, authenticated;

-- Bundan sonra oluşturulacak fonksiyonlar da varsayılan olarak PUBLIC'e açılmasın.
alter default privileges in schema public revoke execute on functions from public;

-- ============================================================================
-- GERİ ALMA (gerekirse):
--   grant execute on all functions in schema public to anon;
--   alter default privileges in schema public grant execute on functions to public;
--   ...ve bu dosyadan önceki fonksiyon tanımlarını geri yükleyin
--      (git: bu migration'dan önceki hâl).
-- ============================================================================
