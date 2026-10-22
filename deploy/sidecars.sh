#!/usr/bin/env bash
# Сервисы рядом с сайтом на сервере с PM2 (без Docker): оплата Kaspi Pay и свой шлюз WhatsApp.
# Запуск на сервере из корня репозитория: bash deploy/sidecars.sh [kaspi] [whatsapp]   (без аргументов — оба)
#
#   kaspi    — kaspi-pos-automation (MIT, github.com/tapter-dev/kaspi-pos-automation): счета и QR Kaspi Pay от имени кассира.
#   whatsapp — GOWA, go-whatsapp-web-multidevice (MIT, github.com/aldinokemal/go-whatsapp-web-multidevice): номер магазина
#              привязывается по QR, переписка идёт в инбокс CRM.
#              Звонки WhatsApp из CRM: GOWA_BETA_BIN=<файл> — вместо релиза ставится сборка со звонками
#              (deploy/gowa-beta-build.sh, рядом whatsapp.sha256) и включается WHATSAPP_BETA_CALL_ENABLED. Без переменной —
#              снова релиз v$GOWA_VERSION, звонки шлюза выключены (откат). Сессия номера сохраняется в обоих случаях.
#
# Оба слушают только localhost (держат сессию кассира и номера магазина), секреты создаются при первой установке и
# лежат рядом с сервисом. Версии зафиксированы, архив GOWA сверяется с checksums.txt релиза. Повторный запуск обновляет
# сервис до зафиксированной версии и перезапускает его; данные (сессии, ключи) сохраняются.
# Дальше всё настраивается в CRM → «Интеграции»: адреса ниже уже совпадают с адресами по умолчанию.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="${MYBOOK_SIDECARS_DIR:-$(dirname "$ROOT")/mybook-sidecars}"
APP_PORT="${MYBOOK_PORT:-3040}"
KASPI_PORT="${KASPI_POS_PORT:-3010}"
GOWA_PORT="${GOWA_PORT:-3020}"
KASPI_POS_REF="175577ee1b34437dba46fb9bb0c8706f57f3b311"
GOWA_VERSION="9.6.0"

targets=("$@")
[ ${#targets[@]} -gt 0 ] || targets=(kaspi whatsapp)
for t in "${targets[@]}"; do
  case "$t" in kaspi | whatsapp) ;; *) echo "Неизвестный сервис: $t (kaspi | whatsapp)"; exit 1 ;; esac
done
has() { [[ " ${targets[*]} " == *" $1 "* ]]; }
secret() { node -e 'process.stdout.write(require("node:crypto").randomBytes(Number(process.argv[1])).toString("hex"))' "$1"; }

command -v pm2 >/dev/null || { echo "Нужен PM2 (npm i -g pm2)"; exit 1; }
mkdir -p "$DIR"
started=()

# Один кассир Kaspi — одна сессия: второй kaspi-pos с входом по SMS вытеснил бы кассира у другого проекта на сервере.
# Если общий kaspi-pos уже работает (PM2 «kaspi-pos», как у my-test.kz) или сессия задана в .env (KASPI_TOKEN_SN) — свой не ставим.
if has kaspi && { pm2 describe kaspi-pos >/dev/null 2>&1 || grep -q '^KASPI_TOKEN_SN=.' "$ROOT/.env" 2>/dev/null; }; then
  echo "→ kaspi-pos: на сервере уже есть общий kaspi-pos или общая сессия кассира — второй не ставлю."
  echo "  KASPI_API_URL — на общий сервис, KASPI_TOKEN_SN / KASPI_VTOKEN_SECRET / KASPI_PROFILE_ID — как у другого проекта,"
  echo "  а в его webhooks.json — запись с адресом этого сайта (см. .env.example)."
  targets=("${targets[@]/kaspi}")
fi

if has kaspi; then
  echo "→ kaspi-pos-automation ($KASPI_POS_REF)"
  K="$DIR/kaspi-pos"
  if [ ! -d "$K/.git" ]; then
    git clone --quiet https://github.com/tapter-dev/kaspi-pos-automation.git "$K"
  fi
  git -C "$K" fetch --quiet origin
  git -C "$K" checkout --quiet "$KASPI_POS_REF"
  (cd "$K" && npm ci --omit=dev --no-audit --no-fund --silent)
  # Ключ шифрования сессии кассира создаётся один раз: новый ключ сделает сохранённую сессию недействительной.
  touch "$K/.env" && chmod 600 "$K/.env"
  grep -q '^TOKEN_SECRET_KEY=' "$K/.env" || echo "TOKEN_SECRET_KEY=$(secret 32)" >>"$K/.env"
  sed -i '/^PORT=/d' "$K/.env" && echo "PORT=$KASPI_PORT" >>"$K/.env"
  # Вебхук без секрета: сайт перепроверяет такое уведомление в Kaspi, общий секрет не нужен.
  printf '[{"url":"http://localhost:%s/api/payments/kaspi/webhook","events":["payment.success","payment.failed","payment.expired","payment.lost"],"secret":""}]\n' "$APP_PORT" >"$K/webhooks.json"
  # Сервис не умеет выбирать адрес и без авторизации — слушать он будет только localhost.
  cp "$ROOT/deploy/kaspi-pos/localhost.cjs" "$K/localhost.cjs"
  started+=(mybook-kaspi-pos)
fi

if has whatsapp; then
  # Видео шлюз готовит через ffmpeg: без него отправка видео падает с «ffmpeg not installed».
  if ! command -v ffmpeg >/dev/null; then
    sudo -n apt-get install -y -qq ffmpeg >/dev/null 2>&1 || echo "  ⚠ Нет ffmpeg — видео в WhatsApp уйдут файлом. Установите: sudo apt-get install -y ffmpeg"
  fi
  G="$DIR/gowa"
  mkdir -p "$G"
  if [ -n "${GOWA_BETA_BIN:-}" ]; then
    echo "→ GOWA со звонками (бета, PR #892): $GOWA_BETA_BIN"
    [ -f "$GOWA_BETA_BIN" ] || { echo "GOWA: нет файла $GOWA_BETA_BIN"; exit 1; }
    sum="${GOWA_BETA_BIN}.sha256"
    [ -f "$sum" ] || { echo "GOWA: рядом нет $(basename "$sum") — соберите заново deploy/gowa-beta-build.sh"; exit 1; }
    [ "$(sha256sum "$GOWA_BETA_BIN" | cut -d' ' -f1)" = "$(cut -d' ' -f1 "$sum")" ] || { echo "GOWA: контрольная сумма сборки не совпала"; exit 1; }
    "$GOWA_BETA_BIN" --help >/dev/null 2>&1 || { echo "GOWA: сборка не запускается на этом сервере (архитектура, glibc)"; exit 1; }
    bin="$GOWA_BETA_BIN"
    beta_call=true
  else
    echo "→ GOWA v$GOWA_VERSION"
    case "$(uname -m)" in
      x86_64 | amd64) arch=amd64 ;;
      aarch64 | arm64) arch=arm64 ;;
      armv7l) arch=armv7 ;;
      *) echo "GOWA: нет сборки для $(uname -m)"; exit 1 ;;
    esac
    command -v unzip >/dev/null || { echo "Нужен unzip (sudo apt install unzip)"; exit 1; }
    zip="whatsapp_${GOWA_VERSION}_linux_${arch}.zip"
    base="https://github.com/aldinokemal/go-whatsapp-web-multidevice/releases/download/v${GOWA_VERSION}"
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    curl -fsSL -o "$tmp/$zip" "$base/$zip"
    curl -fsSL -o "$tmp/checksums.txt" "$base/checksums.txt"
    (cd "$tmp" && grep " $zip\$" checksums.txt | sha256sum -c --quiet -) || { echo "GOWA: контрольная сумма архива не совпала"; exit 1; }
    mkdir -p "$tmp/x"
    unzip -q "$tmp/$zip" -d "$tmp/x"
    bin="$(find "$tmp/x" -type f -name 'linux-*' | head -n 1)"
    [ -n "$bin" ] || { echo "GOWA: в архиве нет программы"; exit 1; }
    beta_call=false
  fi
  # Сессия номера и история — в storages: копия перед сменой программы, чтобы откат был без повторной привязки по QR.
  if [ -d "$G/storages" ] && ! cmp -s "$bin" "$G/whatsapp"; then
    tar -C "$G" -czf "$G/storages-$(date +%Y%m%d-%H%M%S).tgz" storages && ls -1t "$G"/storages-*.tgz | tail -n +4 | xargs -r rm -f
  fi
  install -m 755 "$bin" "$G/whatsapp.new" && mv -f "$G/whatsapp.new" "$G/whatsapp"
  touch "$G/.env" && chmod 600 "$G/.env"
  grep -q '^APP_BASIC_AUTH=' "$G/.env" || echo "APP_BASIC_AUTH=mybooks:$(secret 16)" >>"$G/.env"
  # Остальное — наши значения при каждом запуске скрипта. Вебхук устройства магазина сайт настраивает сам.
  # Скорость: фото статусов (истории контактов телефона магазина) не качаем — шлюз качает фото до вебхука и держит очередь
  # событий; группы, каналы и рассылки на сайт не шлём.
  # Звонки (только сборка со звонками): входящий звонит в CRM, а не сбрасывается; ответ, набор и звук — через API шлюза.
  sed -i -E '/^(APP_PORT|APP_HOST|APP_OS|APP_UI_ENABLED|MCP_ENABLED|WHATSAPP_WEBHOOK_IGNORE_JIDS|WHATSAPP_AUTO_DOWNLOAD_MEDIA|WHATSAPP_IGNORE_STATUS_MEDIA|WHATSAPP_ACCOUNT_VALIDATION|WHATSAPP_BETA_CALL_ENABLED)=/d' "$G/.env"
  cat >>"$G/.env" <<EOF
APP_PORT=$GOWA_PORT
APP_HOST=127.0.0.1
APP_OS=MyBooks CRM
APP_UI_ENABLED=false
MCP_ENABLED=false
WHATSAPP_WEBHOOK_IGNORE_JIDS=@g.us,@newsletter,@broadcast
WHATSAPP_AUTO_DOWNLOAD_MEDIA=true
WHATSAPP_IGNORE_STATUS_MEDIA=true
WHATSAPP_ACCOUNT_VALIDATION=false
WHATSAPP_BETA_CALL_ENABLED=$beta_call
EOF
  started+=(mybook-gowa)
fi

for name in "${started[@]}"; do pm2 delete "$name" >/dev/null 2>&1 || true; done
MYBOOK_SIDECARS_DIR="$DIR" pm2 start "$ROOT/deploy/ecosystem.config.cjs" --only "$(IFS=,; echo "${started[*]}")"
pm2 save

echo
echo "✓ Готово. CRM → «Интеграции»:"
if has kaspi; then
  echo "  Kaspi Pay: адрес сервиса http://127.0.0.1:$KASPI_PORT → «Подключить кассира»."
fi
if has whatsapp; then
  echo "  WhatsApp — свой шлюз: адрес http://127.0.0.1:$GOWA_PORT, логин:пароль — $(grep '^APP_BASIC_AUTH=' "$G/.env" | cut -d= -f2-)"
  echo "  (сохранён в $G/.env), «Куда шлюз отправляет входящие» — http://localhost:$APP_PORT/api/integrations/gowa;"
  echo "  выбрать «Свой шлюз GOWA», сохранить и привязать номер по QR."
  if [ "$beta_call" = true ]; then
    echo "  Звонки: шлюз умеет звонки. Прокси звука — bash deploy/wa-calls-nginx.sh, затем «Интеграции» → «Звонки WhatsApp из CRM»."
  fi
fi
