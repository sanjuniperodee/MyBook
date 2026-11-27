#!/usr/bin/env bash
# Собирает папку релиза из готовой сборки (npm run build → build/): bash deploy/pack-release.sh <папка>
# Её используют и deploy/deploy.sh (сборка на сервере), и GitHub Actions (архив для выкатки) — состав один:
# бандлы процессов (backend.mjs, backend-worker.mjs, worker.mjs, pdf-worker.mjs), node_modules их внешних пакетов,
# bin/mybook-files (CI), шрифты и словари для PDF (assets) и миграции (drizzle). Сайта (Next) в релизе нет — он в mybook-web.
set -euo pipefail
REL="${1:?укажите папку релиза}"
BUILD="${MYBOOK_BUILD_DIR:-build}"
[ -f "$BUILD/backend.mjs" ] || { echo "Нет $BUILD/backend.mjs — сначала npm run build"; exit 1; }
mkdir -p "$REL"
cp -a "$BUILD/." "$REL/"
cp -a assets drizzle "$REL/"
git rev-parse HEAD > "$REL/BUILD_SHA"
