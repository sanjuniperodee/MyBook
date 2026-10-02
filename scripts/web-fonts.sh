#!/usr/bin/env bash
# Веб-версии шрифтов: WOFF2 только с нужными символами — латиница (в том числе казахская
# латиница), кириллица с казахскими буквами, типографские знаки, ₸ и №. Полные TTF из
# assets/fonts остаются для PDF: в печать идут все глифы.
#
# Запуск после добавления или замены шрифта (нужен fonttools: pip install fonttools brotli):
#   bash scripts/web-fonts.sh
set -euo pipefail
cd "$(dirname "$0")/.."
SUBSET="${PYFTSUBSET:-pyftsubset}"
UNICODES="U+0000-00FF,U+0100-017F,U+0218-021B,U+02C6,U+02DA,U+02DC,U+0300-0301,U+0400-04FF,U+2000-206F,U+20A0-20CF,U+2116,U+2122,U+2190-2193,U+2212,U+2215"
mkdir -p assets/fonts/web
for ttf in assets/fonts/*.ttf; do
  name="$(basename "$ttf" .ttf)"
  "$SUBSET" "$ttf" --unicodes="$UNICODES" --layout-features='*' --flavor=woff2 --no-hinting \
    --output-file="assets/fonts/web/$name.woff2"
done
du -ch assets/fonts/web/*.woff2 | tail -1
