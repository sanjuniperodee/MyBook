#!/usr/bin/env bash
# Ждать новое обращение: раз в минуту спрашивает прод, выходит (код 0) и печатает номера, когда появится обращение новее
# <последний номер>. Claude запускает её фоном и разбирает обращение, когда она завершится (docs/support/README.md).
#   bash scripts/support/watch.sh <последний номер> [секунд между проверками, 60]
set -uo pipefail
LAST="${1:?последний известный номер обращения (0 — с начала)}"
EVERY="${2:-60}"
DIR="$(cd "$(dirname "$0")" && pwd)"
while true; do
  NEW="$(bash "$DIR/ticket.sh" since "$LAST" 2>/dev/null | tr '\n' ' ' | sed 's/ *$//')"
  if [ -n "$NEW" ]; then
    echo "Новые обращения: $NEW"
    exit 0
  fi
  sleep "$EVERY"
done
