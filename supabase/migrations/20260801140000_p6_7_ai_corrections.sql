-- =====================================================================
-- P6.7 — Sipariş çıkarma geri bildirimi: kullanıcı hangi alanları DÜZELTTİ?
--   Modelin nerede zayıf olduğunu görmek için (Faz 7 analizi).
-- =====================================================================
alter table public.ai_requests add column if not exists corrected_fields text[];
comment on column public.ai_requests.corrected_fields is 'Kullanıcının modelden farklı girdiği alanlar (P6.7 — model zayıflığı analizi).';
