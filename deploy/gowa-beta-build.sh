#!/usr/bin/env bash
# Сборка шлюза WhatsApp (GOWA) со звонками — бета из открытого PR aldinokemal/go-whatsapp-web-multidevice#892
# (библиотека purpshell/meowcaller, MIT). В релизах GOWA звонков нет, а на сервере нет Go и мало памяти для сборки,
# поэтому программа собирается здесь, в Docker, под Linux сервера (x86_64, glibc Ubuntu 24.04), и уезжает готовым файлом:
#
#   bash deploy/gowa-beta-build.sh                       # → dist/gowa-beta/whatsapp + whatsapp.sha256
#   scp dist/gowa-beta/whatsapp* сервер:~/mybook-sidecars/
#   на сервере: GOWA_BETA_BIN=~/mybook-sidecars/whatsapp bash deploy/sidecars.sh whatsapp
#
# Коммит зафиксирован: новая голова PR — это новый, непроверенный код с доступом к номеру магазина. Обновлять осознанно.
#
# Поверх PR — наши правки библиотеки звонков purpshell/meowcaller (deploy/gowa-beta/*.patch, подключаются через replace):
#   meowcaller-01-late-answer.patch — ответ на входящий не сразу, а через несколько секунд (сотрудник нажал «Ответить»):
#   библиотека шлёт звонящему <accept> только по его первому <mute_v2>, который приходит в первую секунду звонка, и при
#   позднем ответе звонящий так и оставался «звонит» — без звука в обе стороны. С правкой <accept> уходит сразу при ответе.
#   meowcaller-02-relay-election.patch — звонок без голоса собеседника (purpshell/meowcaller#37, #40): медиа-сервер звонка
#   выбирают по замерам задержки <relaylatency> обеих сторон. На входящих библиотека отвечала цифрами звонящего, на
#   исходящих не отвечала вовсе — выбор падал на местный сервер собеседника (Алматы), которого шлюзу в Европе не выдают.
#   Теперь шлюз в обе стороны «голосует» за сервер, на котором ждёт сам. Плюс чтение замеров с меткой 0x06 (iPhone) и
#   журнал служебных сообщений звонка на debug.
# и правки самого шлюза (deploy/gowa-beta/gowa-*.patch):
#   gowa-02-call-listen.patch — /call/listen: прослушка идущего звонка руководителем (только приём, копия обеих сторон).
#   gowa-01-call-diagnostics.patch — переменные окружения процесса шлюза: WHATSAPP_CALL_LOG_LEVEL=debug|info — подробный
#   журнал звонков, WHATSAPP_CALL_DIAG_DIR=<папка> — диагностика meowcaller (пишет и ключи звонка: только на время отладки).
# Обновлено 2026-10-30 (тот же набор, что у DoseWear, — описание каждой правки в DoseWear deploy/gowa-beta-build.sh):
#   GOWA — голова PR #892 bb2e921 (v9.7.0, симметричное преобразование звука, завершение звонка не ждёт медленных клиентов);
#   meowcaller: 00 — чужой PR #26 (шлюз слушает все медиа-серверы звонка: звонки на Android не глохнут), 01 — <accept> при
#   позднем ответе, 02 — голосование за медиа-сервер (исходящие в Казахстан), 03 — отказ своего устройства (Meta
#   @hosted.lid) не завершает входящий, 04 — стык #26 и 02, 05 — чужой PR #30 (кодер голоса ~2× быстрее), 06 — чужой PR
#   #45 (пакеты голоса по порядку, без щелчков).
set -euo pipefail

GOWA_BETA_REF="bb2e921f393f7058aeb92ca580a787593050eabb"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist/gowa-beta}"
command -v docker >/dev/null || { echo "Нужен Docker"; exit 1; }
mkdir -p "$OUT"

# glibc сборки (Debian bookworm, 2.36) не новее, чем на сервере (2.39): программа с CGO (sqlite) там запустится.
docker run --rm --platform linux/amd64 -v "$OUT:/out" -v "$ROOT/deploy/gowa-beta:/patches:ro" -e REF="$GOWA_BETA_REF" golang:1.26-bookworm bash -euo pipefail -c '
  git clone --quiet --filter=blob:none https://github.com/aldinokemal/go-whatsapp-web-multidevice.git /src
  cd /src && git fetch --quiet origin refs/pull/892/head && git checkout --quiet "$REF"
  for p in /patches/gowa-*.patch; do git apply -p1 "$p"; done
  cd src
  go mod download github.com/purpshell/meowcaller
  cp -r "$(go list -m -f "{{.Dir}}" github.com/purpshell/meowcaller)" /meowcaller && chmod -R u+w /meowcaller
  for p in /patches/meowcaller-*.patch; do (cd /meowcaller && git apply -p1 "$p"); done
  go mod edit -replace github.com/purpshell/meowcaller=/meowcaller
  CGO_ENABLED=1 go build -trimpath -ldflags="-w -s" -o /out/whatsapp .
  cd /out && sha256sum whatsapp > whatsapp.sha256
'
echo "✓ $OUT/whatsapp ($(cut -c1-12 "$OUT/whatsapp.sha256")…), GOWA PR #892 @ ${GOWA_BETA_REF:0:7} + правки: $(cd "$ROOT/deploy/gowa-beta" && ls *.patch | tr "\n" " ")"
