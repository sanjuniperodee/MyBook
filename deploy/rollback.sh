#!/usr/bin/env bash
# Откат на предыдущий релиз (или на указанный): bash deploy/rollback.sh [имя-релиза]
# Список релизов: ls -1t releases. Миграции БД не откатываются (они только добавляют таблицы и колонки).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PORT="${MYBOOK_PORT:-3040}"

CUR="$(basename "$(readlink -f current)")"
TARGET="${1:-$(ls -1t releases | grep -v -x "$CUR" | head -1)}"
[ -n "$TARGET" ] && [ -d "releases/$TARGET" ] || { echo "Нет релиза «$TARGET». Доступные:"; ls -1t releases; exit 1; }

echo "→ Откат: $CUR → $TARGET"
ln -sfn "$ROOT/releases/$TARGET" current
pm2 reload deploy/ecosystem.config.cjs --update-env
pm2 save

for i in $(seq 1 30); do
  if curl -fsS -m 5 "http://localhost:$PORT/api/health" 2>/dev/null | grep -q '"ok":true'; then echo "✓ MyBooks отвечает ($TARGET)"; exit 0; fi
  sleep 1
done
echo "✗ Приложение не ответило. Логи: pm2 logs mybook --nostream --lines 100"
exit 1
