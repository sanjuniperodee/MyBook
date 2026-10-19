#!/usr/bin/env bash
# Выкатка из GitHub Actions (.github/workflows/deploy.yml): готовый архив сборки → сервер → deploy/deploy.sh --artifact.
# Сборка на сервере не идёт: она не помещалась в его память рядом с работающими сайтами.
# Запуск на машине GitHub из корня репозитория: bash deploy/ci-run.sh <архив.tgz>. Ключ — ~/.ssh/deploy (готовит workflow).
set -euo pipefail
ARCHIVE="${1:?укажите архив сборки}"
HOST="${DEPLOY_HOST:-sanjuniperodee@94.131.93.92}"
BRANCH="${DEPLOY_BRANCH:-master}"
SHA="$(git rev-parse HEAD)"
SHORT="${SHA:0:7}"
remote() { ssh -i ~/.ssh/deploy -o BatchMode=yes -o ServerAliveInterval=30 "$HOST" "$@"; }

echo "→ Архив на сервер ($(du -h "$ARCHIVE" | cut -f1))"
remote 'mkdir -p ~/mybook-incoming'
scp -q -i ~/.ssh/deploy -o BatchMode=yes "$ARCHIVE" "$HOST:mybook-incoming/$SHORT.tgz"

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
setsid nohup bash -c "bash deploy/deploy.sh --artifact ~/mybook-incoming/$SHORT.tgz > $LOG 2>&1; echo \$? > $LOG.exit; rm -f ~/mybook-incoming/$SHORT.tgz" < /dev/null > /dev/null 2>&1 &
sleep 1
tail -n +1 -F "$LOG" 2>/dev/null &
TAIL=$!
until [ -f "$LOG.exit" ]; do sleep 3; done
sleep 1
kill "$TAIL" 2>/dev/null
exit "$(cat "$LOG.exit")"
REMOTE
