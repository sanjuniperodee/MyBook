#!/usr/bin/env bash
# Сторож сессии Claude на сервере (pm2: mybook-claude, docs/support/server-session.md).
# Держит в tmux живую сессию Claude Code с Remote Control в ~/mybook-dev: её открывают из приложения Claude
# (Code → список сессий) и с телефона, а Mac для работы не нужен. Упала или вышла — поднимает снова, продолжая тот же
# разговор (--resume по id из ~/.mybook-claude-session-id; удалить файл — начать новый). Нет входа в claude.ai — ждёт и пишет об этом в лог pm2.
set -uo pipefail
DEV="${MYBOOK_DEV:-$HOME/mybook-dev}"
TMUX_NAME="${MYBOOK_CLAUDE_TMUX:-mybook-claude}"
NAME="${MYBOOK_CLAUDE_NAME:-MyBooks · обращения}"
CLAUDE="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
ID_FILE="$HOME/.mybook-claude-session-id"
INTRO_TEXT="Ты — сессия обращений MyBooks на прод-сервере (папка ~/mybook-dev). Прочитай AGENTS.md, docs/support/server-session.md, docs/support/README.md, скилл .claude/skills/obrashenie и свою память. Новые обращения тебе присылает раздатчик сообщением «Новое обращение №N» — сам watch.sh не запускай. Каждое: понять, что нужно на самом деле (сверить с перепиской клиента, место в интерфейсе, правильно ли так делать), думать шире просьбы, решения принимать самому; данные заказа — бэкап и правка здесь, код — коммит «(Обращение №N)» и bash scripts/support/ship.sh. После каждого — коротко отчитайся в этом чате. Сейчас просто подтверди, что готов."
export PATH="$HOME/.local/bin:$PATH"
# Remote Control работает только со входом claude.ai: ключи API в окружении его выключают.
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL

while true; do
  if ! "$CLAUDE" auth status >/dev/null 2>&1; then
    echo "$(date '+%F %T') нужен вход: ssh на сервер и «claude auth login» (аккаунт claude.ai)"
    sleep 60
    continue
  fi
  if ! tmux has-session -t "$TMUX_NAME" 2>/dev/null; then
    # Первый запуск — новый разговор со своим id; после падения или перезагрузки — тот же разговор по id (не
    # «последний в папке»: там бывают и вспомогательные сессии).
    # Разговор с этим id так и не записался (упал на первом же запуске) — начать его заново с тем же id.
    if [ -s "$ID_FILE" ] && ls "$HOME"/.claude/projects/*/"$(cat "$ID_FILE")".jsonl >/dev/null 2>&1; then
      ARGS="--resume $(cat "$ID_FILE")"
      INTRO=""
    else
      [ -s "$ID_FILE" ] || cat /proc/sys/kernel/random/uuid > "$ID_FILE"
      ARGS="--session-id $(cat "$ID_FILE")"
      INTRO="$(printf %q "$INTRO_TEXT")"
    fi
    echo "$(date '+%F %T') запускаю сессию: $ARGS"
    tmux new-session -d -s "$TMUX_NAME" -x 220 -y 50 -c "$DEV" \
      "$CLAUDE $ARGS --remote-control $(printf %q "$NAME") --permission-mode bypassPermissions $INTRO; echo 'сессия завершилась'; sleep 5"
  fi
  sleep 20
done
