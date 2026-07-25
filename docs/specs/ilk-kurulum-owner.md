# İlk Kurulum — Owner Hesabını Oluşturma

> Faz 0 sonunda (veya yeni bir ortam kurulduğunda) sistemin İLK kullanıcısı
> (owner) bu adımla oluşturulur. Self-signup platform seviyesinde KAPALI olduğu
> için owner normal kayıt olamaz; `bootstrap-owner` Edge Function'ı ile kurulur.

## Ön koşullar

- Migration'lar uygulanmış olmalı (özellikle roller: `supabase db push`).
- `bootstrap-owner` fonksiyonu deploy edilmiş olmalı (`supabase functions deploy bootstrap-owner`).
- Panelde "Allow new users to sign up: KAPALI", "Confirm email: KAPALI"
  (bkz. [supabase-panel-ayarlari.md](supabase-panel-ayarlari.md)).

## BOOTSTRAP_SECRET nereden okunur

- Yerelde: proje kökündeki **`.env`** dosyasında `BOOTSTRAP_SECRET=...` satırı
  (git'e işlenmez).
- Supabase tarafında: `supabase secrets list` ile adı görülür (değeri panelde
  gizlidir). Değer yeniden üretilecekse: `openssl rand -hex 32` → hem `.env`'e
  hem `supabase secrets set BOOTSTRAP_SECRET=...` ile Supabase'e yazılır (ikisi
  AYNI olmalı).

## Owner'ı oluşturma (tek kullanımlık)

`bootstrap-owner` fonksiyonuna, gizli anahtarı `X-Bootstrap-Secret` header'ında
göndererek POST atın:

```bash
# .env'den değerleri oku
source <(grep -E '^(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY|BOOTSTRAP_SECRET)=' .env)

curl -s -X POST "$VITE_SUPABASE_URL/functions/v1/bootstrap-owner" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  -H "X-Bootstrap-Secret: $BOOTSTRAP_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@sirket.com","password":"GucluBirSifre1!","full_name":"Ad Soyad"}'
```

Başarılıysa `201 { "id": "<uuid>" }` döner. Owner otomatik olarak:
- `owner` rolünü alır,
- `must_change_password=false` (kendi şifresini belirledi) olur,
- e-postası onaylı gelir (hemen giriş yapabilir).

## Tek kullanımlık davranış

- `public.users` boş DEĞİLSE fonksiyon **403 "Sistem zaten kurulmuş"** döner.
  Yani owner bir kez kurulur; ikinci çağrı reddedilir.
- Yanlış (veya boş) `X-Bootstrap-Secret` → **403 "Yetkisiz"**.

## Sonrası

Owner giriş yaptıktan sonra diğer çalışanları arayüzden (veya `create-user`
Edge Function'ı ile) ekler; artık `bootstrap-owner`'a gerek yoktur.
