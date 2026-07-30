-- =====================================================================
-- P1 — Veritabanı normalizasyonu + referans varsayılanları
-- Normalizasyon İSTEMCİDE DEĞİL veritabanında olmalı: içe aktarma, edge function
-- ve TekLead göçü istemciden geçmez; oralarda alan boş kalırsa mükerrer tespiti
-- ve arama sessizce bozulur. Bu yüzden IMMUTABLE fonksiyonlar + generated/trigger.
-- =====================================================================

-- ---------------------------------------------------------------------
-- normalize_tr(text) — Türkçe-duyarlı katlama. Postgres lower()'a GÜVENMEZ
-- (lower('İSTANBUL') birleşik nokta üretir). Önce Türkçe→ASCII katla, sonra lower,
-- sonra noktalama/boşluk temizle. Arama ve mükerrer tespitinin temeli.
-- ---------------------------------------------------------------------
create or replace function public.normalize_tr(input text)
returns text
language sql
immutable
as $$
  -- ß tek→iki karakter olduğundan translate ile olmaz; önce replace ile 'ss'.
  -- Türkçe + Avrupa aksanları ASCII'ye katlanır (ihracat müşterileri için).
  select nullif(
    trim(
      regexp_replace(
        lower(translate(
          replace(input, 'ß', 'ss'),
          'İIıŞşĞğÜüÖöÇç' || 'äÄëËïÏéÉèÈêÊàÀáÁâÂñÑåÅøØíÍóÓúÚýÝ',
          'iiissgguuoocc' || 'aaeeiieeeeeeaaaaaannaaooiioouuyy'
        )),
        '[^a-z0-9]+', ' ', 'g'
      )
    ),
    ''
  );
$$;
comment on function public.normalize_tr(text) is
  'Türkçe-duyarlı normalize (İ/I/ı→i, Ş→s, Ğ→g, Ü→u, Ö→o, Ç→c; lower; noktalama/boşluk temizle).';

-- ---------------------------------------------------------------------
-- normalize_contact_value(type, value) — tip bazlı (phone.ts ile aynı mantık).
-- ---------------------------------------------------------------------
create or replace function public.normalize_contact_value(p_type text, p_value text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
  digits text;
begin
  if p_value is null then return null; end if;
  s := trim(p_value);
  if s = '' then return null; end if;

  if p_type in ('phone', 'whatsapp') then
    digits := regexp_replace(s, '\D', '', 'g');
    if digits = '' then return null; end if;
    if left(s, 1) <> '+' and left(digits, 2) = '00' then
      return '+' || substr(digits, 3);
    end if;
    if left(s, 1) = '+' then return '+' || digits; end if;
    if length(digits) = 12 and left(digits, 2) = '90' then return '+' || digits; end if;
    if length(digits) = 11 and left(digits, 1) = '0' then return '+90' || substr(digits, 2); end if;
    if length(digits) = 10 then return '+90' || digits; end if;
    if length(digits) between 8 and 15 then return '+' || digits; end if;
    return null;
  elsif p_type = 'email' then
    s := lower(s);
    if s !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return null; end if;
    return s;
  elsif p_type in ('instagram', 'telegram') then
    return nullif(regexp_replace(lower(s), '^@+', ''), '');
  elsif p_type = 'website' then
    return nullif(regexp_replace(regexp_replace(lower(s), '^https?://', ''), '/+$', ''), '');
  else
    return nullif(lower(s), '');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- contact_points.value_normalized: her yazımda DB hesaplar (istemciye güvenme).
-- ---------------------------------------------------------------------
create or replace function public.contact_points_normalize()
returns trigger
language plpgsql
as $$
begin
  new.value_normalized := public.normalize_contact_value(new.type, new.value);
  return new;
end;
$$;

create trigger contact_points_normalize_trg
  before insert or update on public.contact_points
  for each row execute function public.contact_points_normalize();

-- Mevcut (varsa) kayıtları normalize et.
update public.contact_points
set value_normalized = public.normalize_contact_value(type, value)
where value_normalized is distinct from public.normalize_contact_value(type, value);

-- ---------------------------------------------------------------------
-- lead_statuses.is_default — varsayılan durum (aynı anda tek). leads insert'te
-- status_id null gelirse bu atanır (içe aktarma/göç/edge durumu bilmek zorunda değil).
-- Aynı desen ileride customer_types vb. için de kullanılacak.
-- ---------------------------------------------------------------------
alter table public.lead_statuses add column is_default boolean not null default false;
create unique index lead_statuses_single_default on public.lead_statuses (is_default) where is_default;
update public.lead_statuses set is_default = true where key = 'yeni';
