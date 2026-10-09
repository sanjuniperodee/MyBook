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
pm2 start "$ROOT/deploy/ecosystem.config.cjs"
pm2 save

for i in $(seq 1 30); do
  if curl -fsS -m 5 "http://localhost:$PORT/api/health" 2>/dev/null | grep -q '"ok":true'; then echo "✓ MyBooks отвечает ($TARGET)"; exit 0; fi
  sleep 1
done
echo "✗ Приложение не ответило. Логи: pm2 logs mybook --nostream --lines 100"
exit 1
