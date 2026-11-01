#!/usr/bin/env bash
# Уведомления об успешных выкатках в Telegram (раз в минуту из cron): сервер смотрит, сменилась ли рабочая версия проекта.
#   MyBooks, my-test → группа (TG_CHAT); DoseWear → TG_DOSEWEAR_CHAT (Салават); MyStudy → TG_STUDY_CHAT (личные сообщения).
# Чат не задан в ~/.backup.env — проект пропускается. Состояние — ~/.deploy-watch/<проект>. Ошибки выкаток не шлёт
# (у неудачной выкатки рабочая версия не меняется). Скрипт ничего не меняет в проектах, git только читает.
set -uo pipefail
. "$HOME/.backup.env"
STATE="$HOME/.deploy-watch"; mkdir -p "$STATE"
exec 8>"$STATE/.lock"; flock -n 8 || exit 0
API="https://api.telegram.org/bot$TG_TOKEN"

send() { # чат, текст
  curl -s -m 30 "$API/sendMessage" -d chat_id="$1" --data-urlencode text="$2" | grep -q '"ok":true'
}
lines() { # репозиторий, прошлый, новый → заголовки коммитов
  local r
  if [ -n "$2" ] && [ "$2" != "$3" ]; then r="$2..$3"; else r="$3~1..$3"; fi
  git -C "$1" log --no-merges --format='• %s' "$r" 2>/dev/null | head -12
}
check() { # проект, название, репозиторий, текущая_версия, чат, ссылка
  local key="$1" title="$2" repo="$3" cur="$4" chat="$5" url="$6" prev
  [ -n "$cur" ] || return 0
  prev="$(cat "$STATE/$key" 2>/dev/null || true)"
  [ "$prev" = "$cur" ] && return 0
  if [ -z "$prev" ]; then echo "$cur" > "$STATE/$key"; return 0; fi   # первый запуск — только запомнить
  [ -n "$chat" ] || return 0
  local txt; txt="✅ $title выкачено: ${cur:0:7}"$'\n'"$(lines "$repo" "$prev" "$cur")"
  [ -z "$url" ] || txt="$txt"$'\n'"$url"
  send "$chat" "$txt" && echo "$cur" > "$STATE/$key"
}
rel() { basename "$(readlink -f "$HOME/$1/current" 2>/dev/null)" | sed 's/.*-//'; }

check mybook   "MyBooks"  "$HOME/mybook"   "$(rel mybook-releases)"   "${TG_CHAT:-}"          "https://mybooks.kz"
check mystudy  "MyStudy"  "$HOME/mystudy"  "$(rel mystudy-releases)"  "${TG_STUDY_CHAT:-}"    "https://study.my-test.kz"
check dosewear "DoseWear" "$HOME/dosewear" "$(rel dosewear-releases)" "${TG_DOSEWEAR_CHAT:-}" ""

# my-test: код обновляется до сборки, поэтому ждём, пока выкатка закончится (замок свободен) и сайт ответит
if flock -n 7 7>"$HOME/.mytest-deploy.lock"; then
  if [ "$(curl -s -m 10 -o /dev/null -w '%{http_code}' localhost:3000/)" = 200 ]; then
    check mytest "my-test" "$HOME/bilimland" "$(git -C "$HOME/bilimland" rev-parse HEAD 2>/dev/null)" "${TG_CHAT:-}" "https://my-test.kz"
  fi
fi
