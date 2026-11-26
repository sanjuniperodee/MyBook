#!/usr/bin/env bash
# Откат на предыдущий релиз (или на указанный): bash deploy/rollback.sh [имя-релиза]
# Список релизов: ls -1t ../mybook-releases/releases. Миграции БД не откатываются (они только добавляют таблицы и колонки).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PORT="${MYBOOK_PORT:-3040}"
BASE="${MYBOOK_RELEASES_DIR:-$(dirname "$ROOT")/mybook-releases}"
cd "$BASE"

CUR="$(basename "$(readlink -f current)")"
TARGET="${1:-$(ls -1t releases | grep -v -x "$CUR" | head -1)}"
[ -n "$TARGET" ] && [ -d "releases/$TARGET" ] || { echo "Нет релиза «$TARGET». Доступные:"; ls -1t releases; exit 1; }

echo "→ Откат: $CUR → $TARGET"
ln -sfn "$BASE/releases/$TARGET" current
# PM2 при reload не перечитывает cwd, поэтому процесс пересоздаётся
pm2 delete mybook >/dev/null 2>&1 || true
# Кэш предпросмотров — пока процесс остановлен (пересоберётся по запросу): с 22.10 cache/preview/<книга>/<отпечаток>.pdf —
# сборка без водяного знака, а код до этого отдаёт тот же файл как предпросмотр со знаком.
STORAGE_DIR="$({ sed -n 's/^STORAGE_DIR=//p' "$ROOT/.env" 2>/dev/null || true; } | tail -n 1 | tr -d "\"'\r")"
case "$STORAGE_DIR" in /*) rm -rf "$STORAGE_DIR/cache/preview" "$STORAGE_DIR/cache/pages" && echo "  кэш предпросмотров удалён" ;; esac
# Сайт выключен файлом-флагом ~/mybook-flags/site (сайт на Vercel) — в конфиге его нет, запускать нечего.
if node -e 'process.exit(require(process.argv[1]).apps.some((a) => a.name === "mybook") ? 0 : 1)' "$ROOT/deploy/ecosystem.config.cjs"; then
  pm2 start "$ROOT/deploy/ecosystem.config.cjs" --only mybook
fi
# Бэкенд того же релиза: сайт ходит в БД только через mybook-api (ADR 0013), фон — в mybook-worker.
for app in mybook-api mybook-worker; do
  if pm2 describe "$app" >/dev/null 2>&1; then pm2 delete "$app" >/dev/null 2>&1 || true; pm2 start "$ROOT/deploy/ecosystem.config.cjs" --only "$app"; fi
done
# Бэкенд на Nest (ADR 0014) — из того же релиза; в релизе до него backend.mjs нет — процесс просто снимается.
pm2 delete mybook-backend >/dev/null 2>&1 || true
if node -e 'process.exit(require(process.argv[1]).apps.some((a) => a.name === "mybook-backend") ? 0 : 1)' "$ROOT/deploy/ecosystem.config.cjs"; then
  pm2 start "$ROOT/deploy/ecosystem.config.cjs" --only mybook-backend
fi
pm2 save

for i in $(seq 1 30); do
  if curl -fsS -m 5 "http://localhost:$PORT/api/health" 2>/dev/null | grep -q '"ok":true'; then echo "✓ MyBooks отвечает ($TARGET)"; exit 0; fi
  sleep 1
done
echo "✗ Приложение не ответило. Логи: pm2 logs mybook --nostream --lines 100"
exit 1
