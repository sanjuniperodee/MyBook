#!/usr/bin/env bash
# Выкатка с самого сервера, без GitHub Actions — для сессии Claude в ~/mybook-dev (docs/support/server-session.md).
#   bash scripts/support/ship.sh           — проверки по изменённому, пуш в master, сборка и выкатка на сервере
#   bash scripts/support/ship.sh --full    — то же, но все тесты (как в CI)
#   bash scripts/support/ship.sh --no-checks — без проверок (только если они уже прошли на этом же коммите)
#
# Порядок: всё закоммичено → свежий master (rebase) → типы, линтер изменённых файлов, тесты → пуш в master с
# [skip ci] (CI второй раз не выкатывает) → bash ~/mybook/deploy/deploy.sh master: сборка на сервере с ограничением
# ресурсов, smoke-тест, переключение релиза, откат при сбое; после выкатки обращения из коммитов закрываются сами.
# Проверки идут с низким приоритетом процессора и диска — сайт рядом продолжает отвечать.
set -euo pipefail
MODE="${1:-}"
DEV="$(cd "$(dirname "$0")/../.." && pwd)"
LIVE="${MYBOOK_LIVE:-$HOME/mybook}"
LOG_DIR="$HOME/mybook-ship-logs"
cd "$DEV"
[ "$DEV" != "$LIVE" ] || { echo "✗ Запускайте из рабочей копии (~/mybook-dev), а не из ~/mybook — её собирает выкатка"; exit 2; }

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "✗ Есть незакоммиченные изменения — сначала коммит (с «Обращение №N», если это обращение):"
  git status --short --untracked-files=no
  exit 2
fi

echo "→ Свежий master"
git fetch -q origin master
git rebase -q origin/master || { git rebase --abort; echo "✗ Конфликт с master — разберите вручную"; exit 1; }
AHEAD="$(git rev-list --count origin/master..HEAD)"
[ "$AHEAD" -gt 0 ] || { echo "Нечего выкатывать: HEAD = origin/master"; exit 0; }
echo "  коммитов к выкатке: $AHEAD"; git log --oneline origin/master..HEAD | sed 's/^/  /'

low() { nice -n 15 ionice -c 3 "$@"; }
if [ "$MODE" != "--no-checks" ]; then
  # Зависимости — как на проде: npm ci только когда поменялся package-lock.json.
  LOCK_HASH="$(sha256sum package-lock.json | cut -d' ' -f1)"
  if [ "$(cat node_modules/.ship-lock-hash 2>/dev/null)" != "$LOCK_HASH" ]; then
    echo "→ Зависимости"
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 low npm ci --no-audit --no-fund >/dev/null
    echo "$LOCK_HASH" > node_modules/.ship-lock-hash
  fi
  CHANGED="$(git diff --name-only --diff-filter=ACMR origin/master..HEAD)"
  if grep -q '^src/modules/' <<<"$CHANGED"; then
    node scripts/microservices/module-map.mjs >/dev/null
    git diff --quiet docs/modules.md || { echo "✗ Карта модулей устарела: закоммитьте docs/modules.md (уже перегенерирована)"; exit 1; }
  fi
  echo "→ Типы"
  low npx tsc --noEmit
  LINT="$(grep -E '\.(ts|tsx|js|mjs|cjs)$' <<<"$CHANGED" | while read -r f; do [ -f "$f" ] && echo "$f"; done || true)"
  if [ -n "$LINT" ]; then echo "→ Линтер"; low npx eslint $LINT; fi
  if [ "$MODE" = "--full" ]; then
    echo "→ Все тесты"
    low npx vitest run
  else
    # Тесты, которые зависят от изменённых файлов, и всегда — архитектура, карта модулей, i18n.
    echo "→ Тесты по изменённому"
    low npx vitest run --changed origin/master --passWithNoTests
    low npx vitest run tests/architecture.test.ts tests/module-map.test.ts tests/i18n.test.ts
  fi
fi

# [skip ci] в последнем коммите: GitHub Actions не запускает вторую выкатку того же кода.
MSG="$(git log -1 --format=%B)"
if ! grep -q '\[skip ci\]' <<<"$MSG"; then
  git commit -q --amend -m "$MSG" -m "[skip ci] выкачено с сервера: scripts/support/ship.sh"
fi
echo "→ Пуш в master"
git push -q origin HEAD:master

mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD).log"
echo "→ Выкатка на сервере (лог: $LOG)"
if (cd "$LIVE" && bash deploy/deploy.sh master) >"$LOG" 2>&1; then
  tail -5 "$LOG"
  echo "✓ Выкачено: $(git rev-parse --short HEAD)"
else
  tail -30 "$LOG"
  echo "✗ Выкатка не прошла — работает прежний релиз. Лог: $LOG"
  exit 1
fi
