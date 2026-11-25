import "server-only";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { getFormat } from "@/lib/book/formats";
import type { BookBuildPage } from "@/lib/book/book-build";
import { inPdfThread } from "./pdf/pool";
import { dedupe, slots } from "./pdf/queue";
import { contentFingerprint, type BookBundle } from "./pdf/render";
import { RasterizerMissingError } from "../application/PrintFilesService";

/**
 * Развороты «Страниц» картинками — для приложения, где нет браузерной вёрстки сайта (InteriorSpread): те же четыре
 * разворота, что на сцене сайта, но нарисованные настоящей вёрсткой печати (PDF → poppler). Одна вёрстка короткой
 * выборки книги даёт все четыре разворота сразу:
 *   «Глава» — начальная полоса первой главы и первая полоса её текста (без начальной полосы — две полосы текста);
 *   «Фото» — первые две фотостраницы; «Титул» — титул и посвящение; «Оглавление» — оглавление и последняя страница.
 * Выключенные титул и оглавление, как на сайте, бледные (opacity 0.4); пустое посвящение — подсказка бледным.
 */

export const PAGES_SPREADS = ["chapter", "photos", "front", "toc"] as const;
export type PagesSpread = (typeof PAGES_SPREADS)[number];

/** Ширины картинки разворота: миниатюра стиля и большая сцена (экраны @3x). */
export const PAGES_IMAGE_WIDTHS = [600, 1200] as const;
export type PagesImageWidth = (typeof PAGES_IMAGE_WIDTHS)[number];

/** Сколько вопросов первой главы и сколько знаков ответа берёт выборка (первая полоса текста — как в книге). */
const FIRST_CHAPTER_QUESTIONS = 3;
const FIRST_ANSWER_CHARS = 4000;
/** Остальные главы — по одному ответу коротко: они нужны оглавлению, а не вёрстке. */
const OTHER_ANSWER_CHARS = 160;
/** Фото для разворота «Фото» (как у сайта: снимок на полосу и сетка из трёх). */
const SAMPLE_PHOTOS = 4;

/** Бледность выключенного титула и оглавления — как opacity 0.4 у InteriorSpread. */
const MUTED_OPACITY = 0.4;

/** Один растр за раз (pdftoppm занимает ядро; рядом вёрстка и сайт). */
const rasterSlot = slots(1);

export interface PagesSample {
  bundle: BookBundle;
  /** Что на сцене бледное: титул не печатается, оглавления нет, посвящения нет (подсказка). */
  muted: { title: boolean; toc: boolean; dedication: boolean };
}

/**
 * Выборка книги для разворотов: первая глава — первые ответы (как пример главы сайта), остальные главы — по одному
 * короткому ответу (их строки в оглавлении), фото — первые снимки книги на месте первой главы (правило фото книги:
 * у глав, альбомом в конце или без фото). Титул и оглавление печатаются всегда, а выключенные — бледные на картинке.
 */
export function pagesSample(
  b: BookBundle,
  dedicationPlaceholder: string,
): PagesSample {
  const sorted = [...b.questions].sort((x, y) => x.position - y.position);
  const answered = sorted.filter((q) => q.answer.trim());
  const firstChapter = answered[0]?.chapter ?? sorted[0]?.chapter;
  const first = sorted.filter((q) => q.chapter === firstChapter);
  const picked = [
    ...first.filter((q) => q.answer.trim()),
    ...first.filter((q) => !q.answer.trim()),
  ].slice(0, FIRST_CHAPTER_QUESTIONS);
  const others = new Map<string, (typeof sorted)[number]>();
  for (const q of answered)
    if (q.chapter !== firstChapter && !others.has(q.chapter))
      others.set(q.chapter, q);
  const questions = [
    ...picked.map((q) => ({
      ...q,
      answer: q.answer.slice(0, FIRST_ANSWER_CHARS),
      media: [],
    })),
    ...[...others.values()].map((q) => ({
      ...q,
      answer: q.answer.slice(0, OTHER_ANSWER_CHARS),
      media: [],
    })),
  ].sort((x, y) => x.position - y.position);
  const anchor =
    picked.find((q) => q.answer.trim())?.id ?? picked[0]?.id ?? null;
  // Фото начала первой главы остаётся своим (его выбирает автор), остальные — к первому ответу: встанут по правилу книги.
  const opener = b.photos.filter(
    (p) => p.opener && p.chapter === firstChapter && !p.questionId,
  );
  const rest = b.photos
    .filter((p) => !opener.includes(p))
    .slice(0, SAMPLE_PHOTOS);
  const photos = [
    ...opener,
    ...rest.map((p) => ({
      ...p,
      questionId: anchor,
      chapter: null,
      opener: false,
      inline: null,
    })),
  ];
  const dedication = b.book.dedication.trim();
  return {
    bundle: {
      ...b,
      book: {
        ...b.book,
        titlePage: true,
        showToc: true,
        dedication: dedication || dedicationPlaceholder,
      },
      questions,
      photos: anchor ? photos : [],
      letters: [],
    },
    muted: {
      title: b.book.titlePage === false,
      toc: !b.book.showToc,
      dedication: !dedication,
    },
  };
}

/** Версия разворотов: меняется со всем, что на них видно (текст выборки, фото, оформление, настройки, бледность). */
export function pagesVersion(s: PagesSample): string {
  return createHash("sha1")
    .update(contentFingerprint(s.bundle))
    .update(JSON.stringify([s.bundle.book.interiorStyle, s.muted]))
    .digest("hex")
    .slice(0, 16);
}

function pdftoppm(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      "pdftoppm",
      args,
      { encoding: "buffer", maxBuffer: 64 << 20, timeout: 45_000 },
      (err, stdout, stderr) => {
        if ((err as NodeJS.ErrnoException | null)?.code === "ENOENT")
          reject(new RasterizerMissingError());
        else if (err)
          reject(
            new Error(`pdftoppm: ${stderr.toString().trim() || err.message}`),
          );
        else resolve(stdout);
      },
    );
  });
}

/** Полоса n PDF растром шириной width (RGB). */
async function rasterPage(file: string, n: number, width: number) {
  const ppm = await rasterSlot(() =>
    pdftoppm([
      "-f",
      String(n),
      "-l",
      String(n),
      "-scale-to-x",
      String(width),
      "-scale-to-y",
      "-1",
      file,
    ]),
  );
  const header = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(
    ppm.subarray(0, 64).toString("latin1"),
  );
  if (!header) throw new Error("pdftoppm: not a PPM");
  const [w, h] = [Number(header[1]), Number(header[2])];
  return sharp(ppm.subarray(header[0].length, header[0].length + w * h * 3), {
    raw: { width: w, height: h, channels: 3 },
  });
}

/** Какие полосы выборки встают на развороты (номера с 1; null — такого разворота в книге нет). */
export function spreadPages(
  pages: BookBuildPage[],
  chapterStart: string,
): Record<PagesSpread, [number, number] | null> {
  const of = (kind: BookBuildPage["kind"]) =>
    pages.filter((p) => p.kind === kind).map((p) => p.n);
  const front = of("front");
  const text = of("text");
  const opener = pages.find(
    (p) => p.kind === "opener" && p.chapterKey !== "__gallery",
  );
  const firstText = opener ? text.find((n) => n > opener.n) : undefined;
  const photos = of("photo");
  const toc = of("toc");
  const end = of("end");
  return {
    // Титул, выходные данные, посвящение: на развороте — титул и посвящение.
    front: front.length >= 3 ? [front[0], front[2]] : null,
    chapter:
      chapterStart === "page" && opener && firstText
        ? [opener.n, firstText]
        : text.length >= 2
          ? [text[0], text[1]]
          : null,
    photos:
      photos.length >= 2
        ? [photos[0], photos[1]]
        : photos.length === 1
          ? [photos[0], photos[0]]
          : null,
    toc: toc.length && end.length ? [toc[0], end[end.length - 1]] : null,
  };
}

/** Тень у корешка, как у раскрытой книги на сайте: по 7 % ширины разворота с каждой стороны, чёрный 10 % → прозрачный. */
function spineShade(w: number, h: number) {
  const band = Math.round(w * 0.07);
  const mid = w / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs>` +
      `<linearGradient id="l" x1="1" x2="0"><stop offset="0" stop-color="#000" stop-opacity=".10"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="r" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".10"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>` +
      `<rect x="${mid - band}" y="0" width="${band}" height="${h}" fill="url(#l)"/><rect x="${mid}" y="0" width="${band}" height="${h}" fill="url(#r)"/></svg>`,
  );
}

/** Бледная полоса: белый поверх с 1 − opacity — как opacity 0.4 на белом листе сайта. */
async function muted(page: ReturnType<typeof sharp>, w: number, h: number) {
  const veil = await sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 - MUTED_OPACITY },
    },
  })
    .png()
    .toBuffer();
  return sharp(await page.png().toBuffer()).composite([{ input: veil }]);
}

/**
 * Все развороты выборки картинками WebP шириной width (разворот целиком). Вёрстка одна на все четыре; разворота
 * нет (нет фото) — его нет и в ответе.
 */
export async function renderPagesSpreads(
  s: PagesSample,
  width: PagesImageWidth,
): Promise<Partial<Record<PagesSpread, Buffer>>> {
  const dir = await mkdtemp(path.join(tmpdir(), "mybook-pages-"));
  try {
    const { pdf, layout } = await inPdfThread({
      task: "preview",
      bundle: s.bundle,
    });
    const file = path.join(dir, "book.pdf");
    await writeFile(file, pdf);
    const format = getFormat(s.bundle.book.format);
    const pageW = Math.round(width / 2);
    const pageH = Math.round((pageW * format.heightMm) / format.widthMm);
    const plan = spreadPages(
      layout.pages,
      s.bundle.book.chapterStart ?? "page",
    );
    const dim: Record<PagesSpread, [boolean, boolean]> = {
      front: [s.muted.title, s.muted.dedication],
      toc: [s.muted.toc, false],
      chapter: [false, false],
      photos: [false, false],
    };
    const out: Partial<Record<PagesSpread, Buffer>> = {};
    for (const kind of PAGES_SPREADS) {
      const pair = plan[kind];
      if (!pair) continue;
      const sides = await Promise.all(
        pair.map(async (n, i) => {
          const page = (await rasterPage(file, n, pageW)).resize(pageW, pageH, {
            fit: "fill",
          });
          return (dim[kind][i] ? await muted(page, pageW, pageH) : page)
            .png()
            .toBuffer();
        }),
      );
      out[kind] = await sharp({
        create: {
          width: pageW * 2,
          height: pageH,
          channels: 3,
          background: "#ffffff",
        },
      })
        .composite([
          { input: sides[0], left: 0, top: 0 },
          { input: sides[1], left: pageW, top: 0 },
          { input: spineShade(pageW * 2, pageH), left: 0, top: 0 },
        ])
        .webp({ quality: 86 })
        .toBuffer();
    }
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Одна вёрстка на версию: параллельные запросы разных разворотов одной версии ждут одну и ту же. */
export const renderPagesSpreadsOnce = (
  key: string,
  s: PagesSample,
  width: PagesImageWidth,
) => dedupe(key, () => renderPagesSpreads(s, width));
