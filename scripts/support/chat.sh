#!/usr/bin/env bash
# Чаты-помощники сессии обращений на сервере (docs/support/server-session.md): отдельные сессии Claude Code в фоне с
# Remote Control — их видно в приложении Claude и на телефоне, у каждой свой контекст, который остаётся между
# заданиями. Главная сессия отдаёт им крупную работу по зонам («Вёрстка книги», «Обложка», «CRM»…) и пишет в уже
# открытый чат той же зоны, а не заводит новый.
#   bash scripts/support/chat.sh list                     — чаты: id, зона, занят/свободен
#   bash scripts/support/chat.sh ask "<зона>" "<задание>" — чат зоны открыт → скажет, кому написать SendMessage (код 3);
#                                                           закрыт → продолжит тот же разговор с заданием; нет → новый
#   bash scripts/support/chat.sh new "<зона>" "<задание>" — всегда новый чат
#   bash scripts/support/chat.sh log <id>                 — последние строки чата
#   bash scripts/support/chat.sh stop <id>                — закрыть чат (разговор сохраняется — `ask` его продолжит)
# Итог помощник присылает главной сессии сам (SendMessage на «MyBooks · обращения»). Одновременно — не больше
# MYBOOK_CHATS_MAX (2) открытых помощников: каждый ~0,3–0,5 ГБ памяти, а сервер общий с сайтом. Зона → разговор
# помнится в ~/.mybook-chats.tsv, поэтому закрытый чат продолжается с тем же контекстом.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL
DEV="${MYBOOK_DEV:-$HOME/mybook-dev}"
MAIN="${MYBOOK_CLAUDE_NAME:-MyBooks · обращения}"
MAX="${MYBOOK_CHATS_MAX:-2}"
REG="$HOME/.mybook-chats.tsv"
touch "$REG"
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

# Открыто помощников сейчас — не больше MAX.
room() {
  local open
  open="$(helpers | wc -l)"
  [ "$open" -lt "$MAX" ] || { echo "✗ Открыто $open помощников (предел $MAX) — закройте свободный (stop <id>) или напишите открытому" >&2; exit 1; }
}

new_chat() {
  room
  local out sid
  out="$(claude --bg --remote-control "$PREFIX$1" -n "$PREFIX$1" --permission-mode bypassPermissions "$(brief "$1" "$2")" 2>&1)" || { echo "$out" >&2; exit 1; }
  sid="$(helpers | awk -F'\t' -v z="$1" '$5 == z { print $2 }' | tail -1)"
  [ -n "$sid" ] && { grep -v "^$1	" "$REG" > "$REG.tmp" || true; printf '%s\t%s\n' "$1" "$sid" >> "$REG.tmp"; mv "$REG.tmp" "$REG"; }
  grep -m1 '^backgrounded' <<<"$out" || echo "$out" | tail -1
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
    SID="$(awk -F'\t' -v z="$ZONE" '$1 == z { print $2 }' "$REG" | tail -1)"
    if [ -n "$ROW" ]; then
      # Открытый чат принимает новое задание только сообщением между сессиями (повторный запуск сделал бы копию).
      echo "Чат «$ZONE» открыт ($(cut -f1 <<<"$ROW"), $(cut -f3 <<<"$ROW")): отправь задание SendMessage на «$PREFIX$ZONE»."
      exit 3
    elif [ -n "$SID" ] && ls "$HOME"/.claude/projects/*/"$SID".jsonl >/dev/null 2>&1; then
      room
      # Закрытый чат этой зоны — тот же разговор и контекст, задание — следующим сообщением.
      claude --bg --resume "$SID" --remote-control "$PREFIX$ZONE" -n "$PREFIX$ZONE" --permission-mode bypassPermissions "$TASK

Итог — снова в «$MAIN» через SendMessage." 2>&1 | grep -m1 '^backgrounded' || true
      echo "→ продолжен чат «$ZONE»"
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
