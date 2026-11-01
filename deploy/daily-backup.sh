#!/usr/bin/env bash
# Ежедневный бэкап баз (MyBooks, MyStudy, my-test, DoseWear) → Telegram-группа через бота. Запускает cron в 04:00.
# Настройки — в ~/.backup.env (chmod 600): TG_TOKEN, TG_CHAT, необязательно BACKUP_PASSPHRASE (шифрование gpg).
# На диске остаются 7 последних копий в ~/db-backups; сбой или неотправленный файл — сообщение в ту же группу.
set -uo pipefail
. "$HOME/.backup.env"
DIR="$HOME/db-backups"; mkdir -p "$DIR"; chmod 700 "$DIR"
STAMP="$(date +%Y%m%d-%H%M)"
API="https://api.telegram.org/bot$TG_TOKEN"
say() { curl -s -m 30 "$API/sendMessage" -d chat_id="$TG_CHAT" --data-urlencode text="$1" >/dev/null || true; }
fail=0

# имя:файл .env с DATABASE_URL
for item in mybook:$HOME/mybook/.env mystudy:$HOME/mystudy/.env mytest:$HOME/bilimland/apps/api/.env dosewear:$HOME/dosewear/.env; do
  name="${item%%:*}"; env="${item#*:}"
  url="$(grep -m1 '^DATABASE_URL=' "$env" 2>/dev/null | cut -d= -f2- | tr -d '"'"'")"
  [ -n "$url" ] || { say "⚠ бэкап $name: нет DATABASE_URL в $env"; fail=1; continue; }
  out="$DIR/$name-$STAMP.sql.gz"
  # prisma-адреса бывают с ?schema=… — pg_dump их не понимает
  if ! pg_dump "${url%%\?*}" 2>"$DIR/.err" | gzip > "$out" || [ "$(stat -c%s "$out")" -lt 1000 ]; then
    say "⚠ бэкап $name не снялся: $(head -c 300 "$DIR/.err")"; rm -f "$out"; fail=1; continue
  fi
  send="$out"
  if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
    gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" -c -o "$out.gpg" "$out" && send="$out.gpg"
  fi
  if [ "$(stat -c%s "$send")" -gt 49000000 ]; then say "⚠ бэкап $name ($(du -h "$send" | cut -f1)) больше лимита Telegram 50 МБ — остался только на сервере"; fail=1; continue; fi
  if ! curl -s -m 300 "$API/sendDocument" -F chat_id="$TG_CHAT" -F document=@"$send" -F caption="$name $(date '+%F %H:%M') · $(du -h "$send" | cut -f1)" | grep -q '"ok":true'; then
    say "⚠ бэкап $name снят, но не отправился в Telegram (файл $send на сервере)"; fail=1
  fi
  [ "$send" = "$out" ] || rm -f "$send"
done
# хранить 7 последних копий каждой базы
for name in mybook mystudy mytest dosewear; do ls -1t "$DIR/$name-"*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm -f; done
exit $fail
