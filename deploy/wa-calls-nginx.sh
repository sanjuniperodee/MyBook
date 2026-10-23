#!/usr/bin/env bash
# Прокси звука звонков WhatsApp в nginx (deploy/nginx-wa-call.conf): кладёт snippets/mybook-wa-call.conf и подключает его
# в server сайта. Запуск на сервере из корня репозитория: bash deploy/wa-calls-nginx.sh [файл-сайта]
#   по умолчанию — /etc/nginx/sites-available/mybooks-kz (server mybooks.kz). Повторный запуск обновляет snippet.
# Перед перезагрузкой — nginx -t; не прошло — всё возвращается как было. Убрать: строку include из файла сайта, reload.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="${1:-/etc/nginx/sites-available/mybooks-kz}"
SNIPPET=/etc/nginx/snippets/mybook-wa-call.conf
LINE="    include snippets/mybook-wa-call.conf;"

[ -f "$SITE" ] || { echo "Нет файла сайта $SITE"; exit 1; }
nginx -V 2>&1 | grep -q http_auth_request_module || { echo "nginx собран без auth_request"; exit 1; }
# sites-enabled — симлинки: grep -r по ним не идёт, поэтому файлы перечисляем явно.
grep -qs "upstream mybook_app" /etc/nginx/sites-enabled/* || { echo "Нет upstream mybook_app (deploy/nginx-mybook.conf)"; exit 1; }

backup="$(mktemp -d)"
cp -a "$SITE" "$backup/site"
[ -f "$SNIPPET" ] && cp -a "$SNIPPET" "$backup/snippet"
restore() {
  sudo cp -a "$backup/site" "$SITE"
  if [ -f "$backup/snippet" ]; then sudo cp -a "$backup/snippet" "$SNIPPET"; else sudo rm -f "$SNIPPET"; fi
}

sudo install -m 644 "$ROOT/deploy/nginx-wa-call.conf" "$SNIPPET"
if ! grep -q "include snippets/mybook-wa-call" "$SITE"; then
  # В каждый server с 443 (https) — перед первым location.
  sudo python3 - "$SITE" "$LINE" <<'PY'
import re, sys
path, line = sys.argv[1], sys.argv[2]
text = open(path).read()
out, depth, pending, done = [], 0, False, 0
for row in text.splitlines(keepends=True):
    stripped = row.strip()
    if depth == 0 and re.match(r"server\s*\{", stripped):
        pending = True
    if pending and depth == 1 and stripped.startswith("location "):
        out.append("    # Звонки WhatsApp из CRM: звук браузера ↔ шлюз (deploy/nginx-wa-call.conf).\n" + line + "\n\n")
        pending, done = False, done + 1
    out.append(row)
    depth += row.count("{") - row.count("}")
    if depth == 0:
        pending = False
if not done:
    sys.exit("в файле сайта нет server с location")
open(path, "w").write("".join(out))
PY
fi
if sudo nginx -t 2>&1; then
  sudo systemctl reload nginx
  echo "✓ Прокси звука звонков WhatsApp подключён: $SITE"
else
  echo "✗ nginx -t не прошёл — возвращаю как было"
  restore
  exit 1
fi
rm -rf "$backup"
