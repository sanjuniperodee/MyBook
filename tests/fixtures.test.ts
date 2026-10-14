import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { decodePDFRawStream, PDFArray, PDFDocument, PDFName, PDFNumber, PDFRawStream } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTheme, isThemeId } from "@/lib/content/themes";
import { answerBlocks } from "@/lib/book/answer-blocks";
import { backLayouts } from "@/lib/book/cover-back";
import { coverPhotoIds, coverPhotoSlots, getCoverTemplate } from "@/lib/book/covers";
import { formats, getFormat, mm, print, printablePageCount, type BookFormat } from "@/lib/book/formats";
import { layoutInline, normalizeStyle, splitParagraphs } from "@/lib/book/inline-photo";
import { interiorDesigns } from "@/lib/book/interiors";
import { buildBookContent, effectiveDpi, estimatePages, interiorMetrics, LETTERS_CHAPTER, photoAreaMm, toPhotoItem } from "@/lib/book/layout";
import { fixtureBook, fixtureBooks, fixtureVariants, type FixtureBook } from "./fixtures/books";
import { photoFiles, photoKey, photoNames, photoSpecs, prepareFixturePhotos, renderPhoto, useFixtureStorage, variantPhotoNames } from "./fixtures/photos";
import { grayPage, hasTool, textRows } from "./pdf-inspect";

// Свои папки хранилища: проверяем запись фото с нуля и не мешаем другим тестам.
const dir = mkdtempSync(path.join(tmpdir(), "mybook-fixtures-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const content = ({ bundle }: FixtureBook) => buildBookContent(bundle.book, bundle.questions, bundle.photos.map(toPhotoItem), 2026, bundle.letters);

describe("набор книг для визуальных и характеристических проверок", () => {
  it("каждое оформление × формат × язык — одна книга, ключи уникальны и совпадают с книгой", () => {
    const books = fixtureBooks();
    expect(books).toHaveLength(interiorDesigns.length * Object.keys(formats).length * 2);
    expect(new Set(books.map((b) => b.key)).size).toBe(books.length);
    expect(new Set(books.map((b) => b.bundle.book.id)).size).toBe(books.length);
    expect(books.slice(0, 4).map((b) => b.key)).toEqual(["classic-a5-ru", "classic-a5-kk", "classic-square-ru", "classic-square-kk"]);
    for (const { key, bundle } of books) expect(key).toBe(`${bundle.book.interior}-${bundle.book.format}-${bundle.book.language}`);
  });

  it("фильтры по оформлениям, форматам и языкам; книга не зависит от фильтра", () => {
    const some = fixtureBooks({ designs: ["luna", "classic"], formats: ["square"], languages: ["kk"] });
    expect(some.map((b) => b.key)).toEqual(["classic-square-kk", "luna-square-kk"]);
    expect(some[1]).toEqual(fixtureBooks().find((b) => b.key === "luna-square-kk"));
  });

  it("два построения дают одинаковые данные, а объекты — новые", () => {
    const a = fixtureBooks();
    const b = fixtureBooks();
    expect(b).toEqual(a);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(b[0].bundle.book).not.toBe(a[0].bundle.book);
  });

  it("в книге есть всё, что нужно сверять: посвящение, оглавление, письма, фото в ответах и на фотостраницах", () => {
    for (const fb of fixtureBooks()) {
      const { book, questions, photos, letters } = fb.bundle;
      expect(book.dedication && book.showToc).toBeTruthy();
      expect(letters?.length).toBe(2);
      expect(questions.some((q) => q.hideHeading) && questions.some((q) => !q.hideHeading)).toBe(true);
      const inline = photos.filter((p) => p.inline).map((p) => normalizeStyle(p.inline));
      expect(new Set(inline.map((s) => s.frame))).toEqual(new Set(["none", "line", "polaroid", "round"]));
      expect(new Set(inline.map((s) => s.align))).toEqual(new Set(["left", "center", "right"]));
      expect(new Set(inline.map((s) => s.aspect))).toEqual(new Set(["original", "1:1", "4:3", "3:4", "16:9"]));
      expect(new Set(photos.filter((p) => !p.questionId && p.id !== book.coverPhotoId).map((p) => p.layout))).toEqual(new Set(["full", "bleed", "half", "grid"]));
      const c = content(fb);
      expect(c.chapters.at(-1)?.items).toHaveLength(2);
      const rows = c.chapters.flatMap((ch) => ch.items.flatMap((it) => [...layoutInline((it.photos ?? []).map((p) => ({ style: normalizeStyle(p.inline) })), splitParagraphs(it.answer).length).values()].flat()));
      expect(rows.some((r) => r.length === 2)).toBe(true);
    }
  });

  it("ответы на обоих языках дают все виды разметки: абзац, лид, цитату, списки, стихи", () => {
    for (const fb of fixtureBooks({ designs: ["classic"], formats: ["a5"] })) {
      const blocks = content(fb).chapters.flatMap((ch) => ch.items.flatMap((it) => answerBlocks(splitParagraphs(it.answer))));
      expect(new Set(blocks.map((b) => b.kind))).toEqual(new Set(["para", "lede", "quote", "list", "verse"]));
      expect(new Set(blocks.flatMap((b) => (b.kind === "list" ? [b.ordered] : [])))).toEqual(new Set([true, false]));
    }
  });

  it("в наборе есть все варианты оборота, обложки с фото и без; фото по главам и в конце книги", () => {
    const books = fixtureBooks().map((b) => b.bundle.book);
    expect(new Set(books.map((b) => b.backLayout))).toEqual(new Set(backLayouts));
    expect(new Set(books.map((b) => b.photoPlacement))).toEqual(new Set(["chapters", "end"]));
    expect(new Set(interiorDesigns.map((d) => fixtureBook(d.id, "a5", "ru").bundle.book.coverTemplate)).size).toBe(interiorDesigns.length);
  });

  it("фото: байты одинаковы при каждом запуске, все ключи книг лежат в наборе", async () => {
    const files = await photoFiles();
    expect(files.size).toBe(photoNames.length * 2);
    const again = await renderPhoto("p3");
    expect(again.full.equals(files.get(photoKey("p3"))!)).toBe(true);
    const digest = sha256([...files].map(([key, data]) => `${key}:${sha256(data)}`).join("\n"));
    expect(digest).toBe("ec0b97ed61b23e864892dc8837ede75da6e754a7794eef6db4d1390c04043a27");
    for (const { bundle } of fixtureBooks()) for (const p of bundle.photos) expect(files.has(p.storageKey) && files.has(p.thumbKey)).toBe(true);
  });

  it("снимки вариантов — по запросу, тоже одинаковы при каждом запуске", async () => {
    const files = await photoFiles([...photoNames, ...variantPhotoNames]);
    expect(sha256(files.get(photoKey("big"))!)).toBe("cf1ed36035f9a61bcb73ef9bbecd621597636a64460c98d0eadd197e568a01aa");
    for (const { bundle } of fixtureVariants()) for (const p of bundle.photos) expect(files.has(p.storageKey) && files.has(p.thumbKey)).toBe(true);
    expect((await photoFiles()).has(photoKey("big"))).toBe(false);
  });

  it("подготовка фото идемпотентна: второй раз ничего не пишет", async () => {
    const target = path.join(dir, "prepare");
    expect(await prepareFixturePhotos(target)).toBe(photoNames.length * 2);
    expect(await prepareFixturePhotos(target)).toBe(0);
  });
});

const variant = (key: string) => fixtureVariants().find((v) => v.key === key)!;

describe("варианты набора вне матрицы", () => {
  it("ключи и id не пересекаются с матрицей, два построения дают одинаковые данные", () => {
    const variants = fixtureVariants();
    const matrix = fixtureBooks();
    expect(variants.map((v) => v.key)).toEqual(["thin", "bare", "gender", "bigphoto"]);
    const ids = new Set(matrix.flatMap((b) => [b.key, b.bundle.book.id]));
    expect(variants.filter((v) => ids.has(v.key) || ids.has(v.bundle.book.id))).toEqual([]);
    expect(JSON.stringify(fixtureVariants())).toBe(JSON.stringify(variants));
    expect(fixtureVariants()[0].bundle.book).not.toBe(variants[0].bundle.book);
  });

  it("thin: два коротких ответа, из фото — только обложка; оценка меньше минимума, печать добивает до print.minPages", () => {
    const fb = variant("thin");
    const c = content(fb);
    expect(c.chapters.filter((ch) => ch.key !== LETTERS_CHAPTER).flatMap((ch) => ch.items.map((it) => it.answer.length))).toEqual([50, 21]);
    expect(fb.bundle.photos.map((p) => p.id)).toEqual([fb.bundle.book.coverPhotoId]);
    expect(estimatePages(c)).toBeLessThan(print.minPages);
    expect(printablePageCount(estimatePages(c))).toBe(print.minPages);
  });

  it("bare: без оглавления, посвящения, писем и фото обложки, адресат на обложке скрыт", () => {
    const { book, photos, letters } = variant("bare").bundle;
    expect({ showToc: book.showToc, dedication: book.dedication, letters: letters?.length, hide: book.hideRecipientOnCover }).toEqual({ showToc: false, dedication: "", letters: 0, hide: true });
    // Шаблон обложки ждёт фото, а мест под фото не заполнено ни одно.
    expect(coverPhotoSlots(getCoverTemplate(book.coverTemplate))).toBeGreaterThan(0);
    expect(coverPhotoIds(book).every((id) => id === null)).toBe(true);
    expect(photos.some((p) => p.storageKey === photoKey("cover"))).toBe(false);
  });

  it("gender: автор — м, адресат — ж, тема не love, одно письмо не одобрено", () => {
    const fb = variant("gender");
    const { book, letters } = fb.bundle;
    expect([book.authorGender, book.recipientGender, book.theme !== "love" && isThemeId(book.theme)]).toEqual(["m", "f", true]);
    expect(letters?.map((l) => l.status)).toEqual(["approved", "pending"]);
    const c = content(fb);
    const theme = getTheme(book.theme, book.language);
    expect(c.chapters.every((ch) => ch.key === LETTERS_CHAPTER || theme.chapters.some((d) => d.key === ch.key))).toBe(true);
    expect(c.chapters[0].items.map((it) => it.heading)).toEqual(["Почему я решил написать эту книгу", "Ты в трёх словах", "За что я люблю тебя, моя любимая"]);
  });

  it("bigphoto: один снимок 4000×3000 — фотостраница и оборот «во всю»; печати и обложке он велик", () => {
    const { book, photos } = variant("bigphoto").bundle;
    const big = photos.filter((p) => p.width > 2000);
    expect(big.map((p) => [p.storageKey, p.width, p.height, p.layout, p.questionId])).toEqual([[photoKey("big"), ...photoSpecs.big, "full", null]]);
    expect([book.backPhotoId, book.backLayout]).toEqual([big[0].id, "fullPhoto"]);
    expect(effectiveDpi(big[0], photoAreaMm(getFormat(book.format), "full"), "contain")).toBeGreaterThan(print.dpi);
    expect(Math.max(big[0].width, big[0].height)).toBeGreaterThan(3200);
  });
});

/** Ширина каждого растрового изображения в PDF, px. */
async function imageWidths(pdf: Buffer) {
  const doc = await PDFDocument.load(pdf);
  return doc.context
    .enumerateIndirectObjects()
    .flatMap(([, obj]) => (obj instanceof PDFRawStream && obj.dict.get(PDFName.of("Subtype")) === PDFName.of("Image") ? [obj.dict.lookup(PDFName.of("Width"), PDFNumber).asNumber()] : []));
}

/** Номера полос (с 1) без текста: в превью на каждой полосе есть хотя бы водяной знак. */
async function pagesWithoutText(pdf: Buffer, count: number) {
  const doc = await PDFDocument.load(pdf);
  return doc
    .getPages()
    .slice(0, count)
    .flatMap((page, i) => {
      const contents = page.node.Contents();
      const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : [contents];
      const ops = streams.map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString("latin1") : "")).join("\n");
      return /\bT[jJ]\b/.test(ops) ? [] : [i + 1];
    });
}

/** Лист с вылетами и полоса набора по высоте, pt от верха листа. */
function sheetOf(format: BookFormat) {
  const m = interiorMetrics[format.id];
  return {
    width: mm(format.widthMm + print.bleedMm * 2),
    height: mm(format.heightMm + print.bleedMm * 2),
    textTop: mm(print.bleedMm + m.marginTop),
    textBottom: mm(print.bleedMm + format.heightMm - m.marginBottom),
  };
}

/** Есть ли рисунок посередине полосы (с 1) — там, где стоит разделитель, — между y0 и y1, pt от верха листа. */
function inkedMiddle(file: string, page: number, sheet: ReturnType<typeof sheetOf>, y0: number, y1: number) {
  const dpi = 144;
  const img = grayPage(file, page, dpi, sheet);
  const px = (pt: number) => Math.round((pt * dpi) / 72);
  const [x0, x1] = [px(sheet.width / 2 - 12), px(sheet.width / 2 + 12)];
  for (let y = px(y0); y < px(y1); y++) for (let x = x0; x < x1; x++) if (img.data[y * img.stride + x] < 250) return true;
  return false;
}

describe("рендер книг набора", () => {
  let render: typeof import("@/modules/production/infrastructure/pdf/render");
  // Свои снимки (с крупным big) и импорт рендера под нагрузкой полного прогона могут не уложиться в 10 с по умолчанию.
  beforeAll(async () => {
    await useFixtureStorage(path.join(dir, "storage"), [...photoNames, ...variantPhotoNames]);
    render = await import("@/modules/production/infrastructure/pdf/render");
  }, 60_000);

  it("renderInterior (print) собирает книгу с фото: страниц больше нуля и кратно четырём", async () => {
    const res = await render.renderInterior(fixtureBook("memories", "a5", "ru").bundle, "print");
    expect(res.contentPages).toBeGreaterThan(0);
    expect(res.pageCount % print.pageMultiple).toBe(0);
  });

  it("варианты собираются: thin добит пустыми полосами до минимума, снимок bigphoto в печати ужат", async () => {
    const thin = await render.renderInterior(variant("thin").bundle, "preview");
    expect(thin.contentPages).toBeLessThan(print.minPages);
    expect(thin.pageCount).toBe(print.minPages);
    const big = await render.renderInterior(variant("bigphoto").bundle, "print");
    expect(Math.max(...(await imageWidths(big.pdf)))).toBeLessThan(photoSpecs.big[0] / 2);
  });

  it.each([
    ["a5", "ru"],
    ["square", "ru"],
    ["square", "kk"],
  ] as const)("превью %s %s: водяной знак на каждой полосе, в том числе на фото под обрез, без предупреждений react-pdf", async (format, language) => {
    // В квадрате react-pdf считал снимок во весь лист выше полосы («can't wrap between pages») и отбрасывал водяной
    // знак на фотостраницах под обрез. В kk фото в конце книги — фотостраницы идут после начальной полосы галереи.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const res = await render.renderInterior(fixtureBook("classic", format, language).bundle, "preview");
    const warnings = warn.mock.calls.map((args) => String(args[0]));
    warn.mockRestore();
    expect(warnings).toEqual([]);
    expect(await pagesWithoutText(res.pdf, res.contentPages)).toEqual([]);
  });

  it.skipIf(!hasTool("pdftotext") || !hasTool("pdftoppm")).each([
    { design: "photobook", art: "линейка 18×0,6 pt" },
    { design: "romance", art: "глиф" },
  ] as const)("ответ без заголовка сразу после длинного ($design, $art): разделитель не остаётся внизу полосы, а открывает ответ на следующей", async ({ design }) => {
    // Раньше react-pdf оставлял разделитель внизу полосы и ужимал до нулевой высоты — pdfkit падал на Infinity.
    const { bundle } = fixtureBook(design, "a5", "ru");
    const questions = bundle.questions.map((q) => (q.position === 11 ? { ...q, hideHeading: true } : q));
    const res = await render.renderInterior({ ...bundle, questions }, "preview", { watermark: false });
    const file = path.join(dir, `headless-${design}.pdf`);
    writeFileSync(file, res.pdf);
    const sheet = sheetOf(render.contentFor(bundle).format);
    const pages = textRows(file).map((rows) => rows.filter((r) => r.top >= sheet.textTop - 3 && r.bottom <= sheet.textBottom + 4));
    const at = pages.findIndex((rows) => rows.some((r) => r.text === "Спасибо, что ты есть."));
    const answer = pages[at][0];
    expect(answer.text).toBe("Спасибо, что ты есть.");
    expect(inkedMiddle(file, at + 1, sheet, sheet.textTop, answer.top - 1)).toBe(true);
    expect(inkedMiddle(file, at, sheet, pages[at - 1].at(-1)!.bottom + 2, sheet.textBottom)).toBe(false);
  });
});
