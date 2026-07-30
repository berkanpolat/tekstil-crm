-- =====================================================================
-- P5.1 — Cari hesap şeması (account_transactions + bakiye + otomatik hareket)
--
-- Merhaba.docx Bölüm 6: müşteriyle aramızdaki tüm ödemeler kaydedilebilmeli,
-- cari hesap görüntülenebilmeli, hangi ödemenin ne için yapıldığı anlaşılmalı.
--
-- Verilen kararlar (tartışmaya kapalı):
--   • Teklif/sipariş USD, tahsilat TL veya USD olabilir → her harekette para birimi
--     + kur saklanır, hem TRY hem USD karşılığı hesaplanır.
--   • Bakiye HESAPLANIR, saklanmaz → customer_balance() hareketlerden türetir.
--   • Hiçbir hareket silinmez → yanlış kayıt ters kayıtla (reverses_id) düzeltilir.
--   • Yön alanı (borc/alacak) tek tabloda ayrım sağlar; iki tablo senkron sorunu yaratır.
--
-- Kullanıcı cevapları (Faz 5 §5): tahsilat hem TL hem USD; TL'de ÖDEME GÜNÜ TCMB
-- kuru; yalnız gelen (giden şema destekli, arayüz sade); dekont yok; çoklu ödeme var.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Finans yetkileri (RLS bu yetkilere dayandığı için ŞİMDİ tohumlanır;
--    rol atamaları P5.8'de incelenir. owner zaten kısayolla her yetkiye sahip.)
-- ---------------------------------------------------------------------
insert into public.permissions (key, module, action, description) values
  ('finance.view',   'finance', 'view',   'Cari hesap, ödeme ve bakiye görüntüle'),
  ('finance.edit',   'finance', 'edit',   'Ödeme kaydet, düzeltme (ters kayıt) yap'),
  ('finance.export', 'finance', 'export', 'Ekstre üret, finansal veri dışa aktar')
on conflict (key) do nothing;

-- admin, manager, finance → tam finans yetkisi (sales kendi müşterisini P5.8'de görür)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('finance.view','finance.edit','finance.export')
where r.key in ('admin','manager','finance')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 1) account_transactions — tüm finansal hareketler tek tabloda
-- ---------------------------------------------------------------------
create table public.account_transactions (
  id            bigint generated always as identity primary key,
  customer_id   bigint not null references public.customers (id) on delete restrict,
  direction     text   not null check (direction in ('borc','alacak')),
  source_type   text   not null check (source_type in ('siparis','odeme','iade','duzeltme','diger')),
  source_id     bigint,                                  -- ilgili sipariş/ödeme kaydı
  operation_id  bigint references public.operations (id) on delete set null,

  amount        numeric(14,2) not null check (amount >= 0),  -- işlem para biriminde
  currency      text  not null check (currency in ('USD','TRY','EUR')),
  exchange_rate numeric(14,6) not null check (exchange_rate > 0),  -- işlem para biriminin TRY karşılığı (TRY→1)
  usd_rate      numeric(14,6) not null check (usd_rate  > 0),      -- işlem anındaki USD→TRY (USD karşılığı için)
  amount_try    numeric(14,2) not null,                  -- = round(amount * exchange_rate, 2) — snapshot
  amount_usd    numeric(14,2) not null,                  -- = round(amount_try / usd_rate, 2) — snapshot

  occurred_at   timestamptz not null default now(),      -- gerçek işlem tarihi (geçmişe girilebilir)
  description   text,
  reverses_id   bigint references public.account_transactions (id) on delete restrict,  -- ters kayıt zinciri
  deleted_at    timestamptz,                             -- yalnızca hatalı giriş; ters kayıt tercih edilir
  deleted_by    uuid references public.users (id) on delete set null,
  created_by    uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.account_transactions is
  'Cari hareketler (tek tablo, yön ile ayrım). Bakiye buradan TÜRETİLİR (customer_balance). '
  'borc=müşterinin borcu (sipariş), alacak=müşteri lehine (ödeme). Silinmez; ters kayıtla düzeltilir.';
comment on column public.account_transactions.exchange_rate is 'İşlem para biriminin TRY karşılığı; kayıtta donar, yeniden hesaplanmaz.';
comment on column public.account_transactions.usd_rate is 'İşlem anındaki USD→TRY; amount_usd bununla türetildi, kayıtta donar.';

create index account_tx_customer_idx  on public.account_transactions (customer_id, occurred_at)      where deleted_at is null;
create index account_tx_operation_idx on public.account_transactions (operation_id)                  where operation_id is not null;
create index account_tx_source_idx    on public.account_transactions (source_type, source_id)        where deleted_at is null;
create index account_tx_reverses_idx  on public.account_transactions (reverses_id)                    where reverses_id is not null;

create trigger account_tx_touch before update on public.account_transactions
  for each row execute function public.touch_updated_at();
create trigger account_tx_audit after insert or update or delete on public.account_transactions
  for each row execute function public.audit_trigger();

-- RLS: yalnız finance.view okur, finance.edit yazar. (sales-kendi-müşterisi P5.8'de.)
alter table public.account_transactions enable row level security;
create policy account_tx_select on public.account_transactions
  for select to authenticated using (public.has_permission('finance.view'));
create policy account_tx_insert on public.account_transactions
  for insert to authenticated with check (public.has_permission('finance.edit'));
create policy account_tx_update on public.account_transactions
  for update to authenticated using (public.has_permission('finance.edit')) with check (public.has_permission('finance.edit'));
revoke all on public.account_transactions from anon;
grant select, insert, update on public.account_transactions to authenticated;

-- ---------------------------------------------------------------------
-- 2) Kur yardımcısı — işlem anındaki USD→TRY (ve verilen para biriminin TRY'si).
--    En güncel kaydı okur (stale olsa da sipariş oluşturmayı ENGELLEMEZ; teklif
--    engeli P4B'de ayrı). Kaynak: exchange_rates.is_current.
-- ---------------------------------------------------------------------
create or replace function public.rate_to_try(p_currency text)
returns numeric language sql stable security definer set search_path = '' as $$
  select case
    when p_currency = 'TRY' then 1::numeric
    else (select rate_try from public.exchange_rates where is_current and currency = p_currency limit 1)
  end;
$$;
grant execute on function public.rate_to_try(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3) post_account_transaction — hareket ekleme çekirdeği (SECURITY DEFINER).
--    amount_try / amount_usd BURADA bir kez hesaplanır ve donar. Trigger'lar ve
--    RPC'ler bunu çağırır. Kur verilmezse güncel kurdan alınır.
-- ---------------------------------------------------------------------
create or replace function public.post_account_transaction(
  p_customer_id   bigint,
  p_direction     text,
  p_source_type   text,
  p_amount        numeric,
  p_currency      text,
  p_source_id     bigint      default null,
  p_operation_id  bigint      default null,
  p_exchange_rate numeric     default null,   -- işlem para birimi → TRY (null → güncel)
  p_usd_rate      numeric     default null,   -- USD → TRY (null → güncel)
  p_occurred_at   timestamptz default null,
  p_description   text        default null,
  p_reverses_id   bigint      default null,
  p_created_by    uuid        default null
) returns bigint language plpgsql security definer set search_path = '' as $$
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
end; $$;
comment on function public.post_account_transaction is
  'Cari hareket ekler; amount_try/amount_usd bir kez hesaplanıp donar. Trigger ve RPC çekirdeği.';

-- ---------------------------------------------------------------------
-- 4) customer_balance — bakiye HAREKETLERDEN türetilir (saklanmaz).
--    balance = Σ(alacak) − Σ(borc). Negatif → müşteri borçlu (P5.6'da kırmızı).
--    Hem USD hem TRY döner. as_of verilirse o tarihe kadarki hareketler.
-- ---------------------------------------------------------------------
create or replace function public.customer_balance(
  p_customer_id bigint,
  p_as_of       timestamptz default null
) returns table (balance_usd numeric, balance_try numeric, last_transaction_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select
    coalesce(sum(case when direction = 'alacak' then amount_usd else -amount_usd end), 0),
    coalesce(sum(case when direction = 'alacak' then amount_try else -amount_try end), 0),
    max(occurred_at)
  from public.account_transactions
  where customer_id = p_customer_id
    and deleted_at is null
    and (p_as_of is null or occurred_at <= p_as_of);
$$;
grant execute on function public.customer_balance(bigint, timestamptz) to authenticated;
comment on function public.customer_balance is
  'Cari bakiye = Σ(alacak) − Σ(borc), USD ve TRY. Negatif = müşteri borçlu. Türetilir, saklanmaz.';

-- ---------------------------------------------------------------------
-- 5) reverse_account_transaction — hatalı hareketi TERS KAYITLA düzelt.
--    Orijinal durur (silinmez); zıt yönde, aynı tutarlarla ayna kayıt eklenir.
--    Aynı harekete iki kez ters kayıt engellenir.
-- ---------------------------------------------------------------------
create or replace function public.reverse_account_transaction(p_id bigint, p_reason text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_o public.account_transactions; v_new bigint;
begin
  if not public.has_permission('finance.edit') then
    raise exception 'Düzeltme yetkiniz yok.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason),'') = '' then
    raise exception 'Ters kayıt için gerekçe zorunludur.' using errcode = 'check_violation';
  end if;
  select * into v_o from public.account_transactions where id = p_id and deleted_at is null;
  if not found then raise exception 'Hareket bulunamadı: %', p_id; end if;
  if exists (select 1 from public.account_transactions where reverses_id = p_id and deleted_at is null) then
    raise exception 'Bu hareket zaten ters kayıtla düzeltilmiş: %', p_id using errcode = 'check_violation';
  end if;

  insert into public.account_transactions (
    customer_id, direction, source_type, source_id, operation_id,
    amount, currency, exchange_rate, usd_rate, amount_try, amount_usd,
    occurred_at, description, reverses_id, created_by
  ) values (
    v_o.customer_id,
    case v_o.direction when 'borc' then 'alacak' else 'borc' end,   -- zıt yön
    'duzeltme', v_o.source_id, v_o.operation_id,
    v_o.amount, v_o.currency, v_o.exchange_rate, v_o.usd_rate, v_o.amount_try, v_o.amount_usd,  -- aynı kurlar
    now(), 'Ters kayıt: ' || p_reason, v_o.id, auth.uid()
  ) returning id into v_new;

  perform public.log_event('account.reversed', 'customer', v_o.customer_id::text,
    jsonb_build_object('original_id', v_o.id, 'reverse_id', v_new, 'reason', p_reason));
  return v_new;
end; $$;
grant execute on function public.reverse_account_transaction(bigint, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6) Sipariş → borç hareketi (otomatik, trigger). — FARK KAYDI yaklaşımı.
--    Kural: HİÇBİR hareket değişmez. orders.total order_items'tan türeyip
--    değiştikçe, aradaki FARK yeni bir hareket olarak yazılır:
--      • Sipariş oluşur (10.000)              → borç 10.000  "Sipariş tutarı"
--      • Tutar 12.000 olur                    → borç  +2.000 "Sipariş tutarı güncellendi: 10.000 → 12.000"
--      • Tutar 8.000 olur                     → alacak −2.000 "Sipariş tutarı güncellendi: 12.000 → 8.000"
--    Mevcut satırlar hiç dokunulmaz; fark kayıtları ekstrede normal satır olarak
--    görünür (geçmiş, gürültü değil). Fark, siparişin O ANKİ kuruyla yazılır.
--    Sipariş İPTAL/SİLİNİRSE → aktif tüm 'siparis' hareketleri ters kayıtla kapanır.
-- ---------------------------------------------------------------------
create or replace function public.sync_order_debt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_customer   bigint;
  v_cancelled  boolean;
  v_booked     numeric;      -- siparişe dair şu ana kadar işlenmiş net tutar (sipariş para biriminde)
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
    -- İptal: aktif (ters kaydı atılmamış) tüm siparis hareketlerini tek tek ters kayıtla kapat.
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

  -- Aktif sipariş: şimdiye dek işlenmiş net tutarı hesapla (aktif, ters-kayıtsız siparis hareketleri).
  select coalesce(sum(case when t.direction = 'borc' then t.amount else -t.amount end), 0)
    into v_booked
  from public.account_transactions t
  where t.source_type = 'siparis' and t.source_id = new.id and t.deleted_at is null and t.reverses_id is null
    and not exists (select 1 from public.account_transactions x where x.reverses_id = t.id and x.deleted_at is null);

  v_delta := v_new_total - v_booked;
  if v_delta = 0 then return new; end if;    -- değişiklik yok

  if v_booked = 0 then
    v_desc := 'Sipariş tutarı';
  else
    v_desc := 'Sipariş tutarı güncellendi: ' ||
      trim(to_char(v_booked, 'FM999999999990D00')) || ' → ' ||
      trim(to_char(v_new_total, 'FM999999999990D00')) || ' ' || v_ccy;
  end if;

  perform public.post_account_transaction(
    v_customer,
    case when v_delta > 0 then 'borc' else 'alacak' end,
    'siparis', abs(v_delta), v_ccy,
    new.id, new.operation_id,
    null, null,                              -- kur: değişiklik anındaki güncel kur
    case when v_booked = 0 then new.order_date::timestamptz else now() end,
    v_desc, null, new.created_by);

  return new;
end; $$;

create trigger orders_sync_debt after insert or update of total, status_id, deleted_at, currency
  on public.orders for each row execute function public.sync_order_debt();

-- =====================================================================
-- NOT: Ödeme → alacak hareketi trigger'ı P5.2'de (payments genişletilince) eklenir.
-- Vade alanları (advance_due_date/balance_due_date) P5.4'te orders'a eklenir.
-- =====================================================================
