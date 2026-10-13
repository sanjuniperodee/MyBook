#!/usr/bin/env bash
# Визуальная сверка текущего дерева с эталонным коммитом (S3, S4): снимки PDF и HTML в ref и здесь
# с одними и теми же флагами, затем compare.ts. Код выхода 1 — есть отличия (или снимок не собрался).
#
#   scripts/visual/check.sh [ref=HEAD] [--kind pdf|html|all] [--ref-tools] [--quick] [--filter <подстрока>] [--jobs N]
#
# ref собирается во временном git worktree вне репозитория (node_modules — симлинк на здешние).
# Инструменты и набор книг (scripts/visual, scripts/preload.mjs, tests/fixtures) копируются туда из текущего
# дерева: обе стороны снимаются одинаково, отличаться может только код и ресурсы приложения. --ref-tools —
# снимать ref его собственными инструментами (когда текущие не подходят к его коду, например после переноса модуля).
# Результаты — tests/visual/out/{ref,cur}/<вид> (вне git), диффы — в tests/visual/out/cur/<вид>/diff/.
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
flags=()
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
    *)
      flags+=("$1")
      shift
      ;;
  esac
done

out="$root/tests/visual/out"
tmp="$(mktemp -d)"
tree="$tmp/tree"
cleanup() {
  git worktree remove --force "$tree" 2>/dev/null || true
  rm -rf "$tmp"
}
trap cleanup EXIT

git worktree add --detach --quiet "$tree" "$ref"
ln -s "$root/node_modules" "$tree/node_modules"
if [[ $ref_tools == 0 ]]; then
  rm -rf "$tree/scripts/visual" "$tree/tests/fixtures"
  cp -R scripts/visual "$tree/scripts/visual"
  cp -R tests/fixtures "$tree/tests/fixtures"
  cp scripts/preload.mjs "$tree/scripts/preload.mjs"
fi

snapshot() { # <дерево> <вид> <каталог>
  # Снимок с упавшими книгами всё равно пишет манифест (ошибки в нём) — сверка решает, отличие ли это.
  (cd "$1" && npx tsx --import ./scripts/preload.mjs "scripts/visual/$2-snapshot.ts" --out "$3" ${flags[@]+"${flags[@]}"}) || true
}

status=0
for kind in "${kinds[@]}"; do
  rm -rf "$out/ref/$kind" "$out/cur/$kind"
  echo "── $kind: эталон $ref ($(git rev-parse --short "$ref"))"
  snapshot "$tree" "$kind" "$out/ref/$kind"
  echo "── $kind: текущее дерево"
  snapshot "$root" "$kind" "$out/cur/$kind"
  echo "── $kind: сверка"
  npx tsx scripts/visual/compare.ts "$out/ref/$kind" "$out/cur/$kind" || status=1
done
exit $status
