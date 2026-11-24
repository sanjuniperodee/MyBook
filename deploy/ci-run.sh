#!/usr/bin/env bash
# Выкатка из GitHub Actions (.github/workflows/deploy.yml): готовый архив сборки → сервер → deploy/deploy.sh --artifact.
# Сборка на сервере не идёт: она не помещалась в его память рядом с работающими сайтами.
# Запуск на машине GitHub из корня репозитория: bash deploy/ci-run.sh <архив.tgz>. Ключ — ~/.ssh/deploy (готовит workflow).
set -euo pipefail
ARCHIVE="${1:?укажите архив сборки}"
HOST="${DEPLOY_HOST:-srv@185.102.75.191}"
BRANCH="${DEPLOY_BRANCH:-master}"
SHA="$(git rev-parse HEAD)"
SHORT="${SHA:0:7}"
remote() { ssh -i ~/.ssh/deploy -o BatchMode=yes -o ServerAliveInterval=30 "$HOST" "$@"; }

# Релиз на сервер — rsync папкой против текущего релиза (--link-dest): одинаковые файлы (node_modules, шрифты, бинарник Go)
# на сервере становятся жёсткими ссылками на текущий релиз, по сети идут только изменённые и сжатыми. Архив целиком
# (160 МБ) по каналу GitHub → сервер шёл до 8 минут (24.11). Сравнение — по содержимому (-c): время файлов у каждой
# сборки новое, а -t не передаём, чтобы ссылки ставились. Брошенные выкатками папки старше 2 часов — удаляются.
LOCAL="$(mktemp -d)"
tar -xzf "$ARCHIVE" -C "$LOCAL"
echo "→ Релиз на сервер: rsync против текущего ($(du -sh "$LOCAL" | cut -f1) в релизе)"
remote 'mkdir -p ~/mybook-incoming && find ~/mybook-incoming -mindepth 1 -maxdepth 1 -mmin +120 -exec rm -rf {} +'
BASE="$(remote 'readlink -f ~/mybook-releases/current 2>/dev/null || true')"
rsync -rlpcz --delete --stats ${BASE:+--link-dest="$BASE"} -e "ssh -i $HOME/.ssh/deploy -o BatchMode=yes -o ServerAliveInterval=30" \
  "$LOCAL/" "$HOST:mybook-incoming/$SHORT/" | grep -E "^(Number of regular files transferred|Total transferred file size|Total bytes sent)" || true
rm -rf "$LOCAL"

# Код обновляется отдельной командой, до запуска deploy.sh: bash читает скрипт по ходу выполнения, и смена файла
# посреди выкатки ломала бы её. Если на сервере уже более новый коммит, deploy.sh увидит расхождение с архивом и откажется.
echo "→ Код на сервере → $SHORT"
remote "cd ~/mybook && git fetch -q origin $BRANCH && git checkout -q $BRANCH && git merge -q --ff-only $SHA"

# Выкатка идёт на сервере сама по себе (setsid): обрыв связи с GitHub её не прерывает. Здесь только читаем лог до итога.
echo "→ deploy/deploy.sh --artifact (лог: ~/mybook-deploy-$SHORT.log)"
remote bash -s -- "$SHORT" <<'REMOTE'
set -u
SHORT="$1"
LOG=~/mybook-deploy-$SHORT.log
rm -f "$LOG.exit"
cd ~/mybook
setsid nohup bash -c "bash deploy/deploy.sh --artifact ~/mybook-incoming/$SHORT > $LOG 2>&1; echo \$? > $LOG.exit; rm -rf ~/mybook-incoming/$SHORT" < /dev/null > /dev/null 2>&1 &
sleep 1
tail -n +1 -F "$LOG" 2>/dev/null &
TAIL=$!
until [ -f "$LOG.exit" ]; do sleep 3; done
sleep 1
kill "$TAIL" 2>/dev/null
exit "$(cat "$LOG.exit")"
REMOTE
