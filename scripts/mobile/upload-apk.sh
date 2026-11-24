#!/usr/bin/env bash
# Выложить собранный APK на прод: копия на сервер и запись в хранилище (как загрузка в CRM «Сайт» → «Приложение для Android»).
#   bash scripts/mobile/upload-apk.sh [mobile/build/app/outputs/flutter-apk/app-crm-release.apk]
set -euo pipefail
APK="${1:-mobile/build/app/outputs/flutter-apk/app-crm-release.apk}"
HOST="${MOBILE_APK_HOST:-srv@185.102.75.191}"
[ -f "$APK" ] || { echo "Нет файла $APK — соберите: cd mobile && flutter build apk --release --flavor crm"; exit 1; }
scp -q "$APK" "$HOST:/tmp/MyBooks-CRM.apk"
ssh "$HOST" 'cd ~/mybook && npx tsx --env-file-if-exists=.env --import ./scripts/preload.mjs scripts/mobile/upload-apk.ts /tmp/MyBooks-CRM.apk && rm -f /tmp/MyBooks-CRM.apk'
