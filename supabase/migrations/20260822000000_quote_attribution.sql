-- Teklif atıfı: created_by + sent_at/sent_by tek noktadan trigger ile doldurulur.
-- Amaç: çalışan bazlı teklif raporu + yanıt süresi ölçümü için bugünden itibaren veri toplansın.
-- Karar notu: client insert'leri (useCreateQuote/useUploadQuoteFile/useGenerateDocument)
--   tek tek düzeltilmez; hepsi buradaki trigger'lardan geçtiği için tek noktadan kapatılır.
-- auth.uid() null olabilir (RPC/script/servis rolü) → trigger PATLAMAZ, ilgili kolon boş bırakılır.

-- 1) created_by: BEFORE INSERT'te değer verilmemişse auth.uid().
--    Mevcut quotes_before_insert fonksiyonuna eklenir (versiyon/durum/geçerlilik/KDV ile aynı yerde).
create or replace function public.quotes_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.version is null then
    select coalesce(max(version), 0) + 1 into new.version
      from public.quotes where operation_id = new.operation_id;   -- soft-deleted dahil: numara tekrar etmesin (boşluk arayüzde "vN (silindi)" gösterilir)
  end if;
  if new.status_id is null then
    select id into new.status_id from public.quote_statuses where is_default limit 1;
  end if;
  if new.valid_until is null then
    new.valid_until := current_date + public.quote_default_validity_days();
  end if;
  if new.tax_rate is null then
    new.tax_rate := public.quote_default_tax_rate();
  end if;
  if new.created_by is null then
    new.created_by := auth.uid();   -- null ise (RPC/script) boş kalır, sorun değil
  end if;
  return new;
end; $$;

-- 2) sent_at / sent_by: teklif DOSYASI ilk kez atandığında (dosya yükle veya belge üret) yazılır.
--    BEFORE INSERT OR UPDATE — dosya insert'te de gelebilir, sonradan UPDATE ile de eklenebilir.
--    Not: quotes_sync_operation_status'a KONMADI — o AFTER trigger olup operations'ı günceller;
--    teklifin kendi kolonunu yazmak için BEFORE trigger gerekir. sent_at doluysa dokunulmaz (idempotent).
create or replace function public.quotes_mark_sent()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.quote_file_id is not null and new.sent_at is null then
    new.sent_at := now();
    new.sent_by := auth.uid();   -- null ise (RPC/script) boş kalır
  end if;
  return new;
end; $$;

drop trigger if exists quotes_mark_sent on public.quotes;
create trigger quotes_mark_sent
  before insert or update of quote_file_id on public.quotes
  for each row execute function public.quotes_mark_sent();
