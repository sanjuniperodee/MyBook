#!/usr/bin/env bash
# Файлы клиентов (MyBooks, MyStudy, DoseWear) → Telegram-группа через бота, по частям до 48 МБ (лимит бота 50 МБ).
# Первый запуск — полная копия, дальше раз в сутки только новые и изменённые файлы (отметка ~/.media-backup.last).
# Восстановление: скачать части из группы, склеить по порядку (cat media-*.partNN > media.tar.gz), распаковать tar -xzf
# в каталог хранилища; сначала полная копия, затем приращения по датам. Кэш (cache/) не копируется — пересоздаётся.
# Настройки — ~/.backup.env: TG_TOKEN, TG_CHAT, необязательно BACKUP_PASSPHRASE (шифрование gpg перед отправкой).
set -uo pipefail
. "$HOME/.backup.env"
exec 8>"$HOME/.media-backup.lock"; flock -n 8 || exit 0
API="https://api.telegram.org/bot$TG_TOKEN"
say() { curl -s -m 30 "$API/sendMessage" -d chat_id="$TG_CHAT" --data-urlencode text="$1" >/dev/null || true; }
MARK="$HOME/.media-backup.last"
STAMP="$(date +%Y%m%d-%H%M)"
WORK="$(mktemp -d "$HOME/.media-backup.XXXXXX")"; trap 'rm -rf "$WORK"' EXIT
START="$(mktemp "$HOME/.media-backup.start.XXXXXX")"

# Относительные пути от домашней папки: у каждого проекта свой каталог хранилища
: > "$WORK/list"
for d in mybook-storage dosewear-storage; do   # файлы MyStudy уходят с его базой в личку (daily-backup.sh)
  [ -d "$HOME/$d" ] || continue
  if [ -f "$MARK" ]; then find "$HOME/$d" -path "$HOME/$d/cache" -prune -o -type f -newer "$MARK" -printf '%P\n' | sed "s|^|$d/|" >> "$WORK/list"
  else find "$HOME/$d" -path "$HOME/$d/cache" -prune -o -type f -printf '%P\n' | sed "s|^|$d/|" >> "$WORK/list"; fi
done
N=$(wc -l < "$WORK/list")
if [ "$N" -eq 0 ]; then rm -f "$START"; exit 0; fi
KIND=$([ -f "$MARK" ] && echo "приращение" || echo "полная копия")

tar -C "$HOME" -czf - -T "$WORK/list" 2>/dev/null > "$WORK/media.tar.gz"
OUT="$WORK/media.tar.gz"
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" -c -o "$OUT.gpg" "$OUT" && rm -f "$OUT" && OUT="$OUT.gpg"
fi
split -b 48000000 -d -a 3 "$OUT" "$WORK/part."
PARTS=$(ls "$WORK"/part.* | wc -l)
say "📦 Медиа: $KIND $STAMP — $N файлов, $(du -h "$OUT" | cut -f1), частей: $PARTS"
fail=0; i=0
for f in "$WORK"/part.*; do
  i=$((i+1)); name="media-$STAMP.part$(printf %03d $i)of$(printf %03d $PARTS)"
  ok=0
  for try in 1 2 3; do
    if curl -s -m 600 "$API/sendDocument" -F chat_id="$TG_CHAT" -F "document=@$f;filename=$name" -F caption="$name" | grep -q '"ok":true'; then ok=1; break; fi
    sleep 10
  done
  [ "$ok" = 1 ] || { fail=1; say "⚠ медиа-бэкап: часть $i из $PARTS не отправилась"; break; }
  sleep 4   # лимит Telegram — не больше 20 сообщений в минуту в группу
done
if [ "$fail" = 0 ]; then touch -r "$START" "$MARK"; say "✅ Медиа $STAMP отправлено ($PARTS ч.)"; fi
rm -f "$START"
exit $fail
