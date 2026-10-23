import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFArray, PDFDocument, PDFRawStream, type PDFRef } from "pdf-lib";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { messagesFor } from "@/i18n/messages";
import type { BookBuild, BookPageKind } from "@/lib/book/book-build";
import { print } from "@/lib/book/formats";
import { chapterRuns, photoPages, type BookContent } from "@/lib/book/layout";
import type { BookPreviewService } from "@/modules/production";
import type { BookBundle, InteriorResult } from "@/modules/production/infrastructure/pdf/render";
import { fixtureBook } from "./fixtures/books";
import { useFixtureStorage } from "./fixtures/photos";
import { hasTool } from "./pdf-inspect";

/**
 * Экранная сборка — единственная вёрстка всех предпросмотров: манифест полос по настоящей раскладке react-pdf
 * (виды, главы, добивка), разбивка та же, что у блока для печати, картинки полос — ровно обрезной формат PDF,
 * водяной знак ложится поверх и ничего под собой не сдвигает. Растр и текст — через poppler (pdftoppm, pdftotext);
 * без них эти проверки пропускаются.
 */

const rasterless = !hasTool("pdftoppm");
const textless = !hasTool("pdftotext");

const dir = mkdtempSync(path.join(tmpdir(), "mybook-book-build-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Книга набора с фото «на всю страницу» посреди истории: текст главы рвётся вокруг фотостраницы. */
function withPagePhoto(bundle: BookBundle): BookBundle {
  return { ...bundle, photos: bundle.photos.map((p) => (p.storageKey.endsWith("/b.jpg") && p.inline ? { ...p, inline: { ...p.inline, page: true } } : p)) };
}

const a5 = fixtureBook("classic", "a5", "ru");
const book = { key: a5.key, bundle: withPagePhoto(a5.bundle) };
/** Казахская квадратная: все фото в галерее в конце книги. */
const square = fixtureBook("photobook", "square", "kk");

let render: typeof import("@/modules/production/infrastructure/pdf/render");
let previews: BookPreviewService;
/** Оплачена ли книга: до оплаты картинки полос и PDF — со знаком. */
let paid = false;
let storage: typeof import("@/shared/infrastructure/storage");
const rasterCalls: string[] = [];
let built: BookBuild;
let content: BookContent;

beforeAll(async () => {
  await useFixtureStorage(path.join(dir, "storage"));
  render = await import("@/modules/production/infrastructure/pdf/render");
  storage = await import("@/shared/infrastructure/storage");
  const production = await import("@/modules/production");
  const bundles = new Map([book, square].map((b) => [b.bundle.book.id, b.bundle]));
  const counted = {
    page: (...args: Parameters<typeof production.pdfPageRaster.page>) => (rasterCalls.push(`page ${args[1]}@${args[2]}`), production.pdfPageRaster.page(...args)),
    blank: (...args: Parameters<typeof production.pdfPageRaster.blank>) => (rasterCalls.push(`blank@${args[0]}`), production.pdfPageRaster.blank(...args)),
  };
  const quiet = { info() {}, warn() {}, error() {} };
  previews = new production.BookPreviewService(production.reactPdfRenderer(async (id) => bundles.get(id) ?? null), production.storageFileStore, production.pdfRenderQueue, counted, quiet, async () => paid);
  // Скачивание до оплаты собирает экранную сборку и ставит знак; дальше сборка берётся из кэша.
  await previews.preview(book.bundle.book.id);
  const state = await previews.build(book.bundle.book.id);
  if (state?.status !== "ready") throw new Error(`сборка не готова: ${state?.status}`);
  built = state.build;
  content = render.contentFor(book.bundle);
});

const id = () => book.bundle.book.id;
const screenPdf = () => storage.storagePath(`cache/preview/${id()}/${built.fp}.pdf`);

/** Полосы каждого вида по порядку: номера с 1. */
const pagesOf = (b: Pick<BookBuild, "pages">, kind: BookPageKind, chapterKey?: string) => b.pages.filter((p) => p.kind === kind && (chapterKey === undefined || p.chapterKey === chapterKey)).map((p) => p.n);

describe("манифест экранной сборки", () => {
  it("полосы по порядку, длина — печатный объём, добивка пустыми полосами в конце; PDF той же длины", async () => {
    expect(built.fp).toBe(render.contentFingerprint(book.bundle));
    expect(built.imageBase).toBe(`/api/books/${id()}/pages/${built.fp}`);
    expect(built.trimMm).toEqual({ w: 148, h: 210 });
    expect(built.pageCount % print.pageMultiple).toBe(0);
    expect(built.pages.map((p) => p.n)).toEqual(Array.from({ length: built.pageCount }, (_, i) => i + 1));
    expect(pagesOf(built, "pad")).toEqual(Array.from({ length: built.pageCount - built.contentPages }, (_, i) => built.contentPages + i + 1));
    expect(built.pages[built.contentPages - 1].kind).toBe("end");
    const doc = await PDFDocument.load(await storage.getFile(`cache/preview/${id()}/${built.fp}.pdf`));
    expect(doc.getPageCount()).toBe(built.pageCount);
  });

  it("передняя часть, оглавление, главы: начальная полоса, текст и фото своей главы подряд — как в оглавлении", () => {
    // титул, оборот титула, посвящение, затем оглавление
    expect(built.pages.slice(0, 4).map((p) => p.kind)).toEqual(["front", "front", "front", "toc"]);
    const openers = built.pages.filter((p) => p.kind === "opener");
    expect(openers.map((p) => p.chapterKey)).toEqual(content.chapters.map((c) => c.key));
    content.chapters.forEach((ch, i) => {
      const start = built.chapterPages[ch.key];
      expect(built.pages[start - 1]).toEqual({ n: start, kind: "opener", chapterKey: ch.key });
      const end = i + 1 < content.chapters.length ? built.chapterPages[content.chapters[i + 1].key] : built.contentPages;
      const inside = built.pages.slice(start, end - 1);
      // между начальными полосами — только текст и фото этой главы
      expect(inside.every((p) => (p.kind === "text" || p.kind === "photo") && p.chapterKey === ch.key)).toBe(true);
      const runPhotos = chapterRuns(ch.items).filter((r) => r.photo).length;
      expect(pagesOf(built, "photo", ch.key)).toHaveLength(photoPages(ch.photos).length + runPhotos);
    });
  });

  it("фото «на всю страницу» посреди истории: фотостраница между полосами текста той же главы", () => {
    // у куска текста перед фото на всю страницу photo — это фото
    const ch = content.chapters.find((c) => chapterRuns(c.items).some((r) => r.photo && r.items.length))!;
    expect(ch).toBeDefined();
    const kinds = built.pages.filter((p) => p.chapterKey === ch.key).map((p) => p.kind);
    expect(kinds.join(" ")).toMatch(/^opener (text )+photo (text )+/);
  });

  it("галерея: своя начальная полоса и фотостраницы без главы", async () => {
    const res = await render.renderScreenBuild(square.bundle);
    const c = render.contentFor(square.bundle);
    expect(c.galleryPhotos.length).toBeGreaterThan(0);
    const opener = res.layout.chapterPages.__gallery;
    expect(res.layout.pages[opener - 1]).toEqual({ n: opener, kind: "opener", chapterKey: "__gallery" });
    expect(pagesOf(res.layout, "gallery")).toEqual(Array.from({ length: photoPages(c.galleryPhotos).length }, (_, i) => opener + 1 + i));
    expect(pagesOf(res.layout, "photo")).toEqual([]);
    expect(res.layout.trimMm).toEqual({ w: 200, h: 200 });
    expect(res.layout.pages).toHaveLength(res.layout.pageCount);
  });
});

/** Та же книга с оглавлением по разделам: номера разделов — тоже из вёрстки, в chapterPages под ключами строк. */
const sections = (() => {
  const b = fixtureBook("classic", "a5", "ru");
  return { key: `${b.key}-sections`, bundle: { ...b.bundle, book: { ...b.bundle.book, tocMode: "sections" as const } } };
})();

/**
 * Длинная книга (около 170 полос): вопросы набора двадцать раз подряд, ответы разной длины. Доводке вёрстки нужно больше
 * 12 проходов (замер: 15 сборок блока) — путь, где печать и экран могли бы разойтись (проходы, пересборка итогового
 * блока). Около полутора минут — только с PDF_CRITICAL=all.
 */
const long = (() => {
  const b = fixtureBook("classic", "a5", "ru");
  const n = b.bundle.questions.length;
  const questions = Array.from({ length: 20 }, (_, copy) =>
    b.bundle.questions.map((q) => ({
      ...q,
      id: copy ? `${q.id.slice(0, -2)}${copy.toString(16).padStart(2, "0")}` : q.id,
      position: q.position + copy * n,
      answer: Array.from({ length: 1 + ((copy + q.position) % 3) }, () => q.answer).join("\n\n"),
    })),
  ).flat();
  return { key: `${b.key}-long`, bundle: { ...b.bundle, questions } };
})();

describe("печать и экран — одна разбивка", () => {
  const layoutOf = (r: Pick<InteriorResult, "contentPages" | "pageCount" | "chapterPages" | "pages">) => ({ contentPages: r.contentPages, pageCount: r.pageCount, chapterPages: r.chapterPages, pages: r.pages });

  it("блок для печати: те же полосы, номера глав и виды полос, что у экранной сборки", async () => {
    const printed = await render.renderInterior(book.bundle, "print");
    expect(layoutOf(printed)).toEqual(layoutOf(built));
  });

  it.each([
    ["квадратная казахская с галереей в конце", square],
    ["оглавление по разделам", sections],
  ])("%s: печать и экран верстаются одинаково", async (_name, b) => {
    const [printed, screen] = await Promise.all([render.renderInterior(b.bundle, "print"), render.renderScreenBuild(b.bundle)]);
    expect(layoutOf(printed)).toEqual(layoutOf(screen.layout));
    if (b === sections) expect(Object.keys(screen.layout.chapterPages).some((k) => k.startsWith("q:"))).toBe(true);
  });

  it.runIf(process.env.PDF_CRITICAL === "all")(
    "длинная книга (больше 12 проходов доводки): печать и экран верстаются одинаково",
    async () => {
      const printed = await render.renderInterior(long.bundle, "print");
      const screen = await render.renderScreenBuild(long.bundle);
      expect(printed.contentPages).toBeGreaterThan(150);
      expect(layoutOf(printed)).toEqual(layoutOf(screen.layout));
    },
    300_000,
  );
});

/** Лист PDF целиком (с вылетами) в RGB от pdftoppm — эталон, с которым сравниваем картинку полосы. */
function sheetRgb(file: string, n: number, dpi: number) {
  const ppm = execFileSync("pdftoppm", ["-f", String(n), "-l", String(n), "-r", dpi.toFixed(4), file], { maxBuffer: 256 << 20 });
  const header = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(ppm.subarray(0, 64).toString("latin1"))!;
  return { width: Number(header[1]), height: Number(header[2]), data: ppm.subarray(header[0].length) };
}

/** Средняя разница каналов картинки и куска листа, начиная с (x, y). */
function meanDiff(img: { width: number; height: number; data: Buffer }, sheet: ReturnType<typeof sheetRgb>, x: number, y: number) {
  let sum = 0;
  for (let r = 0; r < img.height; r++)
    for (let c = 0; c < img.width * 3; c++) sum += Math.abs(img.data[r * img.width * 3 + c] - sheet.data[(r + y) * sheet.width * 3 + x * 3 + c]);
  return sum / (img.width * img.height * 3);
}

const rgb = async (webp: Buffer) => {
  const { data, info } = await sharp(webp).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
};

/** Картинка полосы как есть (WebP). */
const image = async (n: number, w: Parameters<BookPreviewService["pageImage"]>[3]) => (await previews.pageImage(id(), built.fp, n, w))!.data;

describe.skipIf(rasterless)("картинки полос оплаченной книги", () => {
  beforeAll(() => {
    paid = true;
  });
  afterAll(() => {
    paid = false;
  });

  it("ширина из запроса, пропорции обрезного формата, WebP; повторный запрос — из кэша без растра", async () => {
    const first = await previews.pageImage(id(), built.fp, 1, 480);
    expect(first?.limited).toBe(false);
    expect(await sharp(first!.data).metadata()).toMatchObject({ format: "webp", width: 480, height: Math.round((480 * 210) / 148) });
    const big = await image(1, 1600);
    expect(await sharp(big).metadata()).toMatchObject({ width: 1600, height: Math.round((1600 * 210) / 148) });
    expect(await previews.pageImage(id(), built.fp, 1, 480)).toEqual(first);
    expect(rasterCalls.filter((c) => c.startsWith("page 1@"))).toEqual(["page 1@480", "page 1@1600"]);
    expect(await storage.fileExists(`cache/pages/${id()}/${built.fp}/1-480.webp`)).toBe(true);
  });

  it("картинка — ровно обрезной формат листа: вылеты срезаны, ничего не сдвинуто", async () => {
    const dpi = (800 * 25.4) / built.trimMm.w;
    const bleed = Math.round((print.bleedMm * dpi) / 25.4);
    // полоса текста главы и фото под обрез (снимок доходит до края вылета)
    const text = pagesOf(built, "text")[1];
    const photo = built.pages.find((p) => p.kind === "photo")!.n;
    for (const n of [text, photo]) {
      const img = await rgb(await image(n, 800));
      const sheet = sheetRgb(screenPdf(), n, dpi);
      const exact = meanDiff(img, sheet, bleed, bleed);
      expect(exact, `с. ${n}`).toBeLessThan(2.5);
      // тот же кусок, не срезав вылеты, — заметно хуже: сравнение чувствительно к сдвигу
      expect(meanDiff(img, sheet, 0, 0), `с. ${n}`).toBeGreaterThan(exact * 1.5);
    }
  });

  it("пустая полоса добивки — белая картинка тех же пропорций, без растра PDF", async () => {
    const pad = pagesOf(built, "pad")[0];
    if (!pad) return;
    const img = await image(pad, 480);
    expect(await sharp(img).metadata()).toMatchObject({ width: 480, height: Math.round((480 * 210) / 148) });
    const { channels } = await sharp(img).stats();
    expect(channels.every((c) => c.min === 255)).toBe(true);
    expect(rasterCalls).not.toContain(`page ${pad}@480`);
  });

  it("нет pdftoppm — RasterizerMissingError (маршрут ответит 503 { error: \"rasterizer\" }), в кэш ничего не пишется", async () => {
    const { RasterizerMissingError } = await import("@/modules/production");
    const path0 = process.env.PATH;
    process.env.PATH = dir;
    try {
      await expect(previews.pageImage(id(), built.fp, 2, 800)).rejects.toSatisfy((err) => RasterizerMissingError.is(err));
    } finally {
      process.env.PATH = path0;
    }
    expect(await storage.fileExists(`cache/pages/${id()}/${built.fp}/2-800.webp`)).toBe(false);
  });

  it("чужой отпечаток и полоса за концом книги — нет картинки", async () => {
    expect(await previews.pageImage(id(), "0123456789abcdef", 1, 480)).toBeNull();
    expect(await previews.pageImage(id(), built.fp, built.pageCount + 1, 480)).toBeNull();
  });
});

/** Слова полосы n с рамками (pdftotext -bbox): «слово xMin yMin xMax yMax». */
function words(file: string, n: number): string[] {
  // На полосе без текста pdftotext пишет в stderr «no word list» — не выводим.
  const html = execFileSync("pdftotext", ["-f", String(n), "-l", String(n), "-bbox", file, "-"], { stdio: ["ignore", "pipe", "ignore"] }).toString("utf8");
  return [...html.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map((m) => `${m[5]} ${m[1]} ${m[2]} ${m[3]} ${m[4]}`);
}

/** Потоки содержимого полосы i — сырые байты, как лежат в файле. */
function pageStreams(doc: PDFDocument, i: number): Buffer[] {
  const contents = doc.getPage(i).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  return refs.map((r) => doc.context.lookup(r as PDFRef)).flatMap((s) => (s instanceof PDFRawStream ? [Buffer.from(s.getContents())] : []));
}

describe("водяной знак поверх готового PDF", () => {
  let screen: Buffer;
  let marked: Buffer;
  beforeAll(async () => {
    screen = await storage.getFile(`cache/preview/${id()}/${built.fp}.pdf`);
    marked = await storage.getFile(`cache/preview/${id()}/${built.fp}-wm.pdf`);
  });

  it("до оплаты скачивается PDF со знаком: те же полосы, их потоки содержимого — байт в байт", async () => {
    expect(await previews.preview(id())).toEqual(marked);
    const [a, b] = await Promise.all([PDFDocument.load(screen), PDFDocument.load(marked)]);
    expect(b.getPageCount()).toBe(a.getPageCount());
    for (let i = 0; i < a.getPageCount(); i++) {
      const before = pageStreams(a, i);
      const after = pageStreams(b, i);
      expect(after.length, `с. ${i + 1}`).toBeGreaterThan(before.length);
      // у пустых полос добивки потоков нет — сравнивать нечего
      if (!before.length) continue;
      // исходные потоки — подряд и без изменений (pdf-lib только обрамляет их q … Q и дописывает знак после)
      const at = after.findIndex((s) => s.equals(before[0]));
      expect(at, `с. ${i + 1}`).toBeGreaterThanOrEqual(0);
      before.forEach((s, k) => expect(after[at + k].equals(s), `с. ${i + 1}`).toBe(true));
    }
  });

  it.skipIf(textless)("текст полос на месте: те же слова с теми же координатами, сверху — только буквы надписи знака", () => {
    writeFileSync(path.join(dir, "screen.pdf"), screen);
    writeFileSync(path.join(dir, "marked.pdf"), marked);
    const label = [...messagesFor("ru").book.previewMark.replace(/\s/g, "")].sort().join("");
    for (const n of [1, 4, pagesOf(built, "text")[0], pagesOf(built, "photo")[0]]) {
      const before = words(path.join(dir, "screen.pdf"), n);
      const after = words(path.join(dir, "marked.pdf"), n);
      const rest = [...after];
      for (const w of before) {
        const at = rest.indexOf(w);
        expect(at, `с. ${n}: ${w}`).toBeGreaterThanOrEqual(0);
        rest.splice(at, 1);
      }
      // надпись знака повёрнута: pdftotext отдаёт её по буквам
      expect(rest.map((w) => w.split(" ")[0]).sort().join(""), `с. ${n}`).toBe(label);
    }
  });

  it.skipIf(rasterless)("картинки полос до оплаты — растр чистого PDF (знак только в скачиваемом), не крупнее 800", async () => {
    const n = pagesOf(built, "text")[0];
    const res = await previews.pageImage(id(), built.fp, n, 1600);
    expect(res?.limited).toBe(true);
    expect(await sharp(res!.data).metadata()).toMatchObject({ width: 800 });
    expect(await storage.fileExists(`cache/pages/${id()}/${built.fp}/${n}-800.webp`)).toBe(true);
    expect(await storage.fileExists(`cache/pages/${id()}/${built.fp}/${n}-1600.webp`)).toBe(false);
    const dpi = (800 * 25.4) / built.trimMm.w;
    const bleed = Math.round((print.bleedMm * dpi) / 25.4);
    expect(meanDiff(await rgb(res!.data), sheetRgb(screenPdf(), n, dpi), bleed, bleed)).toBeLessThan(2.5);
    // после оплаты — та же полоса той ширины, что просили
    paid = true;
    try {
      expect(await sharp(await image(n, 1600)).metadata()).toMatchObject({ width: 1600 });
    } finally {
      paid = false;
    }
  });

  it.skipIf(rasterless)("знак виден посередине полосы и ничего не сдвигает: растр отличается только бледной надписью", async () => {
    writeFileSync(path.join(dir, "screen.pdf"), screen);
    writeFileSync(path.join(dir, "marked.pdf"), marked);
    const n = pagesOf(built, "text")[0];
    const a = sheetRgb(path.join(dir, "screen.pdf"), n, 72);
    const b = sheetRgb(path.join(dir, "marked.pdf"), n, 72);
    let max = 0;
    let changed = 0;
    let middle = 0;
    for (let i = 0; i < a.data.length; i++) {
      const d = Math.abs(a.data[i] - b.data[i]);
      max = Math.max(max, d);
      if (d) {
        changed++;
        const row = Math.floor(i / (a.width * 3));
        if (row > a.height * 0.25 && row < a.height * 0.75) middle++;
      }
    }
    // знак 5 % чёрного: на белом — не темнее 255 → 242 (плюс сглаживание), текст под ним не двигался
    expect(max).toBeLessThanOrEqual(20);
    expect(changed).toBeGreaterThan(0);
    expect(middle / changed).toBeGreaterThan(0.9);
  });
});
