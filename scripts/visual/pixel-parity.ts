/**
 * Попиксельная сверка полос превью с печатным PDF: превью редактора (PagePreview на стенде html-snapshot, Chromium,
 * deviceScaleFactor 2) против полос renderInterior ("print", без вылетов) той же книги. Для каждой полосы превью —
 * полоса PDF, на которую она похожа больше всего, общий сдвиг по вертикали и средняя разница; ниже — полосы по 36 px,
 * где строки стоят иначе, чем полоса в целом (сдвиг ≥ 2 px, разница > 6 — это уже не сглаживание растра).
 * Сверка parity.ts проверяет, на каких полосах что стоит; эта — что внутри полосы всё на тех же местах.
 *
 *   CHROMIUM_PATH=… npx tsx --import ./scripts/preload.mjs scripts/visual/pixel-parity.ts --books classic-a5-ru,kids-a5-kk [--pages 6]
 *
 * Картинки (полосы превью h<n>.png, полосы PDF p-<n>.png) — в /tmp/pixel-parity/<книга>.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import sharp from "sharp";
import { useFixtureStorage as openFixtureStorage } from "../../tests/fixtures/photos";
import { photoNamesFor, snapshotBooks } from "./books";
import { freezeRuntime } from "./freeze";
import { buildStandAssets } from "./html-assets";
import { ORIGIN, startStandServer } from "./html-server";

const { values } = parseArgs({ args: process.argv.slice(2), options: { books: { type: "string" }, pages: { type: "string" } } });
const keys = (values.books ?? "classic-a5-ru").split(",");
const PAGES = Number(values.pages ?? 6);
const OUT = "/tmp/pixel-parity";
const DPR = 2;
/** Полоса сверки по вертикали, px; что считать расхождением внутри полосы. */
const BAND = 36;
const ODD = { dy: 2, diff: 6 };

const books = snapshotBooks(false).filter((b) => keys.includes(b.key));
const restore = freezeRuntime();
await openFixtureStorage(undefined, photoNamesFor(books));
const render = await import("@/modules/production/infrastructure/pdf/render");
const { getFormat, print } = await import("@/lib/book/formats");
const { standViews } = await import("./html-data");
restore();
const server = await startStandServer(await buildStandAssets(), books);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

/** Средняя разница серых полос a и b (b сдвинута на dy, dx) в строках [y0, y1). */
function diff(a: Buffer, b: Buffer, W: number, H: number, y0: number, y1: number, dy = 0, dx = 0) {
  let d = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    const yy = y + dy;
    if (yy < 0 || yy >= H) continue;
    for (let x = 8; x < W - 8; x += 2) {
      d += Math.abs(a[y * W + x] - b[yy * W + x + dx]);
      n++;
    }
  }
  return n ? d / n : 0;
}

try {
  for (const b of books) {
    const dir = `${OUT}/${b.key}`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const res = await render.renderInterior(b.bundle, "print");
    writeFileSync(`${dir}/book.pdf`, res.pdf);
    const view = standViews(b).find((v) => v.kind === "preview")!;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: DPR });
    await ctx.route("**/*", async (r) => {
      const x = await server.respond(new URL(r.request().url()), view).catch(() => undefined);
      return x ? r.fulfill(x) : r.abort();
    });
    const page = await ctx.newPage();
    await page.goto(ORIGIN);
    await page.waitForSelector("body[data-ready]", { state: "attached" });
    await page.waitForTimeout(1500);
    const els = await page.locator("#stand > div > div > :not([aria-hidden])").all();
    const n = Math.min(els.length, PAGES);
    for (let i = 0; i < n; i++) await els[i].screenshot({ path: `${dir}/h${i}.png` });
    const first = Number(await page.locator("[data-first-page]").first().getAttribute("data-first-page"));
    await ctx.close();

    // Полосы PDF вокруг тех же номеров — без вылетов, в размер полосы превью.
    execFileSync("pdftoppm", ["-r", "220", "-png", "-f", String(Math.max(1, first - 2)), "-l", String(first + n + 2), `${dir}/book.pdf`, `${dir}/p`]);
    const { width: W = 0, height: H = 0 } = await sharp(`${dir}/h0.png`).metadata();
    const fmt = getFormat(b.bundle.book.format);
    const pdfPages: { name: string; data: Buffer }[] = [];
    for (const f of readdirSync(dir).filter((x) => /^p-\d+\.png$/.test(x)).sort()) {
      const meta = await sharp(`${dir}/${f}`).metadata();
      const s = meta.width! / (fmt.widthMm + print.bleedMm * 2);
      const crop = { left: Math.round(print.bleedMm * s), top: Math.round(print.bleedMm * s), width: Math.round(fmt.widthMm * s), height: Math.round(fmt.heightMm * s) };
      pdfPages.push({ name: f, data: await sharp(`${dir}/${f}`).extract(crop).resize(W, H, { fit: "fill" }).greyscale().raw().toBuffer() });
    }
    const ptPerPx = ((fmt.heightMm * 72) / 25.4) / H;
    for (let i = 0; i < n; i++) {
      const h = await sharp(`${dir}/h${i}.png`).resize(W, H, { fit: "fill" }).greyscale().raw().toBuffer();
      let best = { name: "", data: pdfPages[0].data, dy: 0, v: Infinity };
      for (const p of pdfPages) {
        const v = diff(p.data, h, W, H, 40, H - 40);
        if (v < best.v) best = { ...p, dy: 0, v };
      }
      for (let dy = -10; dy <= 10; dy++) {
        const v = diff(best.data, h, W, H, 40, H - 40, dy);
        if (v < best.v) best = { ...best, dy, v };
      }
      const odd: string[] = [];
      for (let y0 = 20; y0 + BAND <= H - 20; y0 += BAND) {
        let ink = 0;
        for (let y = y0; y < y0 + BAND; y++) for (let x = 0; x < W; x += 2) if (best.data[y * W + x] < 160) ink++;
        if (ink < 30) continue;
        let band = { dy: 0, dx: 0, v: Infinity };
        for (let dy = -14; dy <= 14; dy++)
          for (let dx = -4; dx <= 4; dx++) {
            const v = diff(best.data, h, W, H, y0, y0 + BAND, dy, dx);
            if (v < band.v) band = { dy, dx, v };
          }
        if (Math.abs(band.dy - best.dy) >= ODD.dy || Math.abs(band.dx) >= ODD.dy || band.v > ODD.diff) odd.push(`y${y0}:${band.dy}/${band.dx}(${band.v.toFixed(1)})`);
      }
      console.log(`${b.key} h${i} ≈ ${best.name}: сдвиг ${best.dy} px (${(best.dy * ptPerPx).toFixed(2)} pt), разница ${best.v.toFixed(2)}${odd.length ? ` · иначе: ${odd.join(" ")}` : ""}`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
