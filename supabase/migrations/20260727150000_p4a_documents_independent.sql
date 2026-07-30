-- =====================================================================
-- P4A — Bağımsız belge üretimi. documents.operation_id NULLABLE olur; belge bir
-- talebe bağlı olmadan da üretilebilir (Belgeler menüsü "Yeni belge").
-- Sipariş-onay sert kapısı zaten operation_id = <op> ile filtreler → bağımsız
-- (operation_id null) belgeler kapıyı AÇMAZ. Ek değişiklik gerekmez.
-- =====================================================================
alter table public.documents alter column operation_id drop not null;
comment on column public.documents.operation_id is
  'Bağlı talep (nullable). Boş = bağımsız üretilen belge (Belgeler menüsünden). Sert kapı yalnızca dolu olanları sayar.';
