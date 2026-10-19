#!/usr/bin/env bash
# Визуальная сверка текущего дерева с эталонным коммитом (S3, S4): снимки PDF и HTML в ref и здесь
# с одними и теми же флагами, затем compare.ts. Код выхода 1 — есть отличия, 2 — снимок или сверка не состоялись.
#
#   scripts/visual/check.sh [ref=HEAD] [--kind pdf|html|all] [--ref-tools] [--no-cache] [--quick] [--filter <подстрока>] [--jobs N]
#
# ref собирается во временном git worktree вне репозитория (node_modules — симлинк на здешние).
# Инструменты и набор книг (scripts/visual, scripts/preload.mjs, tests/fixtures) копируются туда из текущего
# дерева: обе стороны снимаются одинаково, отличаться может только код и ресурсы приложения. --ref-tools —
# снимать ref его собственными инструментами (когда текущие не подходят к его коду, например после переноса модуля).
#
# Эталон кэшируется: tests/visual/out/cache/<sha ref>-<флаги>-<инструменты>/<вид>. Флаги — те, что меняют снимок
# (--quick, --filter; --jobs — нет), инструменты — хеш копируемых файлов текущего дерева (с --ref-tools — «ref-tools»)
# вместе с CHROMIUM_PATH и версией pdftoppm. Повторная сверка с тем же ref и флагами эталон не снимает, а пока
# инструменты не менялись, кэш годен и после правок приложения. В кэш попадает только снимок без ошибок сборки;
# хранятся последние 6 записей. --no-cache — снять эталон заново (и обновить кэш).
# Результаты — tests/visual/out/{ref,cur}/<вид> (вне git; ref/<вид> — ссылка на запись кэша), диффы —
# в tests/visual/out/cur/<вид>/diff/.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

ref=HEAD
if [[ $# -gt 0 && $1 != -* ]]; then
  ref=$1
  shift
fi
kinds=(pdf html)
ref_tools=0
use_cache=1
flags=()
key=full
while [[ $# -gt 0 ]]; do
  case $1 in
    --kind)
      [[ $2 == all ]] || kinds=("$2")
      shift 2
      ;;
    --ref-tools)
      ref_tools=1
      shift
      ;;
    --no-cache)
      use_cache=0
      shift
      ;;
    --quick)
      flags+=("$1")
      key=quick
      shift
      ;;
    --filter)
      flags+=("$1" "$2")
      filter_key=${2//[^A-Za-z0-9._-]/_}
      shift 2
      ;;
    --jobs)
      flags+=("$1" "$2")
      shift 2
      ;;
    *)
      echo "Неизвестный флаг: $1 (ожидаются --kind, --ref-tools, --no-cache, --quick, --filter, --jobs)" >&2
      exit 2
      ;;
  esac
done

sha="$(git rev-parse --verify "$ref^{commit}")"
short="$(git rev-parse --short "$sha")"
out="$root/tests/visual/out"
cache="$out/cache"
KEEP=6

# Инструменты, которыми снимается эталон, и окружение (Chromium, poppler): от них зависит снимок при том же коммите.
tools="ref-tools"
if [[ $ref_tools == 0 ]]; then
  files="$(find scripts/visual tests/fixtures scripts/preload.mjs -type f | LC_ALL=C sort)"
  # shellcheck disable=SC2086 # пути без пробелов: по аргументу на файл
  tools="$files"$'\n'"$(git hash-object $files)"
fi
tools_hash="$({ echo "$tools"; echo "chromium=${CHROMIUM_PATH:-}"; pdftoppm -v 2>&1 | head -1 || true; } | git hash-object --stdin | cut -c1-12)"
entry_dir="$cache/$sha-$key${filter_key+-filter_$filter_key}-$tools_hash"

tree=""
tmp=""
cleanup() {
  if [[ -n $tree ]]; then
    git worktree remove --force "$tree" 2>/dev/null || true
    rm -rf "$tmp"
  fi
}
trap cleanup EXIT

# Временный worktree на ref — только когда эталон нужно снимать.
ensure_tree() {
  [[ -z $tree ]] || return 0
  tmp="$(mktemp -d)"
  tree="$tmp/tree"
  git worktree add --detach --quiet "$tree" "$sha"
  ln -s "$root/node_modules" "$tree/node_modules"
  if [[ $ref_tools == 0 ]]; then
    rm -rf "$tree/scripts/visual" "$tree/tests/fixtures"
    cp -R scripts/visual "$tree/scripts/visual"
    cp -R tests/fixtures "$tree/tests/fixtures"
    cp scripts/preload.mjs "$tree/scripts/preload.mjs"
  fi
}

snapshot() { # <дерево> <вид> <каталог> — код выхода снимка: 0, 1 (есть ошибки сборки, манифест записан) или 2
  (cd "$1" && npx tsx --import ./scripts/preload.mjs "scripts/visual/$2-snapshot.ts" --out "$3" ${flags[@]+"${flags[@]}"})
}

status=0
for kind in "${kinds[@]}"; do
  rm -rf "$out/ref/$kind" "$out/cur/$kind"
  mkdir -p "$out/ref" "$out/cur"
  ref_dir="$entry_dir/$kind"
  if [[ $use_cache == 1 && -f $ref_dir/manifest.json ]]; then
    echo "── $kind: эталон $ref ($short) — из кэша $ref_dir"
    touch "$entry_dir"
  else
    echo "── $kind: эталон $ref ($short)"
    ensure_tree
    code=0
    snapshot "$tree" "$kind" "$out/ref/$kind" || code=$?
    if ((code == 2)); then
      echo "✗ $kind: эталон не снят" >&2
      exit 2
    fi
    if ((code == 0)); then
      rm -rf "$ref_dir"
      mkdir -p "$entry_dir"
      mv "$out/ref/$kind" "$ref_dir"
    else
      ref_dir="$out/ref/$kind"
      echo "   эталон с ошибками сборки — в кэш не попадает"
    fi
  fi
  [[ $ref_dir == "$out/ref/$kind" ]] || ln -sfn "$ref_dir" "$out/ref/$kind"
  echo "── $kind: текущее дерево"
  code=0
  snapshot "$root" "$kind" "$out/cur/$kind" || code=$?
  if ((code == 2)); then
    echo "✗ $kind: текущий снимок не снят" >&2
    exit 2
  fi
  echo "── $kind: сверка"
  code=0
  npx tsx scripts/visual/compare.ts "$out/ref/$kind" "$out/cur/$kind" || code=$?
  if ((code == 2)); then exit 2; fi
  ((code == 0)) || status=1
done

# Старые записи кэша: оставляем KEEP последних по времени использования.
{ ls -1dt "$cache"/*/ 2>/dev/null || true; } | tail -n +$((KEEP + 1)) | xargs rm -rf
exit $status
