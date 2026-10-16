/**
 * Снимки HTML (S4): развороты InteriorSpread (все SpreadKind), превью PagePreview, полосы 3D-книги и оборот
 * CoverBackPreview на книгах набора в Chromium (Playwright): окно фиксированного размера, deviceScaleFactor 1,
 * анимации выключены, время зафиксировано. Ключи — html:<вид>:<книга>, вид — chapter, front, toc, photos
 * (разворот целиком), preview и flipbook (полосы по одной) или back (оборот целиком). Формат снимка тот же,
 * что у pdf-snapshot; сверка — compare.ts, с эталонным коммитом — check.sh.
 *
 * Запуск из корня репозитория:
 *   npx tsx --import ./scripts/preload.mjs scripts/visual/html-snapshot.ts --out <каталог> [--filter <подстрока ключа>] [--quick] [--jobs N]
 *
 * Книги — books.ts: весь набор и варианты, --quick — каждое оформление один раз (формат и язык по кругу) и варианты.
 */
import { existsSync } from "node:fs";
import { chromium, type Browser } from "playwright";
import type { FixtureBook } from "../../tests/fixtures/books";
import { snapshotBooks } from "./books";
import { FIXED_TIME, freezeRuntime } from "./freeze";
import { buildStandAssets } from "./html-assets";
import type { StandView } from "./html-data";
import { ORIGIN, startStandServer, type StandServer } from "./html-server";
import { entryFor, errorEntry, failSnapshot, freshKeyDir, pagePath, prepareOut, reportSnapshot, runPool, seconds, SetupError, snapshotFlags, writeManifest, type Manifest, type ManifestEntry, type SnapshotFlags } from "./shared";

const VIEWPORT = { width: 1280, height: 900 };
/**
 * Что снимать: разворот или оборот целиком, каждую полосу превью (начальные полосы и полосы текста, без скрытых
 * копий для замера) или каждую полосу 3D-книги.
 */
const TARGETS: Partial<Record<StandView["kind"], string>> = { preview: "#stand > div > div > :not([aria-hidden])", flipbook: "#stand > [data-face]" };
const WHOLE = "#stand > div";
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/** Chromium есть? Playwright по умолчанию ищет свою сборку, а на машине может стоять другая — путь задаётся явно. */
function requireChromium() {
  if (existsSync(CHROMIUM)) return;
  throw new SetupError(
    [
      `Нет Chromium: ${CHROMIUM} (${process.env.CHROMIUM_PATH ? "CHROMIUM_PATH" : "путь по умолчанию"}).`,
      "Укажите исполняемый файл в CHROMIUM_PATH, например: CHROMIUM_PATH=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | tail -1)",
      `или поставьте сборку Playwright (npx playwright install chromium) — её путь: node -e "console.log(require('playwright').chromium.executablePath())".`,
    ].join("\n"),
  );
}

/** Данные стенда: строятся с замороженным временем (год на развороте), затем время возвращается — Playwright нужны настоящие часы. */
async function views(books: FixtureBook[], filter?: string): Promise<StandView[]> {
  const restore = freezeRuntime();
  try {
    const { standViews } = await import("./html-data");
    return books.flatMap(standViews).filter((v) => !filter || v.key.includes(filter));
  } finally {
    restore();
  }
}

async function shoot(browser: Browser, server: StandServer, view: StandView, out: string): Promise<ManifestEntry> {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: "reduce", locale: "ru-RU", timezoneId: "UTC" });
  try {
    const unexpected: string[] = [];
    const errors: string[] = [];
    // Любой запрос, который стенд не отдаёт, — ошибка снимка: значит, компонент стал грузить что-то новое.
    await context.route("**/*", async (route) => {
      const response = await server.respond(new URL(route.request().url()), view).catch(() => undefined);
      if (response) return route.fulfill(response);
      unexpected.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (err) => errors.push(err.message));
    await page.clock.setFixedTime(FIXED_TIME);
    await page.goto(ORIGIN);
    await page.waitForSelector("body[data-ready]", { state: "attached", timeout: 60_000 });
    if (errors.length) throw new Error(`Ошибка на странице: ${errors[0]}`);
    if (unexpected.length) throw new Error(`Неожиданный запрос: ${unexpected[0]}`);
    const targets = page.locator(TARGETS[view.kind] ?? WHOLE);
    const dir = await freshKeyDir(out, view.key);
    const files: string[] = [];
    for (let i = 0, n = await targets.count(); i < n; i++) {
      await targets.nth(i).screenshot({ path: pagePath(dir, i), animations: "disabled", caret: "hide" });
      files.push(pagePath(dir, i));
    }
    return await entryFor(files);
  } finally {
    await context.close();
  }
}

/** Все виды в одном Chromium, не больше jobs вкладок одновременно. */
async function shootAll(server: StandServer, list: StandView[], flags: SnapshotFlags, started: number): Promise<Manifest> {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const manifest: Manifest = {};
  let done = 0;
  try {
    await runPool(list, flags.jobs, async (view) => {
      manifest[view.key] = await shoot(browser, server, view, flags.out).catch(errorEntry);
      if (++done % 20 === 0 || done === list.length) console.log(`[${done}/${list.length}] ${seconds(started)}`);
    });
  } finally {
    await browser.close();
  }
  return manifest;
}

async function main() {
  const flags = snapshotFlags(process.argv.slice(2));
  requireChromium();
  const books = snapshotBooks(flags.quick);
  const started = performance.now();
  const server = await startStandServer(await buildStandAssets(), books);
  try {
    const list = await views(books, flags.filter);
    console.log(`Стенд собран за ${seconds(started)}: видов ${list.length}`);
    await prepareOut(flags.out);
    const manifest = await shootAll(server, list, flags, started);
    await writeManifest(flags.out, manifest);
    reportSnapshot(manifest, flags.out, started);
  } finally {
    await server.close();
  }
}

main().catch(failSnapshot);
