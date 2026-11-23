/**
 * Паритет превью и PDF: на книгах набора (tests/fixtures/books.ts) сравнивает, как главы разложены по полосам в
 * печатном PDF (renderInterior, "print") и в превью редактора (PagePreview в Chromium, тот же стенд, что у
 * html-snapshot): сколько полос у каждой главы (текст и фото) и на какой полосе главы начинается каждая история.
 *
 * Запуск из корня репозитория:
 *   npx tsx --import ./scripts/preload.mjs scripts/visual/parity.ts [--quick] [--filter <книга>] [--jobs N] [--css "<правила>"] [--json <файл>]
 *
 * --css — правила, которые добавляются на страницу стенда (подбор параметров набора без правки кода).
 * Код выхода: 0 — посчитано (расхождения — в отчёте), 2 — не состоялось (нет Chromium).
 * PDF каждой книги собирается в своём процессе, как в pdf-snapshot; результат кэшируется в tests/visual/out/parity-pdf
 * по отпечатку содержимого книги и версии кода сборки (git HEAD + незакоммиченные правки pdf и lib/book).
 */
import { fork, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Browser } from "playwright";
import type { FixtureBook } from "../../tests/fixtures/books";
import { useFixtureStorage as openFixtureStorage } from "../../tests/fixtures/photos";
import { photoNamesFor, snapshotBooks } from "./books";
import { FIXED_TIME, freezeRuntime } from "./freeze";
import { buildStandAssets } from "./html-assets";
import type { StandView } from "./html-data";
import { ORIGIN, startStandServer, type StandServer } from "./html-server";
import { ROOT, runPool, seconds } from "./shared";

const SCRIPT = path.join(ROOT, "scripts/visual/parity.ts");
const CACHE = path.join(ROOT, "tests/visual/out/parity-pdf");
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/** Раскладка одной книги: полос у каждой главы (текст и фото, без начальной) и полоса истории от начала текста главы (с 0). */
export interface BookFlow {
  chapters: Record<string, number>;
  entries: Record<string, number>;
  /** Только у PDF: истории, которые доводка начала с новой полосы. */
  breakBefore?: string[];
}

/** PDF: главы и истории по манифесту полос и раскладке итоговой сборки. */
async function pdfFlow(book: string): Promise<BookFlow> {
  freezeRuntime();
  const fixture = snapshotBooks(false).find((b) => b.key === book);
  if (!fixture) throw new Error(`Нет книги ${book} в наборе`);
  await openFixtureStorage(undefined, photoNamesFor([fixture]));
  const render = await import("@/modules/production/infrastructure/pdf/render");
  // Как на сайте (authoring.queries.bundle): в книгу идут только одобренные письма — набор держит и неодобренные.
  const bundle = { ...fixture.bundle, letters: fixture.bundle.letters?.filter((l) => l.status === "approved") };
  const res = await render.renderInterior(bundle, "print");
  const chapters: Record<string, number> = {};
  const firstText: Record<string, number> = {};
  for (const p of res.pages)
    if (p.chapterKey && (p.kind === "text" || p.kind === "photo")) {
      chapters[p.chapterKey] = (chapters[p.chapterKey] ?? 0) + 1;
      firstText[p.chapterKey] ??= p.n;
    }
  const content = render.contentFor(bundle);
  const entries: Record<string, number> = {};
  for (const ch of content.chapters)
    for (const it of ch.items) if (!it.continued && res.entryPages[it.id] && firstText[ch.key]) entries[it.id] = res.entryPages[it.id] - firstText[ch.key];
  return { chapters, entries, breakBefore: [...res.flow.breakBefore] };
}

/** Код, от которого зависит PDF: HEAD и незакоммиченные правки — отпечаток кэша. */
function codeStamp() {
  const head = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
  const diff = execSync("git diff HEAD -- src/lib/book src/modules/production src/i18n", { cwd: ROOT, maxBuffer: 64 << 20 }).toString();
  return createHash("sha1").update(head).update(diff).digest("hex").slice(0, 12);
}

function runPdf(book: string): Promise<BookFlow> {
  return new Promise((resolve, reject) => {
    const child = fork(SCRIPT, ["--worker", book], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe", "ipc"] });
    let log = "";
    child.stdout?.on("data", (d) => (log += d));
    child.stderr?.on("data", (d) => (log += d));
    let reply: { result?: BookFlow; error?: string } = {};
    child.on("message", (m) => (reply = m as typeof reply));
    child.on("exit", (code) => (reply.result && code === 0 ? resolve(reply.result) : reject(new Error(`${book}: ${reply.error ?? code}\n${log}`))));
  });
}

async function cachedPdf(book: FixtureBook, stamp: string): Promise<BookFlow> {
  const key = createHash("sha1").update(stamp).update(JSON.stringify(book.bundle)).digest("hex").slice(0, 16);
  const file = path.join(CACHE, `${book.key}-${key}.json`);
  if (existsSync(file)) return JSON.parse(await readFile(file, "utf8")) as BookFlow;
  const flow = await runPdf(book.key);
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, JSON.stringify(flow));
  return flow;
}

/** Превью: полосы глав по data-page, истории — по колонке своей метки в копии главы для замера. */
async function htmlFlow(browser: Browser, server: StandServer, view: StandView): Promise<BookFlow> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce", locale: "ru-RU", timezoneId: "UTC" });
  try {
    await context.route("**/*", async (route) => {
      const response = await server.respond(new URL(route.request().url()), view).catch(() => undefined);
      return response ? route.fulfill(response) : route.abort();
    });
    const page = await context.newPage();
    await page.clock.setFixedTime(FIXED_TIME);
    await page.goto(ORIGIN);
    await page.waitForSelector("body[data-ready]", { state: "attached", timeout: 60_000 });
    return await page.evaluate(() => {
      const chapters: Record<string, number> = {};
      for (const el of document.querySelectorAll<HTMLElement>("[data-page]")) {
        const id = el.dataset.page!;
        const m = /^(.*?):(?:photos:)?\d+$/.exec(id);
        if (m && m[1] !== "album") chapters[m[1]] = (chapters[m[1]] ?? 0) + 1;
      }
      const entries: Record<string, number> = {};
      for (const root of document.querySelectorAll<HTMLElement>("[aria-hidden] > div")) {
        const cs = getComputedStyle(root);
        const step = parseFloat(cs.columnWidth) + parseFloat(cs.columnGap);
        const left = root.getBoundingClientRect().left;
        for (const mk of root.querySelectorAll<HTMLElement>("[data-marker]")) entries[mk.dataset.marker!] = Math.max(0, Math.floor((mk.getBoundingClientRect().left - left + 1) / step));
      }
      return { chapters, entries };
    });
  } finally {
    await context.close();
  }
}

interface BookReport {
  book: string;
  chapters: { key: string; pdf: number; html: number }[];
  entries: { id: string; pdf: number; html: number }[];
}

async function main() {
  const { values } = parseArgs({ args: process.argv.slice(2), options: { quick: { type: "boolean" }, filter: { type: "string" }, jobs: { type: "string" }, css: { type: "string" }, json: { type: "string" } } });
  if (!existsSync(CHROMIUM)) {
    console.error(`Нет Chromium: ${CHROMIUM} — укажите CHROMIUM_PATH.`);
    process.exit(2);
  }
  const books = snapshotBooks(!!values.quick).filter((b) => !values.filter || b.key.includes(values.filter));
  const jobs = Number(values.jobs ?? 3);
  const started = performance.now();
  await openFixtureStorage(undefined, photoNamesFor(books));
  const stamp = codeStamp();
  const pdf = new Map<string, BookFlow>();
  await runPool(books, jobs, async (b) => pdf.set(b.key, await cachedPdf(b, stamp)));
  console.log(`PDF: ${books.length} книг за ${seconds(started)}`);

  const restore = freezeRuntime();
  const { standViews } = await import("./html-data");
  const views = books.flatMap(standViews).filter((v) => v.kind === "preview").map((v) => (values.css ? { ...v, css: values.css } : v));
  restore();
  const server = await startStandServer(await buildStandAssets(), books);
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const html = new Map<string, BookFlow>();
  try {
    await runPool(views, jobs, async (v) => html.set(v.key.split(":")[2], await htmlFlow(browser, server, v)));
  } finally {
    await browser.close();
    await server.close();
  }

  const reports: BookReport[] = books.map((b) => {
    const p = pdf.get(b.key)!;
    const h = html.get(b.key)!;
    return {
      book: b.key,
      chapters: Object.keys(p.chapters).map((key) => ({ key, pdf: p.chapters[key], html: h.chapters[key] ?? 0 })),
      entries: Object.keys(p.entries).map((id) => ({ id, pdf: p.entries[id], html: h.entries[id] ?? -1 })),
    };
  });
  let chapters = 0;
  let chaptersOk = 0;
  let entries = 0;
  let entriesOk = 0;
  for (const r of reports) {
    const badC = r.chapters.filter((c) => c.pdf !== c.html);
    const badE = r.entries.filter((e) => e.pdf !== e.html);
    chapters += r.chapters.length;
    chaptersOk += r.chapters.length - badC.length;
    entries += r.entries.length;
    entriesOk += r.entries.length - badE.length;
    if (badC.length || badE.length)
      console.log(`✗ ${r.book}: главы ${badC.map((c) => `${c.key} ${c.pdf}→${c.html}`).join(", ") || "—"}; истории ${badE.map((e) => `${e.id.slice(0, 8)} ${e.pdf}→${e.html}${pdf.get(r.book)!.breakBefore?.includes(e.id) ? " (разрыв доводки)" : ""}`).join(", ") || "—"}`);
  }
  console.log(`Полос у глав совпало: ${chaptersOk}/${chapters}; начало историй совпало: ${entriesOk}/${entries} — ${seconds(started)}`);
  if (values.json) await writeFile(values.json, JSON.stringify(reports, null, 2));
}

if (process.argv[2] === "--worker") {
  const reply = (message: object, code: number) => process.send?.(message, () => process.exit(code));
  pdfFlow(process.argv[3]).then(
    (result) => reply({ result }, 0),
    (err: unknown) => reply({ error: err instanceof Error ? err.message : String(err) }, 1),
  );
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
