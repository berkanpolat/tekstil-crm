# PDF Servisi — Dağıtım (Fly.io · Frankfurt)

Belge motoru PDF servisi (`services/pdf-renderer/`) Fly.io'da **fra** (Frankfurt)
bölgesinde barındırılır — Supabase projesi de Frankfurt'ta, ağ gecikmesi minimum.

## Ne yapar

Node + Playwright (Chromium). Orijinal studyo şablonlarını (`templates/studio.html`)
sarmalayıp birebir PDF üretir. Tek Chromium örneği sıcak tutulur (2 sn hedefi).
`POST /render {template, data, language}` → PDF bytes. `GET /health` → durum.

## Ön koşullar

- Fly hesabı + `flyctl` CLI (`brew install flyctl`), `fly auth login`.
- Bellek: Chromium ~350–450 MB (yerel ölçüm). **1 GB** ayrıldı (512 MB dar kalır).

## İlk dağıtım

```bash
cd services/pdf-renderer

# Uygulamayı oluştur (fly.toml zaten hazır — --no-deploy ile önce sadece kaydet)
fly launch --no-deploy --copy-config --name tekstil-pdf-renderer --region fra

# Gizli anahtarlar (istemci gövdesi X-Intake-Secret gibi; PDF için paylaşılan sır)
fly secrets set PDF_SECRET="$(openssl rand -hex 24)"
# CORS origin fly.toml'da tanımlı (app.tekstilas.com); farklıysa:
# fly secrets set PDF_CORS_ORIGIN="https://<uygulama-alan-adı>"

# Dağıt
fly deploy
```

## Güncelleme

```bash
cd services/pdf-renderer
fly deploy
```

Şablon (`studio.html`) güncellenirse: önce yerelde beş belgeyi örnek PDF'lerle
karşılaştır (birebir), açılış self-check'inin geçtiğini gör (bkz.
`docs/specs/pdf-servisi-lexical-state.md`), sonra deploy et.

## Yapılandırma (fly.toml)

- `primary_region = "fra"` — Supabase ile aynı bölge.
- `auto_stop_machines = false`, `min_machines_running = 1` — **always-on**, soğuk
  başlatma yok (belge üretimi anlık).
- Sağlık kontrolü: `GET /health`, 15 sn aralık.
- `[[vm]] memory = "1gb"`.

## İzleme

```bash
fly status                 # makine durumu
fly logs                   # canlı log (render hataları, boot self-check)
fly checks list            # sağlık kontrolü geçmişi
fly dashboard              # metrikler (CPU/RAM/istek)
```

- Boot logunda **"Chromium sıcak, studio.html yüklendi"** görülmeli.
- Self-check hata verirse (durum değişkeni erişilemiyor) servis boot OLMAZ —
  loglarda açık hata çıkar; şablon adları değişmiştir.

## Uygulamayı bağlama

Ana React uygulaması bu servise `VITE_PDF_SERVICE_URL` ile ulaşır:

```
VITE_PDF_SERVICE_URL=https://tekstil-pdf-renderer.fly.dev
```

(Bkz. `docs/devir/uygulama-dagitimi.md`.) CORS için servis `PDF_CORS_ORIGIN`
uygulama alan adına ayarlı olmalı.

## Taşınabilirlik

`Dockerfile` düzdür (platform-bağımsız). Başka bir yere taşımak (Railway/Render/
kendi sunucu) gerekirse **yalnızca `fly.toml`** değişir; Dockerfile ve kod aynı kalır.
