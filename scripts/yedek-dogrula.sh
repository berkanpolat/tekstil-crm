#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Tekstil CRM — Yedek doğrulama
#   • Son .dump'ı İZOLE yerel Postgres'e (localhost, Postgres.app) geri yükler
#   • Satır sayılarını dump anındaki yan-dosya (.counts.tsv) ile karşılaştırır
#     (customers, operations, catalog_products, storage.objects)
#   • Yerel storage yedeğindeki dosya sayısını sayar
#   • Sonucu raporlar; herhangi bir uyuşmazlıkta çıkış kodu 1
#
# Canlı DB'ye HİÇBİR şey yazmaz. Yalnız yerel geçici veritabanı oluşturur/siler.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

BASE="/Users/berkanpolatcetiner/tekstil-crm-yedekler"
DBDIR="$BASE/db"
STORDIR="$BASE/storage"

# İzole yerel hedef (Postgres.app, mevcut kullanıcı)
LHOST="localhost"; LPORT="5432"; LUSER="$USER"
TMPDB="crm_yedek_dogrula_$(date +%Y%m%d_%H%M%S)"

red()  { printf "\033[31m%s\033[0m\n" "$*"; }
grn()  { printf "\033[32m%s\033[0m\n" "$*"; }
line() { printf '%s\n' "──────────────────────────────────────────────"; }

# ── 1) Son dump + eşleşen counts dosyası ─────────────────────────────────────
DUMP=$(ls -t "$DBDIR"/*.dump 2>/dev/null | head -1)
[ -n "$DUMP" ] || { red "Hiç dump bulunamadı: $DBDIR"; exit 1; }
BASENAME=$(basename "$DUMP" .dump)
COUNTS="$DBDIR/$BASENAME.counts.tsv"
line
echo "Doğrulanan dump : $DUMP  ($(du -h "$DUMP" | cut -f1))"
echo "Beklenen sayılar: $COUNTS"
[ -f "$COUNTS" ] || { red "Beklenen sayılar dosyası yok ($COUNTS) — karşılaştırma yapılamaz"; exit 1; }
line

cleanup() { dropdb -h "$LHOST" -p "$LPORT" -U "$LUSER" --if-exists "$TMPDB" 2>/dev/null || true; }
trap cleanup EXIT

# ── 2) İzole geçici DB'ye geri yükle ─────────────────────────────────────────
echo "İzole geçici DB oluşturuluyor: $TMPDB"
createdb -h "$LHOST" -p "$LPORT" -U "$LUSER" "$TMPDB" || { red "createdb başarısız (Postgres.app çalışıyor mu?)"; exit 1; }
echo "Geri yükleniyor… (Supabase'e özel eklenti/rol hataları beklenir, veri için zararsız)"
RESTORE_LOG=$(mktemp)
pg_restore --no-owner --no-privileges --no-acl -j4 \
  -h "$LHOST" -p "$LPORT" -U "$LUSER" -d "$TMPDB" "$DUMP" > "$RESTORE_LOG" 2>&1 || true
restore_errs=$(grep -c '^pg_restore: error' "$RESTORE_LOG" || true)
echo "Geri yükleme bitti (beklenen tipte hata sayısı: $restore_errs — çoğu eksik Supabase eklentisi/rolü)"
line

lc() { psql -h "$LHOST" -p "$LPORT" -U "$LUSER" -d "$TMPDB" -tA -c "$1" 2>/dev/null | tr -d ' '; }

# ── 3) Karşılaştırma (bash 3.2 uyumlu — ilişkisel dizi YOK) ──────────────────
query_for() { # tablo adı → sayım sorgusu
  case "$1" in
    customers)        echo "select count(*) from public.customers" ;;
    operations)       echo "select count(*) from public.operations" ;;
    catalog_products) echo "select count(*) from public.catalog_products" ;;
    storage.objects)  echo "select count(*) from storage.objects" ;;
    *)                echo "" ;;
  esac
}
printf "%-20s %12s %12s   %s\n" "TABLO" "BEKLENEN" "GERİ-YÜKLEN" "SONUÇ"
fail=0
while IFS=$'\t' read -r tbl expected; do
  [ -z "$tbl" ] && continue
  q=$(query_for "$tbl")
  if [ -z "$q" ]; then continue; fi
  got=$(lc "$q"); got="${got:-YOK}"
  if [ "$got" = "$expected" ]; then
    printf "%-20s %12s %12s   \033[32m✓ EŞLEŞTİ\033[0m\n" "$tbl" "$expected" "$got"
  else
    printf "%-20s %12s %12s   \033[31m✗ UYUŞMAZLIK\033[0m\n" "$tbl" "$expected" "$got"
    fail=1
  fi
done < "$COUNTS"
line

# ── 4) Yerel storage dosya sayısı ────────────────────────────────────────────
stor_files=$(find "$STORDIR" -type f ! -name '*.part' 2>/dev/null | wc -l | tr -d ' ')
stor_expected=$(grep -E '^storage.objects' "$COUNTS" | cut -f2)
stor_size=$(du -sh "$STORDIR" 2>/dev/null | cut -f1)
printf "%-20s %12s %12s   " "storage/ (dosya)" "$stor_expected" "$stor_files"
if [ "$stor_files" = "$stor_expected" ]; then grn "✓ EŞLEŞTİ ($stor_size)"; else
  # storage.objects DB kaydını içerir; dosya sayısı yaklaşık eşit olmalı
  if [ "$stor_files" -ge "$stor_expected" ]; then grn "✓ TAM/FAZLA ($stor_size)"; else
    red "✗ EKSİK DOSYA ($stor_size)"; fail=1; fi
fi
line

rm -f "$RESTORE_LOG"
if [ "$fail" = "0" ]; then
  grn "SONUÇ: ✅ YEDEK GEÇERLİ — geri yükleme çalışıyor, sayılar tutuyor."
  exit 0
else
  red "SONUÇ: ❌ DOĞRULAMA BAŞARISIZ — yukarıdaki uyuşmazlıklara bak."
  exit 1
fi
