#!/usr/bin/env bash
# Раздатчик обращений (pm2: mybook-support-dispatch, docs/support/server-session.md).
# Раз в минуту спрашивает базу о новых обращениях и передаёт каждое в сессию Claude (tmux mybook-claude) сообщением
# «обращение N» — сессии не нужно самой держать слежение. Последний переданный номер — в ~/.mybook-support-last;
# сессии нет (вход, перезапуск) — ждёт и номер не двигает, ничего не теряется.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
TMUX_NAME="${MYBOOK_CLAUDE_TMUX:-mybook-claude}"
STATE="${MYBOOK_SUPPORT_STATE:-$HOME/.mybook-support-last}"
EVERY="${MYBOOK_SUPPORT_EVERY:-60}"

if [ ! -f "$STATE" ]; then
  # Первый запуск: всё, что уже есть, считается разобранным.
  bash "$DIR/ticket.sh" since 0 2>/dev/null | tail -1 > "$STATE"
  echo "$(date '+%F %T') старт: последнее обращение №$(cat "$STATE")"
fi

while true; do
  LAST="$(cat "$STATE" 2>/dev/null)"; LAST="${LAST:-0}"
  NEW="$(bash "$DIR/ticket.sh" since "$LAST" 2>/dev/null)"
  if [ -n "$NEW" ]; then
    if tmux has-session -t "$TMUX_NAME" 2>/dev/null; then
      for n in $NEW; do
        echo "$(date '+%F %T') передаю обращение №$n"
        tmux send-keys -t "$TMUX_NAME" -l "Новое обращение №$n — разбери по docs/support/README.md (bash scripts/support/ticket.sh show $n) и отчитайся."
        sleep 1
        tmux send-keys -t "$TMUX_NAME" Enter
        echo "$n" > "$STATE"
        sleep 2
      done
    else
      echo "$(date '+%F %T') есть новые ($NEW), но сессии Claude нет — жду"
    fi
  fi
  sleep "$EVERY"
done
