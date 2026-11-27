#!/usr/bin/env bash
# Собирает mybook-files для сервера — статический бинарник linux/amd64: bash services/files/build.sh <папка>
# CI кладёт его в релиз (build/bin → <релиз>/bin/mybook-files), PM2 запускает из релиза (deploy/ecosystem.config.cjs).
set -euo pipefail
out="$(mkdir -p "${1:?укажите папку}" && cd "$1" && pwd)"
cd "$(dirname "$0")"
CGO_ENABLED=0 GOOS="${GOOS:-linux}" GOARCH="${GOARCH:-amd64}" \
  go build -trimpath -ldflags "-s -w -X main.version=$(git rev-parse --short HEAD 2>/dev/null || echo dev)" -o "$out/mybook-files" .
echo "mybook-files: $out/mybook-files"
