// Склеивает одинаковые серверные чанки Turbopack в релизе (.next/standalone/.next/server): node scripts/dedupe-server-chunks.mjs [папка]
//
// Зачем (замер 24.11, docs/microservices/perf.md, G2). Turbopack кладёт общий серверный код (container и все модули) в
// отдельную копию чанка для каждой группы маршрутов: 120 МБ JS, из них уникальных модулей — 27 МБ, остальное — те же
// файлы в 24 копиях, отличающиеся только строкой «//# sourceMappingURL=<своё имя>.map». Next при старте загружает все
// маршруты (preloadEntriesOnStart), и V8 держит исходник каждой копии строкой — с кириллицей это по 2 байта на символ:
// ~160 МБ кучи сайта — исходники чанков.
//
// Рантайм Turbopack грузит чанк обычным require(путь), а require кэширует модуль по реальному пути (символьные ссылки
// раскрываются). Поэтому копия заменяется символьной ссылкой на первую такую же копию в той же папке: файл загружается и
// компилируется один раз, второй require возвращает уже загруженный массив фабрик модулей — рантайм ставит те же
// фабрики, что поставил бы из копии. Склеиваются только копии в одной папке (у них один __dirname и те же относительные
// require) и только совпадающие байт-в-байт, кроме строки карты исходников (карт в релизе всё равно нет).
// Откат — MYBOOK_DEDUPE_CHUNKS=off при сборке.
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, renameSync, symlinkSync } from "node:fs";
import path from "node:path";

const MAP_LINE = /\n?\/\/# sourceMappingURL=[^\n]*\n?$/;

/** Содержимое чанка без строки карты исходников: по нему копии считаются одинаковыми. */
export function chunkBody(src) {
  return src.replace(MAP_LINE, "");
}

function* jsFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* jsFiles(p);
    else if (entry.isFile() && entry.name.endsWith(".js")) yield p;
  }
}

/** Склеить копии в папке dir (рекурсивно). Возвращает, сколько файлов и байт стали ссылками. */
export function dedupeChunks(dir) {
  const groups = new Map();
  for (const file of jsFiles(dir)) {
    const body = chunkBody(readFileSync(file, "utf8"));
    // Мелкие файлы не трогаем: экономии нет, а это обычно входы маршрутов.
    if (body.length < 4096) continue;
    const key = `${path.dirname(file)}\0${createHash("sha256").update(body).digest("hex")}`;
    const list = groups.get(key);
    if (list) list.push(file);
    else groups.set(key, [file]);
  }
  let files = 0;
  let bytes = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort();
    const [canonical, ...copies] = list;
    for (const copy of copies) {
      const size = lstatSync(copy).size;
      const tmp = `${copy}.dedupe-${process.pid}`;
      symlinkSync(path.basename(canonical), tmp);
      renameSync(tmp, copy);
      files++;
      bytes += size;
    }
  }
  return { files, bytes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.MYBOOK_DEDUPE_CHUNKS === "off") {
    console.log("dedupe-server-chunks: выключено (MYBOOK_DEDUPE_CHUNKS=off)");
    process.exit(0);
  }
  const dir = process.argv[2] || path.join(".next", "standalone", ".next", "server");
  const { files, bytes } = dedupeChunks(dir);
  console.log(`dedupe-server-chunks: ${files} копий чанков → ссылки, −${(bytes / 1048576).toFixed(1)} МБ исходников (${dir})`);
}
