/**
 * Паритет превью и PDF: на книгах набора (tests/fixtures/books.ts) сравнивает, как главы разложены по полосам в
 * печатном PDF (renderInterior, "print") и в превью редактора (PagePreview в Chromium, тот же стенд, что у
 * html-snapshot): сколько полос у каждой главы (текст и фото) и на какой полосе главы начинается каждая история.
 *
 * Запуск из корня репозитория:
 *   npx tsx --import ./scripts/preload.mjs scripts/visual/parity.ts [--quick] [--filter <книга>] [--jobs N] [--css "<правила>"] [--json <файл>]
 *   … --real <каталог> — вместо набора настоящие книги, выгруженные из базы (scripts/visual/real-books.ts).
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
import { realBooks } from "./real-books";
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
  /** Блоки доводки по главам: пометка, полоса от начала текста главы, верх и низ первого куска (pt от верха полосы набора). */
  blocks?: Record<string, [string, number, number, number][]>;
  /** Полоса первой главы в книге (у превью — с пустой перед начальной, если она нужна). */
  first?: number;
}

/** PDF: главы и истории по манифесту полос и раскладке итоговой сборки. */
async function pdfFlow(book: string, real?: string): Promise<BookFlow> {
  freezeRuntime();
  const fixture = [...snapshotBooks(false), ...(real ? realBooks(real) : [])].find((b) => b.key === book);
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
  const { interiorMetrics } = await import("@/lib/book/page-geometry");
  const { mm, print } = await import("@/lib/book/formats");
  const top = mm(print.bleedMm + interiorMetrics[content.format.id].marginTop);
  const blocks: Record<string, [string, number, number, number][]> = {};
  for (const b of res.blocks) if (firstText[b.chapter] !== undefined) (blocks[b.chapter] ??= []).push([b.mark, b.first.page + 1 - firstText[b.chapter], Math.round((b.first.top - top) * 10) / 10, Math.round((b.first.bottom - top) * 10) / 10]);
  return { chapters, entries, breakBefore: [...res.flow.breakBefore], blocks, first: res.chapterPages[content.chapters[0]?.key] };
}

/** Код, от которого зависит PDF: HEAD и незакоммиченные правки — отпечаток кэша. */
function codeStamp() {
  const head = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
  const diff = execSync("git diff HEAD -- src/lib/book src/modules/production src/i18n", { cwd: ROOT, maxBuffer: 64 << 20 }).toString();
  return createHash("sha1").update(head).update(diff).digest("hex").slice(0, 12);
}

function runPdf(book: string, real?: string): Promise<BookFlow> {
  return new Promise((resolve, reject) => {
    const child = fork(SCRIPT, ["--worker", book, ...(real ? [real] : [])], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe", "ipc"] });
    let log = "";
    child.stdout?.on("data", (d) => (log += d));
    child.stderr?.on("data", (d) => (log += d));
    let reply: { result?: BookFlow; error?: string } = {};
    child.on("message", (m) => (reply = m as typeof reply));
    child.on("exit", (code) => (reply.result && code === 0 ? resolve(reply.result) : reject(new Error(`${book}: ${reply.error ?? code}\n${log}`))));
  });
}

async function cachedPdf(book: FixtureBook, stamp: string, real?: string): Promise<BookFlow> {
  const key = createHash("sha1").update(stamp).update(JSON.stringify(book.bundle)).digest("hex").slice(0, 16);
  const file = path.join(CACHE, `${book.key}-${key}.json`);
  if (existsSync(file)) return JSON.parse(await readFile(file, "utf8")) as BookFlow;
  const flow = await runPdf(book.key, real);
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
    // Полоса набора в pt — чтобы перевести пиксели колонки в пункты.
    const { textArea } = await import("@/lib/book/page-geometry");
    const { getFormat, MM_TO_PT } = await import("@/lib/book/formats");
    await page.addInitScript((w) => ((window as unknown as { __textWpt: number }).__textWpt = w), textArea(getFormat(view.format)).w * MM_TO_PT);
    await page.addInitScript((l) => ((window as unknown as { __openersLeft: boolean }).__openersLeft = l), view.kind === "preview" && view.preview.openersLeft && !view.preview.chapterStart);
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
      const layouts: Record<string, [string, number, number, number][]> = {};
      // Разбивка, как у PDF (ChapterPages: data-pdf-layout), — полосы глав и начала ответов из неё.
      for (const root of document.querySelectorAll<HTMLElement>("[aria-hidden] > div[data-pdf-layout]")) {
        const l = JSON.parse(root.dataset.pdfLayout!) as { chapter: string; pages: number; markers: Record<string, number>; blocks?: [string, [number, number, number]][] };
        Object.assign(entries, l.markers);
        if (l.blocks) layouts[l.chapter] = l.blocks.map(([id, [page, top, bottom]]) => [id, page, top, bottom]);
      }
      for (const root of document.querySelectorAll<HTMLElement>("[aria-hidden] > div:not([data-pdf-layout])")) {
        const cs = getComputedStyle(root);
        const step = parseFloat(cs.columnWidth) + parseFloat(cs.columnGap);
        const left = root.getBoundingClientRect().left;
        for (const mk of root.querySelectorAll<HTMLElement>("[data-marker]")) entries[mk.dataset.marker!] = Math.max(0, Math.floor((mk.getBoundingClientRect().left - left + 1) / step));
      }
      // Блоки доводки в копиях для замера (как components/interior/flow-measure.ts): полоса и верх/низ первого куска, pt.
      const blocks: Record<string, [string, number, number, number][]> = {};
      for (const root of document.querySelectorAll<HTMLElement>("[aria-hidden] > div")) {
        const cs = getComputedStyle(root);
        const step = parseFloat(cs.columnWidth) + parseFloat(cs.columnGap);
        const box = root.getBoundingClientRect();
        const ptPx = (parseFloat(cs.columnWidth) / (window as unknown as { __textWpt: number }).__textWpt) || 1;
        const list: [string, number, number, number][] = [];
        let chapter = "";
        for (const el of root.querySelectorAll<HTMLElement>("[data-flow]")) {
          const mark = el.getAttribute("data-flow")!;
          if (mark.startsWith("t:")) chapter = mark.slice(2);
          const r = [...el.getClientRects()].find((x) => x.height > 0.5);
          if (!r) continue;
          const pad = el.hasAttribute("data-gap-below") && el.getClientRects().length === 1 ? parseFloat(getComputedStyle(el).paddingBottom) : 0;
          const above = Number(el.getAttribute("data-gap-above") ?? 0);
          // Разбитый на колонки блок: у браузера кусок тянется до конца колонки — низ по строкам (как flow-measure).
          let bottom = r.bottom;
          if (el.getClientRects().length > 1) {
            const range = document.createRange();
            range.selectNodeContents(el);
            const col = Math.floor((r.left - box.left + 1) / step);
            bottom = Math.max(...[...range.getClientRects()].filter((x) => x.height > 0 && Math.floor((x.left - box.left + 1) / step) === col).map((x) => x.bottom));
          }
          list.push([mark, Math.floor((r.left - box.left + 1) / step), Math.round(((r.top - box.top) / ptPx + above) * 10) / 10, Math.round(((bottom - pad - box.top) / ptPx) * 10) / 10]);
        }
        if (chapter) blocks[chapter] = list;
      }
      const fp = Number(document.querySelector<HTMLElement>("[data-first-page]")?.dataset.firstPage);
      // Начальная полоса слева (полоса чётная): выпала бы справа — перед ней пустая (так её ставит и PDF).
      const left = !!document.querySelector("[data-opener]") && (window as unknown as { __openersLeft?: boolean }).__openersLeft;
      return { chapters, entries, blocks: { ...blocks, ...layouts }, first: Number.isFinite(fp) ? (left && fp % 2 === 1 ? fp + 1 : fp) : undefined };
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
  const { values } = parseArgs({ args: process.argv.slice(2), options: { quick: { type: "boolean" }, filter: { type: "string" }, jobs: { type: "string" }, css: { type: "string" }, json: { type: "string" }, real: { type: "string" }, blocks: { type: "boolean" } } });
  if (!existsSync(CHROMIUM)) {
    console.error(`Нет Chromium: ${CHROMIUM} — укажите CHROMIUM_PATH.`);
    process.exit(2);
  }
  const real = values.real ? path.resolve(values.real) : undefined;
  const books = [...(real ? realBooks(real) : snapshotBooks(!!values.quick))].filter((b) => !values.filter || b.key.includes(values.filter));
  const jobs = Number(values.jobs ?? 3);
  const started = performance.now();
  await openFixtureStorage(undefined, photoNamesFor(books));
  // PARITY_STAMP — взять PDF из кэша другого дерева (сверка превью старого кода с тем же PDF).
  const stamp = process.env.PARITY_STAMP ?? codeStamp();
  const pdf = new Map<string, BookFlow>();
  await runPool(books, jobs, async (b) => pdf.set(b.key, await cachedPdf(b, stamp, real)));
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
  let firstOk = 0;
  for (const b of books) {
    const p = pdf.get(b.key)!.first;
    const h = html.get(b.key)!.first;
    if (p === h) firstOk++;
    else console.log(`✗ ${b.key}: первая глава — полоса ${p} в PDF, ${h} в превью`);
  }
  console.log(`Номер полосы первой главы совпал: ${firstOk}/${books.length}`);
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
    if ((badC.length || badE.length) && values.blocks) {
      // Первый блок, который встал иначе (полоса или верх больше чем на 1 pt), в каждой главе с расхождением.
      const p = pdf.get(r.book)!.blocks ?? {};
      const h = html.get(r.book)!.blocks ?? {};
      for (const key of Object.keys(p)) {
        const hb = new Map((h[key] ?? []).map((b) => [b[0], b] as const));
        const diff = p[key].find((b) => {
          const x = hb.get(b[0]);
          return !x || x[1] !== b[1] || Math.abs(x[2] - b[2]) > 1;
        });
        if (diff) console.log(`   ${r.book} ${key}: ${diff[0]} PDF ${diff.slice(1).join("/")} превью ${hb.get(diff[0])?.slice(1).join("/") ?? "—"}`);
        if (diff && process.env.PARITY_AROUND) {
          const i = p[key].indexOf(diff);
          for (const b of p[key].slice(Math.max(0, i - 3), i + 3)) console.log(`      ${b[0].slice(0, 30)} PDF ${b.slice(1).join("/")} превью ${hb.get(b[0])?.slice(1).join("/") ?? "—"}`);
        }
      }
    }
    if (badC.length || badE.length)
      console.log(`✗ ${r.book}: главы ${badC.map((c) => `${c.key} ${c.pdf}→${c.html}`).join(", ") || "—"}; истории ${badE.map((e) => `${e.id.slice(0, 8)} ${e.pdf}→${e.html}${pdf.get(r.book)!.breakBefore?.includes(e.id) ? " (разрыв доводки)" : ""}`).join(", ") || "—"}`);
  }
  console.log(`Полос у глав совпало: ${chaptersOk}/${chapters}; начало историй совпало: ${entriesOk}/${entries} — ${seconds(started)}`);
  if (values.json) await writeFile(values.json, JSON.stringify(reports, null, 2));
}

if (process.argv[2] === "--worker") {
  const reply = (message: object, code: number) => process.send?.(message, () => process.exit(code));
  pdfFlow(process.argv[3], process.argv[4]).then(
    (result) => reply({ result }, 0),
    (err: unknown) => reply({ error: err instanceof Error ? err.message : String(err) }, 1),
  );
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
