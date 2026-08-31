-- =====================================================================
-- M1.2a — DÜZELTME: fabric_types.key grup bazında benzersiz olmalı
--
-- M1.1'de key küresel benzersiz tanımlandı. Yanlış: aynı kumaş adı birden fazla
-- gruba meşru biçimde ait olabiliyor — kaynak sistemde Polyester 4 grupta
-- (Astarlık/Döşemelik/Ev Tekstili/Perdelik), Kanvas ve Keten 3'er grupta geçiyor.
-- Küresel kısıt 169 kumaş tipinin 27'sinin girmesini engelliyordu.
--
-- Kaynak sistem (Studio) UNIQUE(group_id, name) kullanıyor; aynı kurala dönülüyor.
-- Tablo şu an BOŞ olduğundan veri kaybı riski yok.
-- =====================================================================

alter table public.fabric_types drop constraint if exists fabric_types_key_key;

create unique index if not exists fabric_types_group_key_uidx
  on public.fabric_types (group_id, key);

comment on column public.fabric_types.key is
  'Grup içinde benzersiz (küresel değil) — aynı kumaş adı farklı gruplarda geçebilir.';
