/**
 * Эталонные PDF (S2): для каждой книги набора (tests/fixtures/books.ts) — блок (renderInterior, "print")
 * и обложка-развёртка (renderCover), растр pdftoppm 150 dpi по страницам и manifest.json. Ключи —
 * pdf:block:<книга> и pdf:cover:<книга>. Сверка — compare.ts, с эталонным коммитом — check.sh.
 *
 * Запуск из корня репозитория:
 *   npx tsx --import ./scripts/preload.mjs scripts/visual/pdf-snapshot.ts --out <каталог> [--filter <подстрока ключа>] [--quick] [--jobs N]
 *
 * Каждая книга собирается в своём дочернем процессе с зафиксированными временем и случайностью (freeze.ts):
 * книги не делят состояние, результат не зависит от --jobs и порядка.
 */
import { execFile, fork } from "node:child_process";
import { readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { fixtureBooks } from "../../tests/fixtures/books";
// Не React-хук, несмотря на имя: под другим именем правило хуков не путает его с ними.
import { useFixtureStorage as openFixtureStorage } from "../../tests/fixtures/photos";
import { freezeRuntime } from "./freeze";
import { entryFor, errorEntry, freshKeyDir, pagePath, prepareOut, reportSnapshot, ROOT, runPool, seconds, snapshotFlags, writeManifest, type Manifest } from "./shared";

const DPI = 150;
const SCRIPT = fileURLToPath(import.meta.url);
const run = promisify(execFile);

interface Task {
  book: string;
  out: string;
  keys: string[];
}

const blockKey = (book: string) => `pdf:block:${book}`;
const coverKey = (book: string) => `pdf:cover:${book}`;

/** PDF → <dir>/001.png, 002.png… */
async function rasterize(pdf: Buffer, out: string, key: string): Promise<string[]> {
  const dir = await freshKeyDir(out, key);
  const source = path.join(dir, "source.pdf");
  await writeFile(source, pdf);
  await run("pdftoppm", ["-r", String(DPI), "-png", source, path.join(dir, "p")]);
  await rm(source);
  // pdftoppm дополняет номер нулями до разрядности последнего: p-1.png, p-01.png…
  const pages = (await readdir(dir)).filter((f) => /^p-\d+\.png$/.test(f)).sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));
  return Promise.all(
    pages.map(async (f, i) => {
      await rename(path.join(dir, f), pagePath(dir, i));
      return pagePath(dir, i);
    }),
  );
}

/** Дочерний процесс: одна книга → записи манифеста её ключей (через IPC). */
async function worker(task: Task) {
  freezeRuntime();
  await openFixtureStorage();
  const render = await import("@/modules/production/infrastructure/pdf/render");
  const fixture = fixtureBooks().find((b) => b.key === task.book);
  if (!fixture) throw new Error(`Нет книги ${task.book} в наборе`);
  const interior = await render.renderInterior(fixture.bundle, "print");
  const want = (key: string) => task.keys.includes(key);
  // Растр блока идёт в pdftoppm параллельно со сборкой обложки.
  const [block, cover] = await Promise.all([
    want(blockKey(task.book)) ? rasterize(interior.pdf, task.out, blockKey(task.book)).then(entryFor) : null,
    want(coverKey(task.book)) ? render.renderCover(fixture.bundle, interior.pageCount, "print").then((c) => rasterize(c.pdf, task.out, coverKey(task.book))).then(entryFor) : null,
  ]);
  const result: Manifest = {};
  if (block) result[blockKey(task.book)] = block;
  if (cover) result[coverKey(task.book)] = cover;
  return result;
}

function runWorker(task: Task): Promise<Manifest> {
  return new Promise((resolve) => {
    const child = fork(SCRIPT, ["--worker", JSON.stringify(task)], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe", "ipc"] });
    // Вывод книги (предупреждения react-pdf) показываем, только если она упала.
    let log = "";
    child.stdout?.on("data", (d) => (log += d));
    child.stderr?.on("data", (d) => (log += d));
    let reply: { result?: Manifest; error?: string } = {};
    child.on("message", (m) => (reply = m as typeof reply));
    child.on("exit", (code) => {
      if (reply.result && code === 0) return resolve(reply.result);
      const error = reply.error ?? `процесс завершился с кодом ${code}`;
      console.error(`${task.book}: ${error}\n${log}`);
      resolve(Object.fromEntries(task.keys.map((k) => [k, errorEntry(error)])));
    });
  });
}

async function main() {
  const flags = snapshotFlags(process.argv.slice(2));
  const books = flags.quick ? fixtureBooks({ formats: ["a5"], languages: ["ru"] }) : fixtureBooks();
  const tasks = books
    .map((b) => ({ book: b.key, out: flags.out, keys: [blockKey(b.key), coverKey(b.key)].filter((k) => !flags.filter || k.includes(flags.filter)) }))
    .filter((t) => t.keys.length);
  await prepareOut(flags.out);
  await openFixtureStorage(); // фото пишутся один раз здесь, а не в каждом процессе
  const started = performance.now();
  let done = 0;
  const results = await runPool(tasks, flags.jobs, async (task) => {
    const from = performance.now();
    const result = await runWorker(task);
    console.log(`[${++done}/${tasks.length}] ${task.book} — ${seconds(from)}`);
    return result;
  });
  const manifest: Manifest = Object.assign({}, ...results);
  await writeManifest(flags.out, manifest);
  reportSnapshot(manifest, flags.out, started);
}

if (process.argv[2] === "--worker") {
  // Канал IPC держит процесс живым: выходим, как только ответ ушёл.
  const reply = (message: object, code: number) => process.send?.(message, () => process.exit(code));
  worker(JSON.parse(process.argv[3]) as Task).then(
    (result) => reply({ result }, 0),
    (err: unknown) => reply({ error: errorEntry(err).error }, 1),
  );
} else {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 2;
  });
}
