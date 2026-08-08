# PDF Renderer Servisi

Playwright/Chromium tabanlı belge motoru. Port: **4046**.

## Başlatma

```bash
cd services/pdf-renderer
pnpm install
npx playwright install chromium   # ilk kurulumda
node server.mjs                   # arka plan için: node server.mjs &
```

## Doğrulama

```bash
curl http://localhost:4046/health
# → {"ok":true,"warm":true}
```

## .env

```
VITE_PDF_SERVICE_URL=http://localhost:4046
```

Servis kapalıyken belge üretimi devre dışı kalır (`hasPdfService=false`).
