# Netlify Test Dağıtımı — Adım Adım

Bu doküman, Tekstil CRM arayüzünün **statik test dağıtımını** Netlify'a yüklemeyi anlatır.
Backend (Supabase) zaten canlı; Netlify yalnız derlenmiş arayüzü (SPA) servis eder.

> Hazır paket: **`tekstil-crm-netlify.zip`** (proje kökünde, ~610 KB). İçinde
> `index.html`, `_redirects`, `assets/`, `favicon.svg`, `sounds/` var.

---

## 1. Üretim derlemesi ve zip (HAZIR)

Zaten üretildi:

```bash
pnpm build                       # → dist/  (tsc + vite build)
cd dist && zip -rq ../tekstil-crm-netlify.zip . && cd ..
```

- `dist/index.html`, hash'li `assets/*.js|css`, fontlar, `_redirects`.
- Yeniden üretmek istersen: `pnpm build` → `dist/` klasörünü kullan.

## 2. SPA yönlendirmesi — `_redirects` (HAZIR)

React Router istemci-taraflı; kullanıcı `/raporlar` gibi bir adrese doğrudan girince
Netlify o dosyayı arar ve 404 verir. Bunu önlemek için `public/_redirects` eklendi
(derlemede `dist/`'e kopyalanır):

```
/*  /index.html  200
```

Tüm yolları `index.html`'e **200** (rewrite, redirect değil) ile yönlendirir; router devralır.

## 3. Ortam değişkenleri — derlemeye GÖMÜLÜ

**Önemli:** Vite, `VITE_` önekli değişkenleri **derleme anında** koda gömer. Bu zip
`pnpm build` sırasında yerel `.env`'den okunarak üretildi; yani:

| Değişken | Durum |
|---|---|
| `VITE_SUPABASE_URL` | ✅ zip'e **gömülü** (bundle'da doğrulandı) |
| `VITE_SUPABASE_ANON_KEY` | ✅ zip'e **gömülü** |
| `VITE_PDF_SERVICE_URL` | ⛔ tanımsız → üretimde boş → belge servisi kapalı (bkz. §5) |

- **Zip yükleyerek (drag-drop) dağıtıyorsan:** değişkenler zaten paketin içinde;
  **Netlify panelinden bir şey girmene gerek yok.**
- **Netlify'ı Git'e bağlayıp orada derletirsen:** değişkenleri panelde tanımla —
  **Site settings → Environment variables** → aynı isimlerle:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - (opsiyonel) `VITE_PDF_SERVICE_URL` — PDF servisin varsa
  Build command: `pnpm build` · Publish directory: `dist`

> **Güvenlik notu:** `ANON_KEY` **herkese açık** anahtardır (RLS ile korunur); istemciye
> gömülmesi normaldir ve güvenlidir. `SERVICE_ROLE_KEY` **asla** arayüze konmaz —
> zaten `.env`'de var ama `VITE_` öneki yok, bundle'a girmez.

## 4. CORS / Supabase erişim listesi

- **REST · Realtime · Storage:** Supabase bu uçlarda CORS'u tüm origin'lere açık tutar —
  **Netlify adresini bir yere eklemene GEREK YOK.**
- **Edge Functions** (ai-assist, intake): `Access-Control-Allow-Origin: *` —
  **allow-list gerekmez.**
- **Auth (TEK gerekli ayar):** Şifre sıfırlama ve e-posta bağlantılarının doğru adrese
  dönmesi için Netlify URL'ini ekle:
  **Supabase panosu → Authentication → URL Configuration**
  - **Site URL:** `https://<site-adınız>.netlify.app`
  - **Redirect URLs:** `https://<site-adınız>.netlify.app/**`
  (Şifremi-unuttum → `/sifre-degistir` akışı bu olmadan tamamlanmaz.)

## 5. PDF / belge servisi bu ortamda yok

Netlify statik ortamında belge motoru (PDF servisi) çalışmaz. Sessiz hata yerine
kullanıcıya net bilgi verilir:

- `VITE_PDF_SERVICE_URL` tanımsızsa `hasPdfService = false` olur (`src/lib/env.ts`).
- **Belge editörü:** "Üret ve indir" düğmesi **pasif**; üstte sarı şerit:
  *"Belge servisi bu ortamda kullanılamıyor. Formu doldurabilir ve kaydedebilirsiniz;
  PDF üretimi için belge servisi bağlanmalı."* Önizleme panosu da aynı mesajı gösterir.
- **Maliyet belgesi / Cari ekstre:** düğmeye basınca **"Belge servisi bu ortamda
  kullanılamıyor."** toast'ı — hata yığını değil.

> Belge üretimini de test etmek istersen PDF servisini bir yere dağıtıp
> `VITE_PDF_SERVICE_URL`'i ver ve yeniden derle.

---

## Yükleme — iki yol

### A) Sürükle-bırak (en hızlı, panel env gerekmez)

1. https://app.netlify.com → **Add new site → Deploy manually**.
2. **`dist/` klasörünü** (veya zip'i açıp içeriğini) sürükle-bırak alanına bırak.
   - Zip'i doğrudan bırakırsan Netlify açar; ya da `dist/` içeriğini bırak.
3. Site yayınlanır: `https://<rastgele-ad>.netlify.app`.
4. **§4'teki Auth URL ayarını** yap (şifre sıfırlama için).
5. Aç, `ui.test@tekstilas.com` veya kendi hesabınla giriş yap.

### B) Netlify CLI (opsiyonel)

```bash
npm i -g netlify-cli
netlify deploy --dir=dist            # önizleme (draft) URL
netlify deploy --dir=dist --prod     # üretim URL
```

---

## Yükleme sonrası hızlı kontrol

- [ ] Giriş çalışıyor (Supabase'e bağlanıyor).
- [ ] `/raporlar`'a **doğrudan** gidince 404 yok (→ `_redirects` çalışıyor).
- [ ] Gösterge paneli + raporlar açılıyor (veri boş — demo temizlendi; bu normal).
- [ ] Belge editöründe "Üret ve indir" pasif + sarı şerit görünüyor.
- [ ] Şifre sıfırlama e-postası Netlify adresine dönüyor (Auth URL ayarı yapıldıysa).

## Bilinen sınırlar (test ortamı)

- PDF/belge üretimi kapalı (§5).
- YZ rapor yorumu: `ai-assist` edge fn'i `rapor_yorumu` promptuyla **yeniden deploy
  edilene** kadar kart sessizce gizli.
- JS bundle ~1.35 MB (gzip ~367 KB) — tek parça; test için sorun değil, ileride
  kod bölme (code-splitting) düşünülebilir.
