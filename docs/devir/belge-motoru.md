# Belge Motoru — Cloudflare Worker + Browser Run

Belge/teklif PDF'lerini üreten servis. **Kendi sunucumuz yok**: Cloudflare'in yönettiği
Chromium (Browser Run) üzerinde çalışır, ücretsiz planda barınır.

## Neden böyle

Servis daha önce Fly.io'daydı ve **kapandı** — sürekli açık 1 GB makine ücretliydi,
kimse bakmıyordu. Aynı hata tekrarlanmasın diye ölçüt "en ucuz" değil, **"aylarca kimse
dokunmadan ayakta kalan"** oldu:

| Aday | Neden seçilmedi |
|---|---|
| Render ücretsiz | 512 MB / 0,1 CPU (Chromium 350–450 MB kullanıyor), 750 sa/ay tavanı, dokümanı "üretimde kullanmayın" diyor |
| Oracle Always Free | 7 günlük pencerede CPU %20'nin altındaysa makine **geri alınıyor**; günde birkaç belge üreten servis tanım gereği boşta → Fly'daki ölümün tekrarı |
| Kendi VPS'imiz (~€4/ay) | Çalışır ve yedek plan olarak duruyor (`services/pdf-renderer/Dockerfile` platform bağımsız), ama işletim sistemi/sertifika/güncelleme bakımı getiriyor |
| **Cloudflare Browser Run** | **Seçilen.** Sunucu yok, sertifika yok, güncelleme yok. Ücretsiz planda günde 10 dk tarayıcı süresi ≈ **150 belge/gün**. Limit aşımında fatura değil `429` gelir. |

Maliyet eğrisi: günde 150 belgeye kadar **0 $**. Üstünde Workers Paid (5 $/ay, 10 sa dahil),
sonra saat başı 0,09 $ — günde 1.000 belge ≈ 7 $/ay. Belge başına marjinal maliyet ~0,0001 $.

## Mimari

```
Tarayıcı (CRM)
  ├─ Önizleme  → gizli sandbox'lı iframe (public/belge-sablonu.html)   ⟵ AĞ YOK
  └─ PDF üret  → Worker /render → Browser Run (Chromium) → PDF bayt
                                    ↓
                          Storage + documents kaydı (CRM yapar)
```

**Önizleme bilerek Worker'a gitmez.** Editör her tuş vuruşunda önizleme ister; bunu
Browser Run'a bağlamak günlük tarayıcı bütçesini dakikalar içinde bitirirdi. Önizleme
kullanıcının kendi tarayıcısında üretilir — ağ maliyeti ve gecikme sıfır.

## Şablon: tek kaynak, üç tüketici

Belge tasarımı `services/pdf-renderer/templates/studio.html` (orijinal studyo uygulaması)
ve belge kurma mantığı `services/pdf-renderer/render.mjs` içindedir. **Kopyalanmaz**,
`scripts/sablon-hazirla.mjs` ile türetilir:

| Çıktı | Kim kullanır |
|---|---|
| `services/pdf-worker/public/studio.html` | Worker (bundle'a metin olarak gömülür) |
| `public/belge-sablonu.html` | CRM önizlemesi (buildDoc + renderPreview + EN_PAIRS gömülü) |
| `services/pdf-worker/src/belge.js` | Worker (`scripts/render-portla.mjs` ile üretilir) |

`npm run build` öncesi `prebuild` bunları **her zaman yeniden üretir** — şablon elden
değiştirilip yeniden üretilmezse önizleme ile PDF sessizce ayrışırdı.

### Hermetik şablon

Hazırlama sırasında dış `<script>`/`<link>` etiketleri sökülür (JsBarcode gömülür,
supabase-js ve Google Fonts atılır — fontlar zaten base64 gömülü) ve sıkı bir CSP eklenir:

```
default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline';
font-src data:; img-src data: https:; connect-src 'none'
```

Sonuç: belge üretilirken sayfa **hiçbir ağ isteği yapamaz** (studyo Supabase projesi,
TCMB proxy'leri, bulut metadata adresleri dahil). `unsafe-eval` zorunludur — durum
değişkenleri `window.eval` ile yazılır, bkz. `docs/specs/pdf-servisi-lexical-state.md`.

## Güvenlik

- **Kimlik: kullanıcının Supabase oturumu.** Worker jetonu Supabase'e sorar
  (`/auth/v1/user`) — imza, süre ve **iptal** tek adımda doğrulanır. Önyüz derlemesine
  gömülen paylaşılan sır YOK (eski `x-pdf-secret` böyleydi ve pratikte hiç gönderilmiyordu).
- **İzolasyon mimariden gelir:** her istek kendi tarayıcısında çalışır ve kapatılır.
  Node servisinde sıcak sayfa paylaşılıyordu; enjekte edilen bir betik sonraki belgeleri
  okuyabiliyordu (SAST 1 Eyl 2026).
- **Önizleme iframe'i `sandbox="allow-scripts"`**, `allow-same-origin` VERİLMEZ → opak
  origin. Şablondaki kaçışsız alanlar (`rapor.bodyHtml`, `maliyet.image`, `tkS.foto`)
  üzerinden enjekte edilen betik CRM'in localStorage'ına (Supabase JWT'si) erişemez.
- **CORS** yalnız `CORS_ORIGIN` (varsayılan `https://crm.tekstilas.com`).

## Uçlar

| Uç | Ne yapar |
|---|---|
| `POST /render` | `{template, data, language}` → PDF bayt. **Kimlik ister.** |
| `GET /rates` | TCMB günlük döviz satış (Cache API'de gün boyu) |
| `GET /rate-on-date?date=YYYY-MM-DD` | Geçmiş tarihli kur; hafta sonu/tatilde en yakın önceki bültene yürür |
| `GET /health` | Durum |

`/preview` **yoktur** — bilerek (yukarıya bkz.).

## Dağıtım

```bash
cd services/pdf-worker
npm install
npx wrangler login          # TEK etkileşimli adım
npx wrangler deploy
```

Ardından Worker adresini CRM'e tanıt ve yayınla:

```bash
# .env → VITE_PDF_SERVICE_URL=https://tekstil-belge-motoru.white-bird-ce69.workers.dev
bash scripts/release.sh     # VITE_ değişkeni DERLEME anında gömülür
```

⚠️ `VITE_PDF_SERVICE_URL` boşken arayüz "PDF üret"i kapalı gösterir ama **önizleme
çalışmaya devam eder** — önizlemenin motora bağımlılığı yoktur.

## Doğrulama

```bash
cd services/pdf-worker
npm run hazirla                                   # şablon + belge.js üret
cd ../pdf-renderer && node ../pdf-worker/scripts/sablon-dogrula.mjs
cd ../pdf-worker   && node scripts/onizleme-dogrula.mjs
```

- `sablon-dogrula.mjs` — hermetik şablon, **ağ tamamen kapalıyken**, orijinalle birebir
  aynı HTML üretiyor mu (9 senaryo, 8 belge tipi + EN). Barkodların eşleşmesi gömülü
  JsBarcode'un çalıştığını da kanıtlar. Ayrıca gerçek PDF üretip boyutunu doğrular.
- `onizleme-dogrula.mjs` — tarayıcıdaki köprü (sandbox'lı iframe + postMessage)
  sunucudaki `renderPreview` ile aynı HTML'i mi veriyor. "Gördüğün = çıkan" güvencesi.

Senaryolar `scripts/senaryolar.mjs` içinde ve şekilleri CRM'in gerçekten gönderdiğiyle
birebir (`src/pages/documents/editorForms.tsx`).

## Kotayı aşarsak

Browser Run `429` döndürür; Worker bunu `{error:'kota_doldu'}` olarak ayırır ve arayüz
"Günlük belge üretim kotası doldu" der. Fatura gelmez. Kalıcı çözüm Workers Paid (5 $/ay).

## Eski servis

`services/pdf-renderer/` (Node + Playwright) **kaynak olarak duruyor** ve iki işi var:
şablon/kod üretiminin kaynağı, ve Cloudflare'den çıkmak gerekirse hazır Docker imajı.
Yerelde çalıştırmak için `node server.mjs` (PDF_SECRET gerektirir).
