-- =====================================================================
-- P5.2 — Ödeme kayıtları: mevcut payments GENİŞLETİLİR (yeni tablo yazılmaz).
--   + payment_methods (referans, ayarlardan) + bank_accounts (şirket hesapları).
--   + Ödeme (gelen) girilince otomatik ALACAK hareketi (account_transactions).
--
-- Kullanıcı cevapları (Faz 5 §5): tahsilat hem TL hem USD; TL'de ödeme günü TCMB
-- kuru (formda otomatik gelir, elle değişebilir); yalnız GELEN takip; dekont YOK
-- (receipt_file_id eklenmez, referans no yeterli); çek/senet KULLANILMIYOR (tohumda
-- yok); çoklu ödeme var (bir siparişe birden çok ödeme). Bakiye hareketlerden türer.
-- =====================================================================

-- Ön ödeme oranı ayarı (P5.3 kontrolü + Ayarlar → Finans). Vars. %50.
insert into public.settings (key, value, category, description) values
  ('finance.advance_payment_percent', '50'::jsonb, 'finance', 'Üretime geçerken beklenen ön ödeme yüzdesi (yumuşak kapı).')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 1) payment_methods — ödeme yöntemi referansı (ayarlardan yönetilir)
-- ---------------------------------------------------------------------
create table public.payment_methods (
  id          bigint generated always as identity primary key,
  key         text not null unique,
  label       text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.payment_methods is 'Ödeme yöntemleri (havale/nakit/kart/diğer). Çek/senet kullanılmıyor.';
insert into public.payment_methods (key,label,sort_order,is_system) values
  ('havale_eft','Havale / EFT',1,true),
  ('nakit','Nakit',2,true),
  ('kredi_karti','Kredi Kartı',3,true),
  ('diger','Diğer',4,true);
create trigger payment_methods_touch before update on public.payment_methods for each row execute function public.touch_updated_at();
create trigger payment_methods_audit after insert or update or delete on public.payment_methods for each row execute function public.audit_trigger();
alter table public.payment_methods enable row level security;
create policy payment_methods_select on public.payment_methods for select to authenticated using (public.is_active_user());
create policy payment_methods_write  on public.payment_methods for all to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());
revoke all on public.payment_methods from anon;
grant select, insert, update, delete on public.payment_methods to authenticated;

-- ---------------------------------------------------------------------
-- 2) bank_accounts — şirket banka hesapları (ayarlardan; tohum YOK, kullanıcı girer)
-- ---------------------------------------------------------------------
create table public.bank_accounts (
  id            bigint generated always as identity primary key,
  bank_name     text not null,
  account_name  text,
  iban          text,
  currency      text not null default 'TRY' check (currency in ('USD','TRY','EUR')),
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.bank_accounts is 'Şirket banka hesapları. Ödeme kaydında hangi hesaba geldiği seçilir.';
create trigger bank_accounts_touch before update on public.bank_accounts for each row execute function public.touch_updated_at();
create trigger bank_accounts_audit after insert or update or delete on public.bank_accounts for each row execute function public.audit_trigger();
alter table public.bank_accounts enable row level security;
create policy bank_accounts_select on public.bank_accounts for select to authenticated using (public.is_active_user());
create policy bank_accounts_write  on public.bank_accounts for all to authenticated using (public.is_admin_or_owner()) with check (public.is_admin_or_owner());
revoke all on public.bank_accounts from anon;
grant select, insert, update, delete on public.bank_accounts to authenticated;

-- ---------------------------------------------------------------------
-- 3) payments GENİŞLETME
--    Mevcut: operation_id(not null), order_id, direction(gelen/giden),
--            kind, amount, currency, paid_at(date), note, deleted_*, created_*.
--    Eklenen: customer_id, exchange_rate, usd_rate, amount_try, amount_usd,
--             payment_method_id, bank_account_id, reference_no, is_advance.
--    operation_id → NULLABLE (genel ödeme de olabilir).
-- ---------------------------------------------------------------------
alter table public.payments
  add column customer_id       bigint references public.customers (id) on delete restrict,
  add column exchange_rate     numeric(14,6),          -- ödeme para birimi → TRY (ödeme günü kuru)
  add column usd_rate          numeric(14,6),          -- USD → TRY (USD karşılığı için)
  add column amount_try        numeric(14,2),
  add column amount_usd        numeric(14,2),
  add column payment_method_id bigint references public.payment_methods (id) on delete set null,
  add column bank_account_id   bigint references public.bank_accounts (id) on delete set null,
  add column reference_no      text,
  add column is_advance        boolean not null default false;

comment on column public.payments.exchange_rate is 'Ödeme para biriminin TRY karşılığı (ödeme günü kuru). Kayıtta donar.';
comment on column public.payments.is_advance is 'Ön ödeme mi (P5.3 ön ödeme kontrolü bunu sayar).';

-- Mevcut satırlar için customer_id'yi operasyondan doldur (varsa)
update public.payments p
set customer_id = o.customer_id
from public.operations o
where p.operation_id = o.id and p.customer_id is null;

-- Bundan sonra operation_id opsiyonel, customer zorunlu (yeni kayıtlarda). Mevcut
-- customer'ı doldurulamayan (operation_id null) satır yoktu; yine de güvenli sıra:
alter table public.payments alter column operation_id drop not null;
-- currency'yi cari hareketle uyumlu kısıtla
alter table public.payments add constraint payments_currency_chk check (currency in ('USD','TRY','EUR'));
create index payments_customer_idx on public.payments (customer_id, paid_at) where deleted_at is null;

-- ---------------------------------------------------------------------
-- 4) BEFORE trigger — kur/karşılık alanlarını doldur ve DONDUR.
--    exchange_rate verilmezse ödeme günü (rate_to_try) kuru; amount_try/usd hesaplanır.
-- ---------------------------------------------------------------------
create or replace function public.payments_fill_amounts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.exchange_rate is null then new.exchange_rate := public.rate_to_try(new.currency); end if;
  if new.usd_rate is null then new.usd_rate := public.rate_to_try('USD'); end if;
  if new.exchange_rate is null or new.exchange_rate <= 0 then
    raise exception 'Geçerli kur bulunamadı (%). Kur girin.', new.currency using errcode = 'check_violation';
  end if;
  if new.usd_rate is null or new.usd_rate <= 0 then
    raise exception 'USD kuru bulunamadı; USD karşılığı hesaplanamıyor.' using errcode = 'check_violation';
  end if;
  new.amount_try := round(new.amount * new.exchange_rate, 2);
  new.amount_usd := round(new.amount_try / new.usd_rate, 2);
  return new;
end; $$;
create trigger payments_fill before insert on public.payments
  for each row execute function public.payments_fill_amounts();

-- ---------------------------------------------------------------------
-- 5) AFTER trigger — ödeme (GELEN) → ALACAK hareketi; soft-delete → TERS KAYIT.
--    'giden' (tedarikçi) müşteri cari hesabına yazılmaz (yalnız gelen takip).
-- ---------------------------------------------------------------------
create or replace function public.payments_to_account()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_txn bigint; v_orig public.account_transactions;
begin
  if tg_op = 'INSERT' then
    if new.direction = 'gelen' and new.deleted_at is null and new.customer_id is not null then
      perform public.post_account_transaction(
        new.customer_id, 'alacak', 'odeme', new.amount, new.currency,
        new.id, new.operation_id, new.exchange_rate, new.usd_rate,
        new.paid_at::timestamptz,
        coalesce(nullif(new.note,''), 'Ödeme alındı'), null, new.created_by);
    end if;
    return new;
  end if;

  -- UPDATE: soft-delete edildiyse ilgili alacak hareketini ters kayıtla kapat
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
end; $$;
create trigger payments_account after insert or update on public.payments
  for each row execute function public.payments_to_account();

-- ---------------------------------------------------------------------
-- 6) order_paid_summary — bir siparişe alınan ön ödeme / toplam tahsilat özeti
--    (P5.3 ön ödeme kontrolü + sipariş kartı ödeme durumu için).
-- ---------------------------------------------------------------------
create or replace function public.order_paid_summary(p_order_id bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
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
grant execute on function public.order_paid_summary(bigint) to authenticated;
comment on function public.order_paid_summary is
  'Siparişe alınan tahsilat/ön ödeme özeti (USD bazında). Ön ödeme kontrolü ve sipariş kartı için.';
