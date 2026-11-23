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

# Уборка раз в час: старые вложения обращений, логи выкаток, разговоры и забытые рабочие копии. Раз в неделю
# (ночь на понедельник, по Алматы) — новый разговор, если сессия ничего не делает: длинный разговор после многих
# сжатий отвечает хуже, а всё нужное — в базе обращений и в памяти (~/.claude/projects/*/memory).
PROJECTS="$HOME/.claude/projects/$(printf %s "$DEV" | tr / -)"
last_tidy=0
tidy() {
  find /tmp/mybooks-support -mindepth 1 -maxdepth 1 -mtime +3 -exec rm -rf {} + 2>/dev/null
  find "$HOME/mybook-ship-logs" -type f -mtime +30 -delete 2>/dev/null
  # Разговоры старше 30 дней (кроме текущего) — память и база обращений остаются.
  find "$PROJECTS" -maxdepth 1 -name '*.jsonl' -mtime +30 ! -name "$(cat "$ID_FILE" 2>/dev/null).jsonl" -delete 2>/dev/null
  # Рабочие копии субагентов: без незакоммиченных правок и старше 2 дней — убрать, остальное оставить человеку.
  git -C "$DEV" worktree prune 2>/dev/null
  git -C "$DEV" worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p' | tail -n +2 | while read -r wt; do
    [ -n "$(find "$wt" -maxdepth 0 -mtime +2 2>/dev/null)" ] || continue
    [ -z "$(git -C "$wt" status --porcelain 2>/dev/null)" ] || continue
    git -C "$DEV" worktree remove "$wt" 2>/dev/null && echo "$(date '+%F %T') убрана рабочая копия $wt"
  done
  # Новый разговор раз в неделю: понедельник 03–05 по Алматы, сессия свободна, прошло больше 6 дней.
  if [ "$(TZ=Asia/Almaty date +%u)" = 1 ] && [ "$(TZ=Asia/Almaty date +%H)" -ge 3 ] && [ "$(TZ=Asia/Almaty date +%H)" -lt 5 ] \
    && [ -n "$(find "$ID_FILE" -mtime +6 2>/dev/null)" ] && tmux has-session -t "$TMUX_NAME" 2>/dev/null \
    && ! tmux capture-pane -p -t "$TMUX_NAME" | grep -q "esc to interrupt"; then
    echo "$(date '+%F %T') неделя прошла — начинаю новый разговор"
    tmux kill-session -t "$TMUX_NAME"
    rm -f "$ID_FILE"
  fi
}

while true; do
  if [ $(( $(date +%s) - last_tidy )) -ge 3600 ]; then tidy; last_tidy=$(date +%s); fi
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
      "$CLAUDE $ARGS --remote-control $(printf %q "$NAME") -n $(printf %q "$NAME") --permission-mode bypassPermissions $INTRO; echo 'сессия завершилась'; sleep 5"
  fi
  sleep 20
done
