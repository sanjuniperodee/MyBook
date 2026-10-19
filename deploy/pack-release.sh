#!/usr/bin/env bash
# Собирает папку релиза из готовой сборки (после next build): bash deploy/pack-release.sh <папка>
# Её используют и deploy/deploy.sh (сборка на сервере), и GitHub Actions (архив для выкатки) — состав один.
set -euo pipefail
REL="${1:?укажите папку релиза}"
mkdir -p "$REL/.next"
cp -a .next/standalone/. "$REL/"
# standalone-сборке нужны статика, шрифты для PDF и миграции рядом с server.js
cp -a .next/static "$REL/.next/static"
cp -a public assets drizzle "$REL/"
git rev-parse HEAD > "$REL/BUILD_SHA"
