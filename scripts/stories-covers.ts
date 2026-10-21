/**
 * Обложки для сторис Instagram: каждая обложка из выбора — отдельный PNG 1080×1920 (9:16).
 * Обложка — как на сайте: фон из renderCoverSvg (снимки шаблонов и снимки-примеры — в полном размере), текст —
 * компонентом CoverFace со шрифтами сайта; растр — в Chromium с запасом по плотности, затем уменьшение Lanczos.
 * Обложка стоит по центру и не обрезается; верхние и нижние 250 px (там интерфейс Instagram и место под логотип)
 * свободны — в них только фон.
 *
 * Запуск: npx tsx --import ./scripts/preload.mjs scripts/stories-covers.ts [каталог=stories-covers]
 *   --bg blur|brand|paper  фон: размытая копия обложки (по умолчанию), фирменный бордовый, светлая «бумага»
 *   --only id,id           только эти обложки (номера в именах файлов остаются как в полном списке)
 *   --all                  вместе с убранными из выбора
 *   --lang ru|kk|mix       язык надписей: mix (по умолчанию) — каждая третья обложка на казахском (≈ 32 %)
 *   --no-text              без надписей на обложке
 *   --guides               показать безопасные зоны (для проверки, не для публикации)
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { CoverFace } from "@/components/cover/CoverFace";
import { catalog } from "@/i18n/messages/ru/catalog";
import { landing as landingKk } from "@/i18n/messages/kk/landing";
import { landing } from "@/i18n/messages/ru/landing";
import { allCoverTemplates, coverTemplates, renderCoverSvg, type CoverTemplate } from "@/lib/book/covers";
import { coverFrontGeometry, getFormat } from "@/lib/book/formats";
import { coverPhotoDataUrl } from "@/modules/production";
import { buildStandAssets } from "./visual/html-assets";

const STORY = { w: 1080, h: 1920, safe: 250 };
/** Обложка A5 (148 × 210 мм = 74 : 105) — 888 × 1260 px без округлений; до безопасных зон остаётся по 80 px. */
const COVER = { w: 888, h: 1260 };
/** Плотность растра в Chromium: обложка снимается втрое крупнее и уменьшается — чистые края букв и линий. */
const SUPERSAMPLE = 3;
const BRAND = { wine: "#7a1f2b", wineDark: "#5c1520", paper: "#faf7f2", cream: "#f3ede3" };
const ORIGIN = "http://stories.local";

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    bg: { type: "string", default: "blur" },
    only: { type: "string" },
    all: { type: "boolean", default: false },
    lang: { type: "string", default: "mix" },
    "no-text": { type: "boolean", default: false },
    guides: { type: "boolean", default: false },
  },
});
const bg = opts.bg as "blur" | "brand" | "paper";
if (!["blur", "brand", "paper"].includes(bg)) throw new Error(`--bg: blur, brand или paper, а не «${bg}»`);
const lang = opts.lang as "ru" | "kk" | "mix";
if (!["ru", "kk", "mix"].includes(lang)) throw new Error(`--lang: ru, kk или mix, а не «${lang}»`);
const out = path.resolve(positionals[0] ?? "stories-covers");

/**
 * Надписи — как на обложках-примерах лендинга; у обложек с фото клиента их там нет — подбираем по снимку-примеру.
 */
const bySample: Record<"ru" | "kk", Record<string, { title: string; names: string }>> = {
  ru: {
    family: { title: "Наша семья", names: "Бабушке от внуков" },
    familydusk: { title: "Наша семья", names: "Бабушке от внуков" },
    mamahug: { title: "Мама, это для тебя", names: "Твоя Айгерим" },
    daddy: { title: "Папа, спасибо", names: "от Арнура" },
    friends: { title: "Друзья навсегда", names: "Мадина & Жанель" },
    laughter: { title: "Друзья навсегда", names: "Мадина & Жанель" },
    newborn: { title: "Наш малыш", names: "Мама и папа" },
  },
  kk: {
    family: { title: "Біздің отбасы", names: "Әжеге немерелерінен" },
    familydusk: { title: "Біздің отбасы", names: "Әжеге немерелерінен" },
    mamahug: { title: "Анашым, бұл саған", names: "Айгеріміңнен" },
    daddy: { title: "Әке, рахмет", names: "Арнұрдан" },
    friends: { title: "Мәңгі достар", names: "Мадина & Жанель" },
    laughter: { title: "Мәңгі достар", names: "Мадина & Жанель" },
    newborn: { title: "Біздің бүлдіршін", names: "Ана мен әке" },
  },
};
const fallbackText = { ru: { title: "Наша история", names: "Дана & Тимур" }, kk: { title: "Біздің тарихымыз", names: "Дана & Тимур" } };
/** Надписи по языку; в режиме mix на казахском — каждая третья обложка списка, чтобы он был не реже 30 %. */
const kazakh = (no: number) => lang === "kk" || (lang === "mix" && no % 3 === 0);
const coverText = (t: CoverTemplate, no: number) => {
  const l = kazakh(no) ? "kk" : "ru";
  return (l === "kk" ? landingKk : landing).coverSamples[t.id] ?? bySample[l][t.samples?.[0] ?? ""] ?? fallbackText[l];
};

/**
 * Надпись не должна ложиться на лица: у этих обложек область текста сдвинута вниз, под снимок
 * (только в выгрузке для сторис, шаблоны на сайте не меняются).
 */
const textAreaFix: Record<string, Partial<Pick<CoverTemplate, "textArea" | "justify">>> = {
  magazine: { textArea: { x: 0.08, y: 0.78, w: 0.84, h: 0.18 }, justify: "end" },
  duotone: { textArea: { x: 0.09, y: 0.8, w: 0.82, h: 0.17 }, justify: "end" },
  glow: { textArea: { x: 0.1, y: 0.79, w: 0.8, h: 0.18 }, justify: "end" },
};

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya", ә: "a", ғ: "g", қ: "k", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};
const slug = (s: string) =>
  [...s.toLowerCase()]
    .map((c) => TRANSLIT[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Обложка с надписями: разметка CoverFace, фон — встроенный SVG со снимками в полном размере. */
async function coverMarkup(source: CoverTemplate, no: number) {
  const t = { ...source, ...textAreaFix[source.id] };
  const format = getFormat("a5");
  const imageHref = t.photo ? await coverPhotoDataUrl(t.photo.photo.key) : undefined;
  const samples = new Map(await Promise.all((t.samples ?? []).map(async (k) => [k, await coverPhotoDataUrl(k)] as const)));
  const svg = renderCoverSvg(t, coverFrontGeometry(format), { uid: `st${t.id}`, imageHref, sampleHref: (k) => samples.get(k) ?? "" });
  const text = opts["no-text"] ? { title: "", names: undefined } : coverText(t, no);
  return renderToStaticMarkup(createElement(CoverFace, { template: t, format: format.id, svg, title: text.title, names: text.names, titlePlaceholder: "" }));
}

/** Фон сторис без обложки. */
async function background(cover: Buffer): Promise<Buffer> {
  if (bg === "blur") {
    // Увеличенная копия обложки на весь кадр, сильно размытая и чуть приглушённая — обложка остаётся главной.
    return sharp(cover)
      .resize(STORY.w, STORY.h, { fit: "cover", kernel: "lanczos3" })
      .blur(48)
      .modulate({ brightness: 0.8, saturation: 1.05 })
      .removeAlpha()
      .toBuffer();
  }
  const [top, bottom] = bg === "brand" ? [BRAND.wine, BRAND.wineDark] : [BRAND.paper, BRAND.cream];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${STORY.w}" height="${STORY.h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return sharp(Buffer.from(svg)).removeAlpha().toBuffer();
}

/** Мягкая тень под обложкой, как shadow-book на сайте. */
function shadow(left: number, top: number) {
  const alpha = bg === "paper" ? 0.28 : 0.5;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${STORY.w}" height="${STORY.h}"><defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="26"/></filter></defs><rect x="${left + 14}" y="${top + 30}" width="${COVER.w - 28}" height="${COVER.h - 20}" fill="#140a06" fill-opacity="${alpha}" filter="url(#s)"/></svg>`,
  );
}

/** Безопасные зоны полупрозрачным красным — только с --guides. */
function guides() {
  const band = (y: number) => `<rect x="0" y="${y}" width="${STORY.w}" height="${STORY.safe}" fill="#ff2d55" fill-opacity="0.25"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${STORY.w}" height="${STORY.h}">${band(0)}${band(STORY.h - STORY.safe)}</svg>`);
}

async function story(cover: Buffer) {
  const left = (STORY.w - COVER.w) / 2;
  const top = (STORY.h - COVER.h) / 2;
  const layers = [{ input: shadow(left, top) }, { input: cover, left, top }, ...(opts.guides ? [{ input: guides() }] : [])];
  return sharp(await background(cover))
    .composite(layers)
    .removeAlpha()
    .withIccProfile("srgb")
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function main() {
  const list = (opts.all ? allCoverTemplates : coverTemplates).map((t, i) => ({ t, no: i + 1 }));
  const only = opts.only?.split(",");
  const todo = only ? list.filter(({ t }) => only.includes(t.id)) : list;
  if (only && todo.length !== only.length) throw new Error(`Нет обложек: ${only.filter((id) => !list.some(({ t }) => t.id === id)).join(", ")}`);
  const pad = String(list.length).length < 2 ? 2 : String(list.length).length;
  const fileName = (t: CoverTemplate, no: number) => `cover-${String(no).padStart(pad, "0")}-${slug(catalog.covers[t.id] ?? t.name?.ru ?? t.id) || t.id}.png`;

  await mkdir(out, { recursive: true });
  // Полная выгрузка заменяет прежнюю: номера могли сдвинуться, старые файлы не должны остаться рядом.
  if (!only) for (const f of await readdir(out)) if (/^cover-\d+-.*\.png$/.test(f)) await rm(path.join(out, f));

  const assets = await buildStandAssets();
  const executablePath = process.env.CHROMIUM_PATH || (existsSync(chromium.executablePath()) ? undefined : "/opt/pw-browsers/chromium-1194/chrome-linux/chrome");
  const browser = await chromium.launch({ executablePath });
  try {
    const page = await browser.newPage({ viewport: { width: COVER.w, height: COVER.h }, deviceScaleFactor: SUPERSAMPLE });
    await page.route(`${ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/") {
        const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><link rel="stylesheet" href="/stand.css"><style>html,body{margin:0;background:transparent}#c{width:${COVER.w}px}</style></head><body><div id="c"></div></body></html>`;
        return route.fulfill({ contentType: "text/html", body: html });
      }
      if (url.pathname === "/stand.css") return route.fulfill({ contentType: "text/css", body: assets.css });
      const font = url.pathname.startsWith("/fonts/") ? assets.fonts.get(path.basename(url.pathname)) : undefined;
      if (font) return route.fulfill({ contentType: "font/woff2", path: font });
      return route.fulfill({ status: 404 });
    });
    await page.goto(`${ORIGIN}/`);
    // Все начертания — до первой обложки: текст сразу ложится окончательными шрифтами.
    await page.evaluate(async () => {
      await Promise.all([...document.fonts].map((f) => f.load().catch(() => undefined)));
      await document.fonts.ready;
    });

    const written: string[] = [];
    for (const { t, no } of todo) {
      const markup = await coverMarkup(t, no);
      await page.evaluate(async (html) => {
        const root = document.getElementById("c")!;
        root.innerHTML = html;
        // Снимки внутри SVG грузятся асинхронно: ждём каждый (load или error), затем два кадра на отрисовку.
        const images = [...root.querySelectorAll("image")];
        await Promise.all(images.map((img) => new Promise((resolve) => (img.addEventListener("load", resolve, { once: true }), img.addEventListener("error", resolve, { once: true }), setTimeout(resolve, 15000)))));
        await document.fonts.ready;
        for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
      }, markup);
      const shot = await page.locator("#c > div").screenshot({ type: "png", animations: "disabled" });
      const cover = await sharp(shot).resize(COVER.w, COVER.h, { fit: "fill", kernel: "lanczos3" }).removeAlpha().toBuffer();
      const file = fileName(t, no);
      await writeFile(path.join(out, file), await story(cover));
      written.push(file);
      console.log(`${file}  ← ${t.id}${opts["no-text"] ? "" : kazakh(no) ? "  [kk]" : ""}`);
    }
    console.log(`\n${written.length} файлов в ${path.relative(process.cwd(), out) || "."}/ (фон: ${bg})`);
  } finally {
    await browser.close();
  }
}

await main();
