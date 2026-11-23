#!/usr/bin/env bash
# Скрипты лежат в ~/gopilot на сервере: scp scripts/perf/probe/* srv@<сервер>:gopilot/
# Пробный экземпляр текущего релиза на 127.0.0.1:3047: без фона, без миграций — только для замера памяти.
set -euo pipefail
PORT="${1:-3047}"; REL="${2:-$HOME/mybook-releases/current}"
rm -f ~/gopilot/mem-$PORT.jsonl*
cd "$REL"
PROBE_OUT=~/gopilot/mem-$PORT.jsonl PROBE_TRIGGER=~/gopilot/dump-$PORT \
SCHEDULER=off MYBOOK_BACKGROUND=worker SKIP_AUTO_MIGRATE=1 NODE_ENV=production PORT=$PORT HOSTNAME=localhost TZ=Asia/Almaty \
LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2 MALLOC_CONF=background_thread:true,dirty_decay_ms:1000,muzzy_decay_ms:0 \
PDF_WORKER=off \
nohup env ${EXTRA_ENV:-} node --env-file=$HOME/mybook/.env --require ~/gopilot/memprobe.cjs --heapsnapshot-signal=SIGUSR2 ${NODE_FLAGS:-} server.js > ~/gopilot/probe-$PORT.log 2>&1 &
echo $! > ~/gopilot/probe-$PORT.pid
echo "pid $(cat ~/gopilot/probe-$PORT.pid)"
