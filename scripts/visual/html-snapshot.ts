/**
 * Снимки HTML (S4): развороты InteriorSpread (все SpreadKind) и превью PagePreview на книгах набора в Chromium
 * (Playwright): окно фиксированного размера, deviceScaleFactor 1, анимации выключены, время зафиксировано.
 * Ключи — html:<вид>:<книга>, вид — chapter, front, toc, photos (разворот целиком) или preview (полосы превью
 * по одной). Формат снимка тот же, что у pdf-snapshot; сверка — compare.ts, с эталонным коммитом — check.sh.
 *
 * Запуск из корня репозитория:
 *   npx tsx --import ./scripts/preload.mjs scripts/visual/html-snapshot.ts --out <каталог> [--filter <подстрока ключа>] [--quick] [--jobs N]
 *
 * Книги: на каждое оформление A5 ru и квадрат kk (с фото в конце книги), --quick — только A5 ru.
 */
import { chromium, type Browser, type Route } from "playwright";
import { fixtureBooks, type FixtureBook } from "../../tests/fixtures/books";
import { photoFiles } from "../../tests/fixtures/photos";
import { FIXED_TIME, freezeRuntime } from "./freeze";
import { buildStandAssets, standHtml, type StandAssets } from "./html-assets";
import type { StandView } from "./html-data";
import { entryFor, errorEntry, freshKeyDir, pagePath, prepareOut, reportSnapshot, runPool, seconds, snapshotFlags, writeManifest, type Manifest, type ManifestEntry } from "./shared";

const ORIGIN = "http://stand.local";
const VIEWPORT = { width: 1280, height: 900 };
/** Что снимать: разворот целиком или каждую полосу превью (начальные полосы и полосы текста, без скрытых копий для замера). */
const TARGETS = { spread: "#stand > div", preview: "#stand > div > div > :not([aria-hidden])" };
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

interface Stand {
  assets: StandAssets;
  /** Фото книг по id: превью (?size=thumb) и файл хранилища (?size=full). */
  photos: Map<string, { thumb: Buffer; full: Buffer }>;
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

async function photoIndex(books: FixtureBook[]): Promise<Stand["photos"]> {
  const files = await photoFiles();
  const file = (key: string) => {
    const data = files.get(key);
    if (!data) throw new Error(`Нет фото ${key} в наборе`);
    return data;
  };
  return new Map(books.flatMap((b) => b.bundle.photos.map((p) => [p.id, { thumb: file(p.thumbKey), full: file(p.storageKey) }] as const)));
}

/** Ответ стенда на запрос; undefined — такого стенд не отдаёт. */
function respond(url: URL, stand: Stand, view: StandView): Parameters<Route["fulfill"]>[0] | undefined {
  if (url.origin !== ORIGIN) return undefined;
  if (url.pathname === "/") return { contentType: "text/html", body: standHtml(view) };
  if (url.pathname === "/stand.js") return { contentType: "text/javascript", body: stand.assets.js };
  if (url.pathname === "/stand.css") return { contentType: "text/css", body: stand.assets.css };
  if (url.pathname === "/favicon.ico") return { status: 404 };
  const [, dir, name] = url.pathname.match(/^\/(fonts|api\/photos)\/([^/]+)$/) ?? [];
  const font = dir === "fonts" ? stand.assets.fonts.get(name) : undefined;
  if (font) return { contentType: "font/woff2", path: font };
  // Как /api/photos/[id]: full — файл хранилища, иначе превью; view (уменьшенная копия для 3D) стенду не нужна.
  const photo = dir === "api/photos" ? stand.photos.get(name) : undefined;
  const size = url.searchParams.get("size");
  if (photo && size !== "view") return { contentType: "image/jpeg", body: size === "full" ? photo.full : photo.thumb };
  return undefined;
}

async function shoot(browser: Browser, stand: Stand, view: StandView, out: string): Promise<ManifestEntry> {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: "reduce", locale: "ru-RU", timezoneId: "UTC" });
  try {
    const unexpected: string[] = [];
    const errors: string[] = [];
    // Любой запрос, который стенд не отдаёт, — ошибка снимка: значит, компонент стал грузить что-то новое.
    await context.route("**/*", (route) => {
      const response = respond(new URL(route.request().url()), stand, view);
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
    const targets = page.locator(view.kind === "preview" ? TARGETS.preview : TARGETS.spread);
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

async function main() {
  const flags = snapshotFlags(process.argv.slice(2));
  const books = [...fixtureBooks({ formats: ["a5"], languages: ["ru"] }), ...(flags.quick ? [] : fixtureBooks({ formats: ["square"], languages: ["kk"] }))];
  const started = performance.now();
  const list = await views(books, flags.filter);
  const [assets, photos] = await Promise.all([buildStandAssets(), photoIndex(books)]);
  console.log(`Стенд собран за ${seconds(started)}: видов ${list.length}`);
  await prepareOut(flags.out);
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const manifest: Manifest = {};
  let done = 0;
  try {
    await runPool(list, flags.jobs, async (view) => {
      manifest[view.key] = await shoot(browser, { assets, photos }, view, flags.out).catch(errorEntry);
      if (++done % 20 === 0 || done === list.length) console.log(`[${done}/${list.length}] ${seconds(started)}`);
    });
  } finally {
    await browser.close();
  }
  await writeManifest(flags.out, manifest);
  reportSnapshot(manifest, flags.out, started);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 2;
});
