-- A9 — Belgeler listesi gerçek zamanlı. documents tablosunu supabase_realtime publication'a
-- ekler (RLS zaten select'i authenticated'a açıyor). Biri belge üretince/silince herkeste güncellenir.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documents'
  ) then
    alter publication supabase_realtime add table public.documents;
  end if;
end $$;
