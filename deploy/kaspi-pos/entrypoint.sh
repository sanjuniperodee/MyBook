#!/bin/sh
# Ключи «устройства» и очередь повторных вебхуков живут в томе /data — переживают пересборку контейнера
# (иначе сессия кассира станет недействительной). webhooks.json собирается из переменных окружения.
set -e
for f in keypair.json device.json ecdh-keypair.json webhook-retries.json; do
  ln -sf "/data/$f" "/app/$f"
done
if [ -n "$KASPI_WEBHOOK_URL" ]; then
  node -e 'require("fs").writeFileSync("/app/webhooks.json", JSON.stringify([{ url: process.env.KASPI_WEBHOOK_URL, events: ["payment.success", "payment.failed", "payment.expired", "payment.lost"], secret: process.env.KASPI_WEBHOOK_SECRET || "" }], null, 2))'
fi
exec node server.js
