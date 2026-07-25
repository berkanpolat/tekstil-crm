-- =====================================================================
-- P0.8 — Operasyon kodu üreteci
-- Her iş bir operasyon koduyla takip edilir (TAS-XXXXXX). Kod talepte doğar;
-- teklif, numune, sipariş ve belgeler aynı kodu taşır.
--
-- Alfabe karışan karakterleri (I, O, 0, 1) DIŞLAR — kod telefonda okunur,
-- kolide basılı olur. Önek ve uzunluk AYARDAN gelir (codes.operation_prefix,
-- codes.length). code_registry global benzersizdir: kodlar varlık tipleri
-- arasında asla tekrar etmez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- code_registry — üretilen tüm kodların tekil kaydı (eşzamanlılık kilidi)
-- ---------------------------------------------------------------------
create table public.code_registry (
  code        text primary key,
  entity_type text not null,
  entity_id   text,
  created_at  timestamptz not null default now()
);
create index code_registry_entity_idx on public.code_registry (entity_type, entity_id);

comment on table public.code_registry is
  'Üretilen operasyon kodlarının global tekil kaydı. code PK → varlık tipleri arası tekrar yok.';

alter table public.code_registry enable row level security;
create policy code_registry_select on public.code_registry
  for select to authenticated using (public.is_active_user());
-- insert yalnızca generate_operation_code (SECURITY DEFINER) ile; update/delete YOK.
revoke all on public.code_registry from anon;
grant select on public.code_registry to authenticated;

-- ---------------------------------------------------------------------
-- generate_operation_code(entity_type, entity_id) → text
-- Kod üretir, code_registry'ye insert dener, çakışırsa yeniden dener (max 10).
-- Unique constraint + retry → eşzamanlı çağrılarda çakışma olmaz.
-- ---------------------------------------------------------------------
create or replace function public.generate_operation_code(
  p_entity_type text,
  p_entity_id   text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- I,O,0,1 yok
  v_alpha_len constant int := length(v_alphabet);
  v_prefix text;
  v_length int;
  v_code   text;
  v_full   text;
  v_try    int := 0;
  i        int;
begin
  if p_entity_type is null or length(trim(p_entity_type)) = 0 then
    raise exception 'entity_type zorunludur.' using errcode = '22004';
  end if;

  -- Önek ve uzunluk ayardan (yoksa varsayılan)
  select value #>> '{}' into v_prefix from public.settings where key = 'codes.operation_prefix';
  v_prefix := coalesce(nullif(v_prefix, ''), 'TAS');
  select (value #>> '{}')::int into v_length from public.settings where key = 'codes.length';
  v_length := coalesce(v_length, 6);

  loop
    v_try := v_try + 1;

    v_code := '';
    for i in 1..v_length loop
      -- 1..v_alpha_len aralığında rastgele karakter
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * v_alpha_len)::int, 1);
    end loop;
    v_full := v_prefix || '-' || v_code;

    begin
      insert into public.code_registry (code, entity_type, entity_id)
      values (v_full, p_entity_type, p_entity_id);
      return v_full;                       -- çakışma yok → döndür
    exception when unique_violation then
      if v_try >= 10 then
        raise exception 'Operasyon kodu üretilemedi (10 denemede çakışma).'
          using errcode = 'P0001';
      end if;
      -- döngü tekrar dener
    end;
  end loop;
end;
$$;

comment on function public.generate_operation_code(text, text) is
  'Benzersiz operasyon kodu üretir (TAS-XXXXXX), code_registry''ye kaydeder. Eşzamanlı-güvenli.';

grant execute on function public.generate_operation_code(text, text) to authenticated;
