#!/usr/bin/env bash
# Деплой MyBooks на сервер с PM2 и nginx (без Docker).
# Запуск на сервере из корня репозитория: bash deploy/deploy.sh [ветка]
set -euo pipefail

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

[ -f .env ] || { echo "Нет файла .env — скопируйте .env.example и заполните"; exit 1; }
grep -q '^STORAGE_DIR=/' .env || { echo "В .env укажите абсолютный STORAGE_DIR (например, /home/$USER/mybook-storage)"; exit 1; }

echo "→ Обновляем код ($BRANCH)"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "→ Зависимости"
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --no-audit --no-fund

echo "→ Сборка"
NEXT_TELEMETRY_DISABLED=1 npm run build
# standalone-сборке нужны статика, шрифты для PDF и миграции рядом с server.js
cp -r .next/static .next/standalone/.next/static
cp -r public assets drizzle .next/standalone/

echo "→ Перезапуск (миграции БД применяются при старте)"
if pm2 describe mybook >/dev/null 2>&1; then
  pm2 reload deploy/ecosystem.config.cjs --update-env
else
  pm2 start deploy/ecosystem.config.cjs
fi
pm2 save

PORT="${MYBOOK_PORT:-3040}"
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://localhost:$PORT/"; then echo "✓ MyBooks отвечает на localhost:$PORT"; exit 0; fi
  sleep 1
done
echo "✗ Приложение не ответило. Логи: pm2 logs mybook --nostream --lines 100"
exit 1
