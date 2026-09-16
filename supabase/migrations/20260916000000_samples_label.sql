-- Paket B · madde 3d — Numune adlandırma
-- Numuneler listede yalnız "N1 / N2 …" ile görünüyor, ayırt edilemiyor.
-- Kısa "Ad / Etiket" alanı eklenir. description (detay) AYRI kalır.
--
-- Kolon: label text, NULLABLE (zorunlu değil; eski kayıtlar boş kalır → UI yalnız N{version} gösterir).
-- Index: GEREKMİYOR — label yalnız gösterim amaçlı; filtre/sıralama/join yok.
--
-- UYGULAMA NOTU: Bu migration ELLE uygulanacak (kullanıcı uygular). Uygulanana kadar
-- frontend'e label alanı BAĞLANMAZ (aksi halde PGRST42703 "column does not exist" verir).

alter table public.samples
  add column if not exists label text;

comment on column public.samples.label is
  'Numune kısa adı/etiketi (ayırt etmek için; description = detay). Boşsa UI yalnız N{version} gösterir.';

-- PostgREST şema önbelleğini yenile (yoksa yeni kolon API''de görünmez → PGRST200/42703).
notify pgrst, 'reload schema';
