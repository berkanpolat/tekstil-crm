-- ============================================================================
-- GÜVENLİK 3/4 — Sert kapılar artık INSERT'i de kapsıyor
--
-- SAST kök neden G: quotes/samples/operations "hard gate" trigger'larının üçü de
-- yalnız `BEFORE UPDATE` idi. Canlıda doğrulandı (1 Eyl 2026). Sonuç: kural
-- yalnız mevcut satırı DEĞİŞTİRİRKEN uygulanıyordu; doğrudan INSERT ile
--   • kalemi olmayan ama "gönderilmiş" teklif,
--   • gerekçesiz "reddedildi" teklif/numune,
--   • gerekçesiz iptal edilmiş operasyon
-- yaratmak serbestti. PostgREST istemciye doğrudan INSERT verdiği için bu
-- teorik değil, tek HTTP isteğiyle yapılabilir bir baypastı.
--
-- ⚠️ KAPSAM NOTU — durum makinesi bu migration'da ZORLANMIYOR.
-- `status_transitions` tablosunu okuyan fonksiyon sayısı sıfır (SAST bulgusu),
-- ancak tabloyu şimdi zorlamak ÜRETİMİ KIRARDI: tabloda 9 satır var ve
-- `teklif_reddedildi` aşamasına giden HİÇBİR geçiş tanımlı değil — oysa canlıdaki
-- 461 operasyonun 151'i tam da o aşamada (tablo, o aşamayı ekleyen
-- 20260816000000 migration'ından eski). Geçiş tablosu önce tamamlanmalı; bu bir
-- ürün kararı olduğu için ayrı ele alınacak.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Teklifler
--
-- INSERT'te `sent_at` dolu olamaz: teklif henüz kalem alamamış olduğu için
-- "kalemsiz gönderilmiş teklif" tam olarak bu yoldan doğuyordu. Uygulama zaten
-- teklifi yalnız `operation_id` (ve gerekiyorsa `quote_file_id`) ile oluşturur
-- (useQuotes.ts:173, 311) — meşru akış etkilenmez.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.quotes_hard_gate()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare v_new_key text; v_cnt int;
begin
  if tg_op = 'INSERT' then
    if new.sent_at is not null then
      raise exception 'Teklif "gönderilmiş" olarak oluşturulamaz. Önce kalemleri ekleyin, sonra gönderin.'
        using errcode = 'check_violation';
    end if;
    select key into v_new_key from public.quote_statuses where id = new.status_id;
    if v_new_key = 'reddedildi' and new.rejection_reason_id is null and coalesce(btrim(new.rejection_note),'') = '' then
      raise exception 'Teklif reddi gerekçesiz kaydedilemez (neden ya da not girin).' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- UPDATE (mevcut davranış korunuyor)
  if new.sent_at is not null and old.sent_at is null then
    select count(*) into v_cnt from public.quote_items where quote_id = new.id and deleted_at is null;
    if v_cnt = 0 then
      raise exception 'Kalemi olmayan teklif gönderilemez. Önce en az bir kalem ekleyin.' using errcode = 'check_violation';
    end if;
  end if;
  if new.status_id is distinct from old.status_id then
    select key into v_new_key from public.quote_statuses where id = new.status_id;
    if v_new_key = 'reddedildi' and new.rejection_reason_id is null and coalesce(btrim(new.rejection_note),'') = '' then
      raise exception 'Teklif reddi gerekçesiz kaydedilemez (neden ya da not girin).' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists quotes_hard_gate on public.quotes;
create trigger quotes_hard_gate
  before insert or update on public.quotes
  for each row execute function public.quotes_hard_gate();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Numuneler
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.samples_hard_gate()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare v_new_key text;
begin
  if tg_op = 'INSERT' then
    select key into v_new_key from public.sample_statuses where id = new.status_id;
    if v_new_key = 'reddedildi' and coalesce(btrim(new.rejection_reason),'') = '' then
      raise exception 'Numune reddi gerekçesiz kaydedilemez (red nedeni girin).' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.status_id is distinct from old.status_id then
    select key into v_new_key from public.sample_statuses where id = new.status_id;
    if v_new_key = 'reddedildi' and coalesce(btrim(new.rejection_reason),'') = '' then
      raise exception 'Numune reddi gerekçesiz kaydedilemez (red nedeni girin).' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists samples_hard_gate on public.samples;
create trigger samples_hard_gate
  before insert or update on public.samples
  for each row execute function public.samples_hard_gate();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Operasyonlar
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.operations_hard_gate()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.cancelled_at is not null
       and new.cancellation_reason_id is null and coalesce(btrim(new.cancellation_note),'') = '' then
      raise exception 'Operasyon iptali gerekçesiz kaydedilemez (iptal nedeni ya da not girin).'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.cancelled_at is not null and old.cancelled_at is null
     and new.cancellation_reason_id is null and coalesce(btrim(new.cancellation_note),'') = '' then
    raise exception 'Operasyon iptali gerekçesiz kaydedilemez (iptal nedeni ya da not girin).'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists operations_hard_gate on public.operations;
create trigger operations_hard_gate
  before insert or update on public.operations
  for each row execute function public.operations_hard_gate();

-- ============================================================================
-- GERİ ALMA:
--   ...üç fonksiyonun eski gövdesi ~/tekstil-crm-yedekler/ altında
--      (geri_donus_fonksiyonlar_*.sql) ve git geçmişinde; trigger'ları
--      `before update` olarak yeniden kurun.
-- ============================================================================
