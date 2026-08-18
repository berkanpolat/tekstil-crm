#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Tekstil CRM — Yerel otomatik yedek
#   1) pg_dump -Fc          → ~/tekstil-crm-yedekler/db/YYYY-MM-DD.dump
#   2) Storage (artımlı)    → ~/tekstil-crm-yedekler/storage/<bucket>/...
#   3) Rotasyon             : db/ altında 30 günden eski dump + counts sil
#   4) Log                  : logs/yedek.log (tarih, boyut, dosya sayısı, sonuç)
#   5) Hata görünür         : macOS bildirimi + logs/SON-HATA.txt işaret dosyası
#
# Şifre .env'den okunur, script'e gömülmez.
# launchd altında login shell yok → PATH ve tüm yollar mutlaktır.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

PROJECT="/Users/berkanpolatcetiner/tekstil-crm"
BASE="/Users/berkanpolatcetiner/tekstil-crm-yedekler"
DBDIR="$BASE/db"
STORDIR="$BASE/storage"
LOGDIR="$BASE/logs"
LOG="$LOGDIR/yedek.log"
HATA_ISARET="$LOGDIR/SON-HATA.txt"
ENVFILE="$PROJECT/.env"

mkdir -p "$DBDIR" "$STORDIR" "$LOGDIR"

# ── log yardımcıları ─────────────────────────────────────────────────────────
ts()  { date "+%Y-%m-%d %H:%M:%S"; }
log() { echo "$(ts) | $*" | tee -a "$LOG"; }

bildir() { # macOS bildirimi (kullanıcı oturumu açıksa görünür)
  /usr/bin/osascript -e "display notification \"$1\" with title \"CRM Yedek\" sound name \"Basso\"" 2>/dev/null || true
}

hata_cik() {
  local msg="$1"
  log "❌ HATA: $msg"
  { echo "SON HATA: $(ts)"; echo "$msg"; echo "Ayrıntı: $LOG"; } > "$HATA_ISARET"
  bildir "YEDEK BAŞARISIZ — $msg"
  exit 1
}
# Beklenmeyen her hatada da yakala
trap 'hata_cik "beklenmeyen hata (satır $LINENO)"' ERR

# ── .env oku (yalnız gerekli 4 anahtar; değerler loglanmaz) ──────────────────
[ -f "$ENVFILE" ] || hata_cik ".env bulunamadı: $ENVFILE"
getenv() { grep -E "^$1=" "$ENVFILE" | head -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/; s/^'\''(.*)'\''$/\1/'; }
DB_PASSWORD="$(getenv SUPABASE_DB_PASSWORD)"
PROJECT_REF="$(getenv SUPABASE_PROJECT_REF)"
SERVICE_KEY="$(getenv SUPABASE_SERVICE_ROLE_KEY)"
SUPA_URL="$(getenv VITE_SUPABASE_URL)"
[ -n "$DB_PASSWORD" ] && [ -n "$PROJECT_REF" ] && [ -n "$SERVICE_KEY" ] && [ -n "$SUPA_URL" ] \
  || hata_cik ".env içinde eksik anahtar (DB_PASSWORD/PROJECT_REF/SERVICE_KEY/URL)"

export PGHOST="aws-0-eu-west-1.pooler.supabase.com"
export PGPORT="5432"
export PGUSER="postgres.${PROJECT_REF}"
export PGDATABASE="postgres"
export PGPASSWORD="$DB_PASSWORD"
export PGCONNECT_TIMEOUT=15

# Geçici pooler hatalarına (ENOTFOUND / tenant not found) karşı retry sarmalayıcı
retry() { # retry <kez> <bekleme_sn> -- komut…
  local n="$1" wait="$2"; shift 3
  local i=1
  while true; do
    if "$@"; then return 0; fi
    if [ "$i" -ge "$n" ]; then return 1; fi
    log "…deneme $i/$n başarısız, ${wait}sn sonra tekrar: $1"
    sleep "$wait"; i=$((i+1))
  done
}

DATE="$(date +%Y-%m-%d)"
log "════════════ YEDEK BAŞLADI ($DATE) ════════════"

# ── 1) Veritabanı dump (pg_dump -Fc) ─────────────────────────────────────────
DUMP="$DBDIR/$DATE.dump"
TMP_DUMP="$DUMP.partial"
log "DB dump alınıyor → $DUMP"
do_dump() { pg_dump -Fc -Z6 --no-owner --no-privileges -f "$TMP_DUMP" 2>>"$LOG"; }
if ! retry 5 30 -- do_dump; then
  rm -f "$TMP_DUMP"; hata_cik "pg_dump 5 denemede de başarısız (pooler/şifre? — Supabase Supavisor kesintisi olabilir)"
fi
mv -f "$TMP_DUMP" "$DUMP"
DUMP_SIZE=$(du -h "$DUMP" | cut -f1)
log "DB dump tamam — boyut: $DUMP_SIZE"

# ── 1b) Doğrulama için canlı satır sayıları (yan-dosya) ──────────────────────
COUNTS="$DBDIR/$DATE.counts.tsv"
do_counts() { psql -tA -F$'\t' -o "$COUNTS" -c "
  select 'customers', count(*) from customers
  union all select 'operations', count(*) from operations
  union all select 'catalog_products', count(*) from catalog_products
  union all select 'storage.objects', count(*) from storage.objects;" 2>>"$LOG"; }
retry 5 20 -- do_counts || hata_cik "satır sayıları okunamadı"
log "Satır sayıları kaydedildi → $(tr '\n' ' ' < "$COUNTS")"

# ── 2) Storage artımlı senkron (sadece eksik/değişen indirilir) ──────────────
log "Storage senkronu başlıyor (artımlı)…"
tmp_buckets=$(mktemp)
list_buckets() { psql -tA -o "$tmp_buckets" -c "select name from storage.buckets order by name;" 2>>"$LOG"; }
retry 5 20 -- list_buckets || hata_cik "bucket listesi alınamadı"
BUCKETS=$(cat "$tmp_buckets"); rm -f "$tmp_buckets"
tmp_need=$(mktemp)
tmp_list=$(mktemp)
total_obj=0; skipped=0
for bucket in $BUCKETS; do
  list_objs() { psql -tA -F$'\t' -o "$tmp_list" -c \
    "select name, coalesce((metadata->>'size')::bigint,0) from storage.objects where bucket_id='$bucket';" 2>>"$LOG"; }
  retry 5 20 -- list_objs || hata_cik "storage listesi alınamadı ($bucket)"
  while IFS=$'\t' read -r name size; do
    [ -z "$name" ] && continue
    total_obj=$((total_obj+1))
    dest="$STORDIR/$bucket/$name"
    if [ -f "$dest" ] && [ "$(stat -f%z "$dest" 2>/dev/null)" = "$size" ]; then
      skipped=$((skipped+1))
    else
      printf '%s\t%s\t%s\n' "$bucket" "$name" "$size" >> "$tmp_need"
    fi
  done < "$tmp_list"
done
need_count=$(wc -l < "$tmp_need" | tr -d ' ')
log "Storage: toplam $total_obj nesne, $skipped güncel, $need_count indirilecek"

# ── indirici (paralel) ───────────────────────────────────────────────────────
dl_one() { # arg: bucket \t name \t size  (env: SUPA_URL, SERVICE_KEY, STORDIR)
  IFS=$'\t' read -r bucket name size <<< "$1"
  local dest="$STORDIR/$bucket/$name"
  mkdir -p "$(dirname "$dest")"
  local code
  code=$(curl -s -o "$dest.part" -w "%{http_code}" \
    -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
    "$SUPA_URL/storage/v1/object/$bucket/$name")
  if [ "$code" = "200" ] && [ -s "$dest.part" ]; then
    mv -f "$dest.part" "$dest"; echo "OK"
  else
    rm -f "$dest.part"; echo "FAIL $bucket/$name http=$code"
  fi
}
export -f dl_one
export SUPA_URL SERVICE_KEY STORDIR

dl_ok=0; dl_fail=0
if [ "$need_count" -gt 0 ]; then
  # ERR trap'i indirme sırasında kapat (tekil hataları kendimiz sayıyoruz)
  trap - ERR
  results=$(tr '\n' '\0' < "$tmp_need" | xargs -0 -P8 -I{} bash -c 'dl_one "$@"' _ {} 2>>"$LOG")
  dl_ok=$(echo "$results" | grep -c '^OK' || true)
  dl_fail=$(echo "$results" | grep -c '^FAIL' || true)
  echo "$results" | grep '^FAIL' | head -20 >> "$LOG" || true
  trap 'hata_cik "beklenmeyen hata (satır $LINENO)"' ERR
fi
rm -f "$tmp_need" "$tmp_list"
log "Storage senkron tamam — indirilen: $dl_ok, hatalı: $dl_fail"
stor_files=$(find "$STORDIR" -type f ! -name '*.part' | wc -l | tr -d ' ')
stor_size=$(du -sh "$STORDIR" 2>/dev/null | cut -f1)
log "Storage yerel durumu — $stor_files dosya, $stor_size"

# ── 3) Rotasyon: 30 günden eski dump + counts sil ────────────────────────────
eski=$(find "$DBDIR" -type f \( -name '*.dump' -o -name '*.counts.tsv' \) -mtime +30)
if [ -n "$eski" ]; then
  echo "$eski" | while read -r f; do log "Rotasyon: siliniyor $(basename "$f")"; rm -f "$f"; done
fi

# ── Sonuç ────────────────────────────────────────────────────────────────────
rm -f "$HATA_ISARET"
if [ "$dl_fail" -gt 0 ]; then
  log "⚠️  UYARI: $dl_fail storage dosyası indirilemedi (sonraki koşuda tekrar denenecek)"
  bildir "Yedek bitti ama $dl_fail dosya indirilemedi — log'a bak"
else
  log "✅ YEDEK BAŞARILI — DB $DUMP_SIZE, storage $stor_files dosya ($stor_size)"
fi
log "════════════ YEDEK BİTTİ ════════════"
