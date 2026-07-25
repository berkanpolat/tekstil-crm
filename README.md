# Tekstil A.Ş. CRM

Tekstil A.Ş. için sıfırdan kurulan CRM. Müşterilerin fotoğraf/fikirlerinden hazır
giyim üretim sürecini uçtan uca yönetir. Üç eski uygulamanın (potansiyel/mesajlaşma,
belge/fiyatlandırma, süreç takibi) yerini alır.

> **Durum:** Faz 0 — Temel altyapı. İş modülleri sonraki fazlarda gelecek.

## Teknoloji

Vite · React 19 · TypeScript (strict) · Tailwind 4 · shadcn/ui · TanStack Query v5 ·
React Router v7 · Supabase (Postgres + Auth + Storage + Edge Functions) ·
Vitest · Playwright · pnpm

## Gereksinimler

- Node ≥ 20 (bu makinede 24)
- pnpm ≥ 10
- Supabase CLI (migration ve tip üretimi için)

## Kurulum

```bash
pnpm install
cp .env.example .env      # değerleri doldurun (bkz. Ortam değişkenleri)
pnpm dev                  # http://localhost:5173
```

## Komutlar

| Komut | İş |
|---|---|
| `pnpm dev` | Geliştirme sunucusu |
| `pnpm build` | Üretim derlemesi (`tsc -b && vite build`) |
| `pnpm typecheck` | Tip denetimi |
| `pnpm lint` / `pnpm lint:fix` | ESLint |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm test` / `pnpm test:watch` | Birim + entegrasyon (Vitest) |
| `pnpm test:e2e` | Uçtan uca (Playwright) |
| `pnpm db:link` | Supabase cloud projesine bağlan |
| `pnpm db:push` | Migration'ları veritabanına uygula |
| `pnpm db:diff` | Şema farkı üret |

E2E ilk çalıştırmadan önce: `pnpm exec playwright install`.

## Ortam değişkenleri

`.env.example` dosyasını `.env` olarak kopyalayıp doldurun. İstemciye gömülen
değerler `VITE_` öneklidir ve yalnızca public olmalıdır (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`). `SUPABASE_DB_PASSWORD` ve `SUPABASE_SERVICE_ROLE_KEY`
gizlidir, tarayıcıya asla gömülmez.

## Veritabanı / migration'lar

Şemanın tek doğruluk kaynağı `supabase/migrations/` altındaki sıralı SQL
dosyalarıdır (`YYYYMMDDHHMMSS_aciklama.sql`).

```bash
supabase link --project-ref <proje-ref>   # bir kez
pnpm db:push                               # migration'ları uygula
```

## Proje yapısı

```
src/pages · src/components/{ui,layout,shared} · src/hooks · src/lib
supabase/{migrations,functions}
tests/{unit,integration,e2e}
docs/{plans,specs}   # her paket için: neden (plans) + ne (specs)
```

## Dokümantasyon

Her çalışma paketinin bir **plan** (neden böyle yapıldı) ve bir **spec** (ne yapıldı)
dosyası vardır: `docs/plans/` ve `docs/specs/`. Bir kararın gerekçesi arandığında
bakılacak yer burasıdır.
