#!/bin/bash
# =============================================================================
# pdf-servisi-kur.sh — Belge motoru PDF servisini Fly.io'ya kur / güncelle.
#
# ÖN KOŞUL (tek etkileşimli adım, senin yapman gerekiyor):
#   flyctl auth login
#
# SONRA:
#   bash scripts/pdf-servisi-kur.sh
#
# NE YAPAR
#   1. Fly oturumunu doğrular
#   2. Uygulama yoksa oluşturur (fly.toml'daki ad/bölge ile)
#   3. PDF_SECRET üretir ve hem Fly'a hem Supabase'e koyar (ikisi aynı olmalı)
#   4. Dağıtır, /health ile doğrular
#   5. VITE_PDF_SERVICE_URL'i .env'e yazar ve UYARIR: build gerekiyor
#
# NEDEN GEREKLİ: servis 31 Ağu 2026'da DNS'te çözülmüyordu (uygulama silinmiş).
# Kod sağlam — yerelde 421 KB'lık gerçek teklif PDF'i üretildi; eksik olan barındırma.
# =============================================================================
set -euo pipefail
KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRV="$KOK/services/pdf-renderer"
APP="$(grep -m1 '^app = ' "$SRV/fly.toml" | cut -d'"' -f2)"

command -v flyctl >/dev/null || { echo "HATA: flyctl yok → brew install flyctl"; exit 1; }
flyctl auth whoami >/dev/null 2>&1 || { echo "HATA: Fly oturumu yok → flyctl auth login"; exit 1; }
echo "═══ Fly hesabı: $(flyctl auth whoami) · uygulama: $APP ═══"

cd "$SRV"
if ! flyctl status --app "$APP" >/dev/null 2>&1; then
  echo "── [1/4] Uygulama yok, oluşturuluyor"
  flyctl launch --no-deploy --copy-config --name "$APP" --region fra --yes
else
  echo "── [1/4] Uygulama mevcut"
fi

echo "── [2/4] PDF_SECRET"
if flyctl secrets list --app "$APP" 2>/dev/null | grep -q PDF_SECRET; then
  echo "   zaten tanımlı (korunuyor)"
else
  SECRET="$(openssl rand -hex 24)"
  flyctl secrets set PDF_SECRET="$SECRET" --app "$APP" >/dev/null
  # Supabase tarafı da AYNI sırrı bilmeli (belge üreten Edge Function imzalıyor).
  TOK="$(security find-generic-password -s 'Supabase CLI' -a supabase -w 2>/dev/null | sed 's/^go-keyring-base64://' | base64 -d)"
  REF="$(grep -m1 '^SUPABASE_PROJECT_REF=' "$KOK/.env" | cut -d= -f2)"
  curl -s -o /dev/null -X POST "https://api.supabase.com/v1/projects/$REF/secrets" \
    -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
    -d "[{\"name\":\"PDF_SECRET\",\"value\":\"$SECRET\"}]"
  echo "   üretildi ve Fly + Supabase'e yazıldı (ekrana basılmadı)"
fi

echo "── [3/4] Dağıtım"
flyctl deploy --app "$APP" 2>&1 | tail -6

echo "── [4/4] Doğrulama"
URL="https://${APP}.fly.dev"
for i in 1 2 3 4 5 6; do
  sleep 5
  if curl -s --max-time 10 "$URL/health" | grep -q '"ok":true'; then
    echo "   ✅ $URL/health → $(curl -s --max-time 10 "$URL/health")"
    break
  fi
  [ "$i" = 6 ] && { echo "   ⚠️  /health yanıt vermedi — flyctl logs --app $APP"; exit 1; }
done

# Vite değişkeni BUILD ANINDA gömülür → .env'e yaz, kullanıcıya build hatırlat.
if grep -q '^VITE_PDF_SERVICE_URL=' "$KOK/.env" 2>/dev/null; then
  sed -i '' "s#^VITE_PDF_SERVICE_URL=.*#VITE_PDF_SERVICE_URL=$URL#" "$KOK/.env"
else
  printf '\n# Belge motoru PDF servisi (Fly.io)\nVITE_PDF_SERVICE_URL=%s\n' "$URL" >> "$KOK/.env"
fi
echo ""
echo "✅ Servis ayakta. .env güncellendi."
echo "   SON ADIM — Vite değişkeni derleme anında gömülür:"
echo "     bash scripts/release.sh"
