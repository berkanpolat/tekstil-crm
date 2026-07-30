# Ana Uygulama — Dağıtım (Hostingdünyam · cPanel paylaşımlı Linux)

React (Vite) SPA statik olarak derlenir ve cPanel'deki `public_html`'e yüklenir.
Sunucu tarafı yok; tüm veri Supabase'e (remote) ve belge üretimi PDF servisine
(Fly.io) tarayıcıdan gider.

## 1. Ortam değişkenleri (build zamanı)

Vite değişkenleri **derleme anında** gömülür. Yayın öncesi `.env.production`
(veya CI ortamı):

```
VITE_SUPABASE_URL=https://kkxvoxeqfsaqzklrtgrw.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_PDF_SERVICE_URL=https://tekstil-pdf-renderer.fly.dev
```

> Yalnızca **public** değerler (anon key, servis URL'i). Service-role anahtarı,
> PDF_SECRET vb. ASLA frontend build'ine girmez.

## 2. Derleme

```bash
pnpm install
pnpm build          # → dist/
```

`dist/` içeriği (index.html + assets) yüklenecek statik çıktıdır.

## 3. cPanel'e yükleme

1. cPanel → **Dosya Yöneticisi** → `public_html` (veya alt alan adı klasörü).
2. `dist/` içindeki **tüm** dosyaları yükle (index.html, `assets/`, favicon vb.).
3. Aşağıdaki `.htaccess`'i `public_html`'e koy (SPA yönlendirmesi + sıkıştırma).

Alternatif: cPanel Git veya FTP ile otomatik yükleme.

## 4. `.htaccess` (SPA yönlendirmesi)

React Router istemci tarafıdır; sunucu bilinmeyen yolları `index.html`'e
döndürmeli, yoksa yenilemede 404 olur. `public/.htaccess` olarak repoda tutulur,
build ile `dist/`'e kopyalanır.

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  # Var olan dosya/dizinleri olduğu gibi servis et
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]
  # Diğer her şeyi SPA giriş noktasına
  RewriteRule ^ index.html [L]
</IfModule>

# Statik varlıkları uzun süre önbellekle (Vite hash'li dosya adları kullanır)
<IfModule mod_headers.c>
  <FilesMatch "\.(js|css|woff2|png|jpg|svg|webp)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "index\.html$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml
</IfModule>
```

## 5. Güncelleme akışı

```bash
pnpm build
# dist/ içeriğini public_html'e yükle (eski assets/ silinebilir; index.html üzerine yaz)
```

- `index.html` `no-cache` olduğundan yeni sürüm anında görünür.
- Hash'li `assets/*` dosyaları önbellekte kalsa da yeni index yeni hash'leri ister.

## 6. HTTPS ve alan adı

- cPanel → **SSL/TLS Status** → AutoSSL ile Let's Encrypt sertifikası.
- CORS: PDF servisinin `PDF_CORS_ORIGIN`'i bu uygulamanın alan adı olmalı
  (bkz. `docs/devir/pdf-servisi.md`).

## Notlar

- Supabase Auth, RLS ve Storage remote çalışır — cPanel'de sunucu kodu gerekmez.
- Edge Functions (intake-request vb.) Supabase'de barınır, cPanel'den bağımsız.
- Build platform-bağımsızdır; ileride Vercel/Netlify'a taşımak isterseniz aynı
  `dist/` çıktısı + yönlendirme kuralı yeterlidir (`.htaccess` yerine ilgili config).
