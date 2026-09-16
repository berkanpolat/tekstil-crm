#!/usr/bin/env bash
# TEKSTIL-CRM Storage temizliği — YALNIZ document/ ve intake/ önekleri.
# catalog/ önekine ASLA dokunmaz (katalog görselleri korunur).
# Kullanım: KURU=1 ./scripts/sifirlama-storage-sil.sh   (varsayılan: kuru koşu, silmez)
#           KURU=0 ./scripts/sifirlama-storage-sil.sh   (GERÇEK silme — (c) onayından sonra)
set -euo pipefail

KURU="${KURU:-1}"
BUCKET="documents"
cd "$(dirname "$0")/.."

SUPA_URL=$(grep '^VITE_SUPABASE_URL=' .env | cut -d= -f2- | tr -d '[:space:]')
SRK=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env | cut -d= -f2- | tr -d '[:space:]')

export PGHOST='aws-0-eu-west-1.pooler.supabase.com' PGPORT='5432' \
       PGUSER='postgres.kkxvoxeqfsaqzklrtgrw' PGDATABASE='postgres'
export PGPASSWORD="$(grep '^SUPABASE_DB_PASSWORD=' .env | cut -d= -f2-)"

# Silinecek nesne listesi — SADECE document/ ve intake/ önekleri
OBJS=()
while IFS= read -r line; do
  [ -n "$line" ] && OBJS+=("$line")
done < <(psql -tAc \
  "select name from storage.objects
     where bucket_id='$BUCKET'
       and (name like 'document/%' or name like 'intake/%')
     order by name;")

echo "Aday nesne sayısı: ${#OBJS[@]}"

# ---- GÜVENLİK KİLİDİ: hiçbir yol catalog/ ile başlamamalı ----
for n in "${OBJS[@]}"; do
  case "$n" in
    catalog/*|/*|*..*)
      echo "GÜVENLİK DURDURMA: yasak yol tespit edildi -> $n"; exit 2 ;;
    document/*|intake/*) : ;;   # izinli
    *) echo "GÜVENLİK DURDURMA: beklenmeyen önek -> $n"; exit 2 ;;
  esac
done
echo "Güvenlik kilidi geçildi: yalnız document/ + intake/ önekleri, catalog/ YOK."

if [ "$KURU" = "1" ]; then
  echo "[KURU KOŞU] ${#OBJS[@]} nesne silinecekti. Hiçbir şey silinmedi."
  printf '  %s\n' "${OBJS[@]:0:5}" ; echo "  ..."
  exit 0
fi

# ---- GERÇEK SİLME: 100'lük gruplar hâlinde bulk remove ----
del=0
for ((i=0; i<${#OBJS[@]}; i+=100)); do
  batch=("${OBJS[@]:i:100}")
  payload=$(printf '%s\n' "${batch[@]}" | python3 -c 'import sys,json; print(json.dumps({"prefixes":[l.strip() for l in sys.stdin if l.strip()]}))')
  code=$(curl -s -o /tmp/rmresp.json -w '%{http_code}' -X DELETE \
    -H "Authorization: Bearer $SRK" -H "apikey: $SRK" \
    -H "Content-Type: application/json" \
    --data "$payload" \
    "$SUPA_URL/storage/v1/object/$BUCKET")
  if [ "$code" = "200" ]; then del=$((del+${#batch[@]})); else
    echo "HATA ($code) grup $i: $(cat /tmp/rmresp.json)"; exit 3
  fi
done
echo "Silinen nesne: $del"
echo "Kalan catalog/ nesne (kontrol):"
psql -tAc "select count(*) from storage.objects where bucket_id='$BUCKET' and name like 'catalog/%';"
