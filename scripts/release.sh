#!/bin/bash
# =============================================================================
# release.sh — crm.tekstilas.com (cPanel / LiteSpeed) surumlu deploy
#
# KULLANIM
#   bash scripts/release.sh            # package.json'daki surumu yayinlar
#   bash scripts/release.sh 1.21.0     # once surumu yukseltir, sonra yayinlar
#   KURU=1 bash scripts/release.sh     # kuru kosu — hicbir sey yuklenmez
#
# ADIMLAR
#   1) On kontroller (temiz agac, .env, lftp)
#   2) Yayindaki mevcut surumu YEDEKLE  -> ~/tekstil-crm-yedekler/crm-web/
#   3) Build + dogrulama (index.html, .htaccess, assets)
#   4) Kalici arsiv        -> /crm/_versions/v<X.Y.Z>/
#   5) Canliya mirror      -> /crm/            (_versions haric)
#   6) Yayin dogrulamasi   -> HTTP 200 + version.json + SPA yonlendirmesi
#
# GERI ALMA
#   bash scripts/release.sh --geri-al v1.20.0
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

YEDEK_KOK="${HOME}/tekstil-crm-yedekler/crm-web"
KURU="${KURU:-0}"

[ -f .env.deploy ] || { echo "HATA: .env.deploy yok (FTP bilgileri)"; exit 1; }
set -a; . ./.env.deploy; set +a
: "${FTP_HOST:?}" "${FTP_USER:?}" "${FTP_PASS:?}" "${REMOTE_DIR:?}" "${PROD_URL:?}"

command -v lftp >/dev/null || { echo "HATA: lftp kurulu degil (brew install lftp)"; exit 1; }

ftp_cmd() { lftp -e "set ftp:ssl-allow no; set net:max-retries 2; set net:timeout 20; $1; bye" \
              -u "${FTP_USER},${FTP_PASS}" "ftp://${FTP_HOST}"; }

# ---------------------------------------------------------------- geri alma --
if [ "${1:-}" = "--geri-al" ]; then
  HEDEF="${2:?Kullanim: bash scripts/release.sh --geri-al v1.20.0}"
  echo "═══ GERI ALMA → ${HEDEF} ═══"
  ftp_cmd "cd ${REMOTE_DIR}/_versions/${HEDEF}" >/dev/null 2>&1 \
    || { echo "HATA: ${REMOTE_DIR}/_versions/${HEDEF} sunucuda yok."; exit 1; }
  ftp_cmd "mirror --parallel=4 --delete --exclude-glob _versions/ ${REMOTE_DIR}/_versions/${HEDEF}/ ${REMOTE_DIR}/" 
  echo "✅ ${HEDEF} yayina alindi → ${PROD_URL}"
  exit 0
fi

# ------------------------------------------------------------- on kontroller --
echo "═══ [1/6] On kontroller ═══"
[ -f .env ] || { echo "HATA: .env yok — build'e Supabase adresi gomulmez."; exit 1; }
grep -q '^VITE_SUPABASE_URL=https://' .env || { echo "HATA: .env icinde VITE_SUPABASE_URL dolu degil."; exit 1; }
grep -q '^VITE_SUPABASE_ANON_KEY=..' .env  || { echo "HATA: .env icinde VITE_SUPABASE_ANON_KEY dolu degil."; exit 1; }

if [ -n "$(git status --porcelain)" ] && [ "$KURU" != "1" ]; then
  echo "  ⚠️  Calisma agaci temiz degil:"; git status --short | head -10
  read -r -p "  Yine de devam? (evet/hayir) " C; [ "$C" = "evet" ] || exit 1
fi

if [ -n "${1:-}" ]; then
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "HATA: gecersiz semver: $1"; exit 1; }
  node -e "const f='package.json',j=require('./'+f);j.version='$1';require('fs').writeFileSync(f,JSON.stringify(j,null,2)+'\n')"
  echo "  package.json → $1"
fi
SURUM="$(node -p "require('./package.json').version")"
echo "  Surum   : v${SURUM}"
echo "  Hedef   : ftp://${FTP_HOST}${REMOTE_DIR}/  →  ${PROD_URL}"
[ "$KURU" = "1" ] && echo "  MOD     : KURU KOSU (hicbir sey yuklenmeyecek)"

# ------------------------------------------------------------------- yedek ---
echo ""
echo "═══ [2/6] Yayindaki surumu yedekle ═══"
if ftp_cmd "cd ${REMOTE_DIR}" >/dev/null 2>&1; then
  D="${YEDEK_KOK}/$(date +%Y%m%d-%H%M%S)-oncesi-v${SURUM}"
  mkdir -p "$D"
  ftp_cmd "mirror --parallel=4 --exclude-glob _versions/ ${REMOTE_DIR}/ ${D}/" >/dev/null 2>&1 || true
  N=$(find "$D" -type f 2>/dev/null | wc -l | tr -d ' ')
  if [ "$N" -gt 0 ]; then echo "  ✅ ${N} dosya → ${D}"
  else rmdir "$D" 2>/dev/null || true; echo "  (hedef bos — ilk yayin, yedeklenecek bir sey yok)"; fi
else
  echo "  (${REMOTE_DIR} henuz yok — ilk yayin)"
fi

# ------------------------------------------------------------------- build ---
echo ""
echo "═══ [3/6] Build ═══"
npm run build 2>&1 | tail -3
printf '{"surum":"%s","tarih":"%s","commit":"%s"}\n' \
  "$SURUM" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(git rev-parse --short HEAD 2>/dev/null || echo '-')" \
  > dist/version.json

for f in dist/index.html dist/.htaccess dist/version.json; do
  [ -f "$f" ] || { echo "HATA: ${f} uretilmedi."; exit 1; }
done
ls dist/assets/index-*.js >/dev/null 2>&1 || { echo "HATA: dist/assets/index-*.js yok."; exit 1; }
grep -q 'RewriteRule \^ index.html' dist/.htaccess || { echo "HATA: .htaccess SPA kurali yok."; exit 1; }
echo "  ✅ dist hazir ($(find dist -type f | wc -l | tr -d ' ') dosya)"

if [ "$KURU" = "1" ]; then
  echo ""; echo "═══ KURU KOSU BITTI — sunucuya hicbir sey yazilmadi ═══"; exit 0
fi

# ------------------------------------------------------------------ arsiv ----
echo ""
echo "═══ [4/6] Kalici arsiv → ${REMOTE_DIR}/_versions/v${SURUM}/ ═══"
ftp_cmd "mkdir -p ${REMOTE_DIR}/_versions/v${SURUM}; mirror -R --parallel=4 ${ROOT}/dist/ ${REMOTE_DIR}/_versions/v${SURUM}/" 2>&1 | tail -2

# ----------------------------------------------------------------- deploy ----
echo ""
echo "═══ [5/6] Canliya mirror → ${REMOTE_DIR}/ ═══"
ftp_cmd "mkdir -p ${REMOTE_DIR}; mirror -R --parallel=4 --delete --exclude-glob _versions/ --exclude-glob .well-known/ --exclude-glob cgi-bin/ --exclude-glob .user.ini --exclude-glob php.ini ${ROOT}/dist/ ${REMOTE_DIR}/" 2>&1 | tail -2

# -------------------------------------------------------------- dogrulama ---
echo ""
echo "═══ [6/6] Yayin dogrulamasi ═══"
sleep 3
# Yerel DNS onbellegi bayat olabilir → adresi 1.1.1.1'den cozup curl'e dayat.
HOSTN="$(echo "$PROD_URL" | sed -E 's#https?://##; s#/.*##')"
CFIP="$(dig +short "$HOSTN" @1.1.1.1 2>/dev/null | grep -E '^[0-9.]+$' | head -1)"
RES=""; [ -n "$CFIP" ] && RES="--resolve ${HOSTN}:443:${CFIP}"
H=$(curl -s $RES -o /tmp/crm-idx.html -w '%{http_code}' --max-time 25 "${PROD_URL}/" || echo 000)
echo "  ana sayfa      : HTTP ${H}"
V=$(curl -s $RES --max-time 25 "${PROD_URL}/version.json" | node -pe "try{JSON.parse(require('fs').readFileSync(0,'utf8')).surum}catch(e){'-'}" 2>/dev/null || echo '-')
echo "  yayindaki surum: ${V} (beklenen ${SURUM})"
S=$(curl -s $RES -o /dev/null -w '%{http_code}' --max-time 25 "${PROD_URL}/musteriler" || echo 000)
echo "  SPA alt sayfa  : HTTP ${S} (200 olmali — 404 ise .htaccess calismiyor)"

if [ "$H" = "200" ] && [ "$V" = "$SURUM" ] && [ "$S" = "200" ]; then
  echo ""; echo "✅ v${SURUM} yayinda → ${PROD_URL}"
  git tag -a "v${SURUM}" -m "Release v${SURUM}" 2>/dev/null && echo "   git tag v${SURUM} atildi" || true
else
  echo ""; echo "⚠️  Dogrulama basarisiz. Geri alma:"
  echo "   bash scripts/release.sh --geri-al v<onceki>"
  exit 1
fi
