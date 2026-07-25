# Supabase Panel — Elle Yapılan Ayarlar Kontrol Listesi

> Migration'lar ve `config.toml` çoğu şeyi kaplar, AMA bazı ayarlar Supabase
> panelinden (Dashboard) elle yapılır ve koda yansımaz. Yeni bir ortam kurarken
> veya projeyi taşırken bu liste tekrarlanmalıdır. Faz 0 boyunca güncel tutulur.

Proje: **CRM** (`kkxvoxeqfsaqzklrtgrw`)

## Authentication

- [ ] **Confirm email: KAPALI**
  `Authentication → Sign In / Providers → Email → "Confirm email" OFF`.
  Gerekçe: Bu iç araçta çalışan hesaplarını yönetici açar ve şifreyi yönetici
  belirler; kullanıcı kendi e-postasını doğrulamaz. `create-user`/`bootstrap-owner`
  zaten `email_confirm: true` kullanır. **Kalıcı karar** (geçici test ayarı değil).

- [ ] **Allow new users to sign up: KAPALI**
  `Authentication → Sign In / Providers → "Allow new users to sign up" OFF`.
  Gerekçe: Birincil kayıt kilidi. Kapalıyken hiç kimse self-signup yapamaz;
  kullanıcılar yalnızca admin API ile (`bootstrap-owner`, `create-user`) oluşur.
  Trigger'daki kilit yalnızca yedek katmandır. (Bkz.
  [gotrue-app-metadata-zamanlamasi.md](gotrue-app-metadata-zamanlamasi.md).)

## Edge Function Secrets

Migration'a girmeyen, panelden/CLI'den set edilen gizli değerler
(`supabase secrets set NAME=...`):

- [ ] **BOOTSTRAP_SECRET** — `bootstrap-owner` fonksiyonunun `X-Bootstrap-Secret`
  header'ıyla eşleştirdiği gizli anahtar. Rastgele üretilir. Yerelde `.env`'de
  (gitignore'lu) tutulur, Supabase secrets'a `supabase secrets set` ile konur.
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` Supabase
  tarafından otomatik enjekte edilir — elle set edilmez.

## Notlar

- Bu liste Faz 0 ilerledikçe genişleyecek (Storage, SMTP, custom domain vb.).
- Owner'ı ilk kez kurmak için: `bootstrap-owner` fonksiyonunu `X-Bootstrap-Secret`
  ile bir kez çağır (bkz. README / e2e betiği).
