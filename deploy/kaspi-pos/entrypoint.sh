#!/bin/sh
# Ключи «устройства», ключ шифрования сессии и очередь повторных вебхуков живут в томе /data — переживают пересборку
# контейнера (иначе сессия кассира станет недействительной). Ключ шифрования создаётся при первом запуске, если не задан.
set -e
for f in keypair.json device.json ecdh-keypair.json webhook-retries.json; do
  ln -sf "/data/$f" "/app/$f"
done
if [ -z "$TOKEN_SECRET_KEY" ]; then
  [ -s /data/token-secret-key ] || (umask 077 && node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))' >/data/token-secret-key)
  TOKEN_SECRET_KEY="$(cat /data/token-secret-key)"
  export TOKEN_SECRET_KEY
fi
# Вебхук на сайт. Секрет необязателен: без него сайт перепроверяет уведомление в Kaspi.
if [ -n "$KASPI_WEBHOOK_URL" ]; then
  node -e 'require("fs").writeFileSync("/app/webhooks.json", JSON.stringify([{ url: process.env.KASPI_WEBHOOK_URL, events: ["payment.success", "payment.failed", "payment.expired", "payment.lost"], secret: process.env.KASPI_WEBHOOK_SECRET || "" }], null, 2))'
fi
exec node server.js
