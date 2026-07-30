# Tekstil A.Ş. Belge Motoru — PDF servisi. DÜZ Dockerfile (platform-bağımsız).
# Taşınırsa yalnızca fly.toml değişir; bu dosya olduğu gibi kalır.
#
# Playwright resmi imajı Chromium + tüm sistem bağımlılıklarını içerir.
# Sürüm package.json'daki playwright ile AYNI olmalı (aksi halde tarayıcı uyuşmaz).
FROM mcr.microsoft.com/playwright:v1.62.0-jammy

WORKDIR /app

# Bağımlılıklar (express + playwright). Chromium imajda hazır.
COPY package.json ./
RUN npm install --omit=dev

# Servis kodu + şablonlar (studio.html gömülü — dış bağımlılık yok)
COPY . .

ENV NODE_ENV=production
ENV PORT=4046
EXPOSE 4046

# Sağlık kontrolü (fly.toml da ayrıca tanımlar)
HEALTHCHECK --interval=15s --timeout=3s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4046)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
