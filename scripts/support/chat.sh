#!/usr/bin/env bash
# Чаты-помощники сессии обращений на сервере (docs/support/server-session.md): отдельные сессии Claude Code в фоне с
# Remote Control — их видно в приложении Claude и на телефоне, у каждой свой контекст, который остаётся между
# заданиями. Главная сессия отдаёт им крупную работу по зонам («Вёрстка книги», «Обложка», «CRM»…) и пишет в уже
# открытый чат той же зоны, а не заводит новый.
#   bash scripts/support/chat.sh list                     — чаты: id, зона, занят/свободен
#   bash scripts/support/chat.sh ask "<зона>" "<задание>" — есть чат этой зоны — написать ему, нет — открыть новый
#   bash scripts/support/chat.sh new "<зона>" "<задание>" — всегда новый чат
#   bash scripts/support/chat.sh log <id>                 — последние строки чата
#   bash scripts/support/chat.sh stop <id>                — закрыть чат (разговор сохраняется, `ask` откроет новый)
# Итог помощник присылает главной сессии сам (SendMessage на «MyBooks · обращения»). Одновременно — не больше
# MYBOOK_CHATS_MAX (3) занятых помощников: сервер общий с сайтом.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL
DEV="${MYBOOK_DEV:-$HOME/mybook-dev}"
MAIN="${MYBOOK_CLAUDE_NAME:-MyBooks · обращения}"
MAX="${MYBOOK_CHATS_MAX:-3}"
PREFIX="Помощник · "
cd "$DEV"

# Фоновые чаты-помощники: [{id, sessionId, name, status}] из `claude agents --json`.
helpers() {
  claude agents --json 2>/dev/null | node -e '
    let d = ""; process.stdin.on("data", (c) => (d += c)).on("end", () => {
      const list = JSON.parse(d || "[]").filter((a) => a.kind === "background" && (a.name || "").startsWith(process.argv[1]));
      for (const a of list) console.log([a.id, a.sessionId, a.status, a.state || "", a.name.slice(process.argv[1].length)].join("\t"));
    });' "$PREFIX"
}

brief() {
  printf '%s\n\n%s\n\n%s' "Ты — помощник сессии обращений MyBooks на прод-сервере, зона «$1». Порядок работы и ограничения — AGENTS.md, docs/support/server-session.md, docs/support/README.md и твоя память; ~/mybook не правь, код — в ~/mybook-dev (коммит «(Обращение №N)», выкатка bash scripts/support/ship.sh), данные заказа — с бэкапом." \
    "Задание:" "$2

Когда закончишь (или если нужен ответ человека) — отправь итог сессии «$MAIN» через SendMessage: что сделал, коммиты, что проверить. Следующие задания этой зоны придут сюда же — держи контекст."
}

new_chat() {
  local busy
  busy="$(helpers | awk -F'\t' '$3 == "busy"' | wc -l)"
  [ "$busy" -lt "$MAX" ] || { echo "✗ Уже $busy занятых помощников (предел $MAX) — дождитесь или используйте ask в свободный чат" >&2; exit 1; }
  claude --bg --remote-control "$PREFIX$1" -n "$PREFIX$1" --permission-mode bypassPermissions "$(brief "$1" "$2")" 2>&1 | head -1
}

case "${1:-list}" in
  list)
    helpers | awk -F'\t' 'BEGIN { n = 0 } { n++; printf "%s  %-6s %-5s %s\n", $1, $3, $4, $5 } END { if (!n) print "помощников нет" }'
    ;;
  new)
    new_chat "${2:?зона}" "${3:?задание}"
    ;;
  ask)
    ZONE="${2:?зона}"; TASK="${3:?задание}"
    ROW="$(helpers | awk -F'\t' -v z="$ZONE" '$5 == z' | head -1)"
    if [ -n "$ROW" ]; then
      SID="$(cut -f2 <<<"$ROW")"; ID="$(cut -f1 <<<"$ROW")"
      # Тот же разговор: задание приходит следующим сообщением (занят — встанет в очередь).
      claude --bg --resume "$SID" "$TASK

Итог — снова в «$MAIN» через SendMessage." >/dev/null 2>&1
      echo "→ отправлено в чат «$ZONE» ($ID)"
    else
      new_chat "$ZONE" "$TASK"
    fi
    ;;
  log)
    claude logs "${2:?id}" 2>&1 | sed 's/\x1b\[[0-9;?]*[A-Za-z]//g' | tr -s ' ' | tail -40
    ;;
  stop)
    claude stop "${2:?id}"
    ;;
  *) sed -n '2,13p' "$0"; exit 2 ;;
esac
