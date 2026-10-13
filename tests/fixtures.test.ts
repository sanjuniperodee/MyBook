import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { answerBlocks } from "@/lib/book/answer-blocks";
import { backLayouts } from "@/lib/book/cover-back";
import { formats, print } from "@/lib/book/formats";
import { layoutInline, normalizeStyle, splitParagraphs } from "@/lib/book/inline-photo";
import { interiorDesigns } from "@/lib/book/interiors";
import { buildBookContent, toPhotoItem } from "@/lib/book/layout";
import { fixtureBook, fixtureBooks, type FixtureBook } from "./fixtures/books";
import { photoFiles, photoKey, photoNames, prepareFixturePhotos, renderPhoto, useFixtureStorage } from "./fixtures/photos";

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

  it("подготовка фото идемпотентна: второй раз ничего не пишет", async () => {
    const target = path.join(dir, "prepare");
    expect(await prepareFixturePhotos(target)).toBe(photoNames.length * 2);
    expect(await prepareFixturePhotos(target)).toBe(0);
  });
});

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

describe("рендер книг набора", () => {
  let render: typeof import("@/modules/production/infrastructure/pdf/render");
  beforeAll(async () => {
    await useFixtureStorage(path.join(dir, "storage"));
    render = await import("@/modules/production/infrastructure/pdf/render");
  });

  it("renderInterior (print) собирает книгу с фото: страниц больше нуля и кратно четырём", async () => {
    const res = await render.renderInterior(fixtureBook("memories", "a5", "ru").bundle, "print");
    expect(res.contentPages).toBeGreaterThan(0);
    expect(res.pageCount % print.pageMultiple).toBe(0);
  });

  it("превью A5: водяной знак на каждой полосе, в том числе на фото под обрез", async () => {
    const res = await render.renderInterior(fixtureBook("classic", "a5", "ru").bundle, "preview");
    expect(await pagesWithoutText(res.pdf, res.contentPages)).toEqual([]);
  });

  it("баг: в квадратном формате на фотостранице под обрез нет водяного знака превью", async () => {
    // react-pdf считает снимок во всю полосу выше доступной высоты, переносит всё, что после него, на следующую
    // полосу, а её отбрасывает: там только fixed-узлы (водяной знак). В A5 снимок помещается — знак на месте.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const res = await render.renderInterior(fixtureBook("classic", "square", "ru").bundle, "preview");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("can't wrap between pages"));
    warn.mockRestore();
    // 10 и 26 — фотостраницы «под обрез» (p2 и p13).
    expect(await pagesWithoutText(res.pdf, res.contentPages)).toEqual([10, 26]);
  });

  it("баг: ответ без заголовка сразу после длинного роняет сборку — разделитель-рисунок попадает на границу полосы", async () => {
    // Разделитель-рисунок (здесь линейка 18×0,6 pt) переносится через границу полосы, на полосе остаётся его кусок
    // нулевой высоты → pdfkit получает Infinity. Так же падают оформления с глифом вместо «* * *».
    const { bundle } = fixtureBook("photobook", "a5", "ru");
    const questions = bundle.questions.map((q) => (q.position === 11 ? { ...q, hideHeading: true } : q));
    await expect(render.renderInterior({ ...bundle, questions }, "preview")).rejects.toThrow("unsupported number: Infinity");
  });
});
