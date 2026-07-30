-- =====================================================================
-- P3.10 düzeltme — notes.entity_type 'operation' kapsamını da kabul etsin.
-- Operasyon ekranındaki notlar entity_type='operation' ile tutulur.
-- =====================================================================
alter table public.notes drop constraint notes_entity_type_check;
alter table public.notes add constraint notes_entity_type_check
  check (entity_type = any (array['lead','customer','operation']));
