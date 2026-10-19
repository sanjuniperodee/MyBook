#!/usr/bin/env bash
# Деплой MyBooks на сервер с PM2 и nginx (без Docker) — без «битых» страниц во время выкатки.
# Запуск на сервере из корня репозитория: bash deploy/deploy.sh [ветка]
#
# Сборка идёт в .next репозитория, а запускается копия в ../mybook-releases/releases/<время>-<sha>: пока идёт сборка,
# работающая версия не затрагивается. Порядок:
#   код → зависимости → сборка → релиз → smoke-тест на временном порту → переключение current → перезапуск PM2.
# Не прошёл smoke-тест — остаётся старая версия. Не ответила после переключения — откат на предыдущий релиз.
set -euo pipefail

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${MYBOOK_PORT:-3040}"
SMOKE_PORT="${MYBOOK_SMOKE_PORT:-3041}"
KEEP="${MYBOOK_KEEP_RELEASES:-3}"
# Релизы лежат рядом с репозиторием, а не внутри: иначе TypeScript и ESLint видят чужие копии исходников
BASE="${MYBOOK_RELEASES_DIR:-$(dirname "$ROOT")/mybook-releases}"
RELEASES="$BASE/releases"
CURRENT="$BASE/current"

[ -f .env ] || { echo "Нет файла .env — скопируйте .env.example и заполните"; exit 1; }
grep -q '^STORAGE_DIR=/' .env || { echo "В .env укажите абсолютный STORAGE_DIR (например, /home/$USER/mybook-storage)"; exit 1; }

echo "→ Обновляем код ($BRANCH)"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
SHA="$(git rev-parse --short HEAD)"

# Итог деплоя — в группу WhatsApp от номера, подключённого к своему шлюзу (GOWA). Сбой уведомления деплой не ломает.
notify() { node --env-file="$ROOT/.env" "$ROOT/deploy/notify.mjs" "$@" 2>&1 | sed "s/^/  /" || true; }
DEPLOY_OK=0
SMOKE_PID=""
on_exit() {
  [ -n "$SMOKE_PID" ] && { kill "$SMOKE_PID" 2>/dev/null || true; wait "$SMOKE_PID" 2>/dev/null || true; }
  [ "$DEPLOY_OK" = 1 ] || notify fail "$SHA"
}
trap on_exit EXIT

# Сборка идёт на том же сервере, что и сайт (4 ядра, 8 ГБ, рядом чужие проекты): без ограничений она забирает ядра
# и память, и сайт отвечает медленно. Поэтому сборке — одно ядро и мягкий потолок памяти (cgroup через systemd-run),
# низший приоритет процессора и диска. Нет systemd-run для пользователя — только приоритеты.
# В потолок входит и файловый кэш, который читает сборка: холодная сборка доходит до ~2,9 ГБ, а при потолке 2200M
# ядро выбрасывало прочитанное, сборка перечитывала диск по кругу (9 ГБ за 30 минут) и тормозила сайт.
BUILD_CPU="${MYBOOK_BUILD_CPU:-100%}"
BUILD_MEM="${MYBOOK_BUILD_MEM:-3500M}"
limited() {
  if systemd-run --user --scope -q -p CPUQuota=50% true >/dev/null 2>&1; then
    systemd-run --user --scope -q -p CPUQuota="$BUILD_CPU" -p MemoryHigh="$BUILD_MEM" nice -n 19 ionice -c 3 "$@"
  else
    nice -n 19 ionice -c 3 "$@"
  fi
}

# npm ci переустанавливает node_modules целиком (сотни мегабайт с диска) — только если зависимости поменялись.
LOCK_HASH="$(sha256sum package-lock.json | cut -d' ' -f1)"
if [ -d node_modules ] && [ "$(cat node_modules/.deploy-lock-hash 2>/dev/null)" = "$LOCK_HASH" ]; then
  echo "→ Зависимости не менялись — npm ci пропущен"
else
  echo "→ Зависимости"
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 limited npm ci --no-audit --no-fund
  echo "$LOCK_HASH" > node_modules/.deploy-lock-hash
fi

# Кэш Turbopack (.next/cache/turbopack) старые файлы не удаляет: свежий весит ~400 МБ, а за месяцы дорастает до
# гигабайтов, и сборка не помещается в потолок памяти. Разросся — удаляем: одна сборка пройдёт холодной.
CACHE_DIR=.next/cache/turbopack
CACHE_MAX_MB="${MYBOOK_BUILD_CACHE_MAX_MB:-1200}"
if [ -d "$CACHE_DIR" ]; then
  CACHE_MB="$(du -sm "$CACHE_DIR" | cut -f1)"
  if [ "$CACHE_MB" -gt "$CACHE_MAX_MB" ]; then
    echo "→ Кэш сборки ${CACHE_MB} МБ (больше ${CACHE_MAX_MB}) — удалён, сборка будет холодной"
    rm -rf "$CACHE_DIR"
  fi
fi

echo "→ Сборка (одно ядро, низкий приоритет — сайт продолжает отвечать быстро)"
# Проверка типов внутри next build не помещается в память сервера (падала с heap out of memory) — типы проверяются до
# пуша (npx tsc --noEmit); MYBOOK_TYPECHECK=1 вернёт проверку при сборке.
SKIP_TS=1
[ "${MYBOOK_TYPECHECK:-0}" = 1 ] && SKIP_TS=0
MYBOOK_SKIP_TYPECHECK="$SKIP_TS" NEXT_TELEMETRY_DISABLED=1 limited npm run build

echo "→ Релиз $SHA"
REL="$RELEASES/$(date +%Y%m%d-%H%M%S)-$SHA"
mkdir -p "$REL"
cp -a .next/standalone/. "$REL/"
# standalone-сборке нужны статика, шрифты для PDF и миграции рядом с server.js
mkdir -p "$REL/.next"
cp -a .next/static "$REL/.next/static"
cp -a public assets drizzle "$REL/"

# PM2 при reload не перечитывает cwd, поэтому процесс пересоздаётся (для fork-режима это тот же перезапуск, 1–2 с).
pm2_apply() {
  pm2 delete mybook >/dev/null 2>&1 || true
  pm2 start deploy/ecosystem.config.cjs --only mybook
  pm2 save
}

# Ждём, пока по адресу пройдут все проверки; 0 — всё хорошо.
check_app() {
  local port="$1" timeout="${2:-40}" i body
  for i in $(seq 1 "$timeout"); do
    body="$(curl -fsS -m 5 "http://localhost:$port/api/health" 2>/dev/null || true)"
    if [[ "$body" == *'"ok":true'* ]]; then
      # главная, казахская версия (rewrite) за https-прокси и вход
      curl -fsS -m 10 -o /dev/null "http://localhost:$port/" &&
        curl -fsS -m 10 -o /dev/null -H "X-Forwarded-Proto: https" "http://localhost:$port/kk" &&
        curl -fsS -m 10 -o /dev/null "http://localhost:$port/login" && return 0
    fi
    sleep 1
  done
  return 1
}

echo "→ Проверка новой версии на порту $SMOKE_PORT (миграции БД применятся здесь, фоновые задачи выключены)"
(
  cd "$REL"
  SCHEDULER=off NODE_ENV=production PORT="$SMOKE_PORT" HOSTNAME=localhost TZ=Asia/Almaty \
    exec node --env-file="$ROOT/.env" server.js >"$REL/smoke.log" 2>&1
) &
SMOKE_PID=$!
if ! check_app "$SMOKE_PORT" 40; then
  echo "✗ Новая версия не прошла проверку — текущая версия продолжает работать, ничего не переключено."
  tail -n 40 "$REL/smoke.log" || true
  kill "$SMOKE_PID" 2>/dev/null || true
  wait "$SMOKE_PID" 2>/dev/null || true
  SMOKE_PID=""
  rm -rf "$REL"
  exit 1
fi
# Проверенная копия на $SMOKE_PORT остаётся работать, пока PM2 перезапускает основную: в nginx она — запасной сервер
# (backup в upstream mybook_app), и запросы в эти секунды идут к ней, а не в 502.

echo "→ Переключение на $(basename "$REL")"
PREV="$(readlink -f "$CURRENT" 2>/dev/null || true)"
ln -sfn "$REL" "$CURRENT"
pm2_apply

if ! check_app "$PORT" 30; then
  echo "✗ После переключения приложение не ответило."
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    echo "→ Откат на $(basename "$PREV")"
    ln -sfn "$PREV" "$CURRENT"
    pm2_apply
  fi
  echo "Логи: pm2 logs mybook --nostream --lines 100"
  exit 1
fi
echo "✓ MyBooks отвечает на localhost:$PORT ($(basename "$REL"))"
# Основная версия отвечает — запасная больше не нужна.
kill "$SMOKE_PID" 2>/dev/null || true
wait "$SMOKE_PID" 2>/dev/null || true
SMOKE_PID=""
rm -f "$REL/smoke.log"

# Прогрев: обложки рисуются на сервере при первом запросе (на снимках — до 1–3 с), а кэш живёт в памяти процесса и после
# каждого деплоя пуст. Прогреваем обложки, видимые на входных страницах, пока посетители не пришли (ошибки прогрева деплой не ломают).
warm_covers() {
  local page
  for page in / /login /kk /kk/login; do
    curl -fsS -m 20 "http://localhost:$PORT$page" 2>/dev/null | grep -oE '/api/covers/[^"&< ]+' || true
  done | sort -u | while read -r u; do
    curl -fsS -m 30 -o /dev/null -H "Accept-Encoding: br, gzip" "http://localhost:$PORT$u" 2>/dev/null || true
  done
}
warm_covers && echo "  обложки прогреты" || true

# Оставляем последние $KEEP релизов (текущий и предыдущий — всегда)
ls -1dt "$RELEASES"/*/ 2>/dev/null | sed 's:/$::' | tail -n +"$((KEEP + 1))" | while read -r old; do
  [ "$old" = "$(readlink -f "$CURRENT")" ] || [ "$old" = "$PREV" ] || { rm -rf "$old" && echo "  удалён старый релиз $(basename "$old")"; }
done

DEPLOY_OK=1
# Что вошло в релиз: коммиты от предыдущего релиза до этого.
PREV_SHA="$(basename "${PREV:-}" | sed -n 's/^[0-9]*-[0-9]*-//p')"
notify ok "$SHA" "$PREV_SHA" "$(basename "$REL")"
