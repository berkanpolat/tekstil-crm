-- =====================================================================
-- P3.10 — Projeye özel iletişim + notlarda iç/dış ayrımı.
--   • interactions.operation_id (nullable): etkileşim hangi operasyonla ilgili.
--     Boş = genel görüşme. Operasyon ekranında yalnızca o op'unkiler; müşteri kartında hepsi.
--   • notes.is_internal (default true = güvenli taraf): iç not müşteriye/belgeye gitmez.
-- =====================================================================
alter table public.interactions
  add column operation_id bigint references public.operations (id) on delete set null;
create index interactions_operation_idx on public.interactions (operation_id) where operation_id is not null;
comment on column public.interactions.operation_id is
  'İlgili operasyon (nullable). Boş = genel görüşme. Operasyon ekranı bununla filtreler.';

alter table public.notes
  add column is_internal boolean not null default true;
comment on column public.notes.is_internal is
  'İç not mu? Varsayılan true (güvenli taraf). İç notlar müşteriye/belgeye gitmez; arayüzde işaretlenir.';
