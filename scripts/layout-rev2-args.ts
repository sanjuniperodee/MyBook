// Аргументы npm run photos:layout-rev2 (scripts/layout-rev2.ts) — отдельно от скрипта, чтобы их разбор проверял тест.
// Разбор строгий: неизвестный, пустой или лишний аргумент — ошибка. Иначе «--restore <файл> --apply» или «--book=$ID»
// с пустым $ID молча превращались бы в перевод всех книг вместо отката или одной книги.
import { parseArgs } from "node:util";

export type LayoutRev2Args = { mode: "migrate"; apply: boolean; book: string | null; limit: number } | { mode: "restore"; apply: boolean; force: boolean; file: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Аргументы скрипта: --apply, --book=<id>, --limit=<n>, --restore=<файл> [--force] (значение — и через пробел). */
export function parseLayoutRev2Args(argv: readonly string[]): LayoutRev2Args | { error: string } {
  let values: { apply?: boolean; force?: boolean; book?: string; limit?: string; restore?: string };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: false,
      options: { apply: { type: "boolean" }, force: { type: "boolean" }, book: { type: "string" }, limit: { type: "string" }, restore: { type: "string" } },
    }));
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  const apply = !!values.apply;
  if (values.restore !== undefined) {
    if (!values.restore.trim()) return { error: "--restore=<файл>: путь к резервной копии пуст." };
    if (values.book !== undefined || values.limit !== undefined) return { error: "--restore не сочетается с --book и --limit: откатываются все книги из копии." };
    return { mode: "restore", apply, force: !!values.force, file: values.restore };
  }
  if (values.force) return { error: "--force — только вместе с --restore." };
  if (values.book !== undefined && !UUID.test(values.book)) return { error: `--book=<id>: id книги (uuid), получено «${values.book}».` };
  if (values.limit !== undefined && !/^[1-9]\d*$/.test(values.limit)) return { error: `--limit=<n>: n — положительное целое, получено «${values.limit}».` };
  return { mode: "migrate", apply, book: values.book ?? null, limit: values.limit === undefined ? Infinity : Number(values.limit) };
}
