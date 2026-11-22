import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { estimatePages } from "@/lib/book/estimate";
import { getFormat, print, printablePageCount } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors";
import { InteriorSpread, type SpreadSample } from "@/components/interior/InteriorSpread";
import { contentFor, renderInterior } from "@/modules/production/infrastructure/pdf/render";
import { editorBook } from "@/lib/book/editor-data";
import { Book as BookAggregate } from "@/modules/authoring/domain";
import { BooksService } from "@/modules/authoring/application/services";
import { FakeUow, ids, MemBooks, MemFiles, noChapters, noQuestions, now as testNow, owner, startBook, themes } from "./doubles/authoring";
import { fixtureBook } from "./fixtures/books";
import { hasTool, textRows } from "./pdf-inspect";

// 23.11.2026: книга на казахском (тема «своя», названия нет) печатала титул с «Менің кітабым» — запасное название темы.
// Автор не мог убрать титульный лист: во «Страницах» → «Элементы» выключался только его автор. Теперь books.title_page:
// выключено — не печатаются ни титул, ни его оборот (выходные данные): две полосы, чётность остальных не сдвигается.

const TITLE = "Уникальное заглавие книги";
const { bundle } = fixtureBook("classic", "a5", "ru");
const bundleOf = (titlePage: boolean) => ({ ...bundle, photos: [], book: { ...bundle.book, coverPhotoId: null, title: TITLE, titlePage } });

describe("титульный лист: вёрстка", () => {
  it("в содержании книги ключ появляется только у выключенного — отпечаток кэша прежних книг не меняется", () => {
    expect("titlePage" in contentFor(bundleOf(true))).toBe(false);
    expect(contentFor(bundleOf(false)).titlePage).toBe(false);
    // Без поля вовсе (старые строки и тестовые двойники) — как включено.
    expect(contentFor({ ...bundleOf(true), book: { ...bundleOf(true).book, titlePage: undefined as never } })).toEqual(contentFor(bundleOf(true)));
  });

  it("оценка объёма короче ровно на титул и оборот; печатный объём — по тем же правилам", () => {
    const on = estimatePages(contentFor(bundleOf(true)));
    const off = estimatePages(contentFor(bundleOf(false)));
    expect(on - off).toBe(2);
    expect(printablePageCount(off) % print.pageMultiple).toBe(0);
    expect(printablePageCount(off)).toBeGreaterThanOrEqual(print.minPages);
  });

  it("редактор собирает ту же книгу: поле доходит до оценки объёма", () => {
    const row = { ...bundleOf(false).book } as Parameters<typeof editorBook>[0];
    expect(editorBook(row, { cover: [], back: [] } as never).titlePage).toBe(false);
  });

  it("PDF: без титула и оборота — те же страницы минус две, главы сдвинуты на две, оценка совпадает с вёрсткой", async () => {
    const on = await renderInterior(bundleOf(true), "preview");
    const off = await renderInterior(bundleOf(false), "preview");
    expect(on.contentPages - off.contentPages).toBe(2);
    expect(off.contentPages).toBe(estimatePages(contentFor(bundleOf(false))));
    expect(on.contentPages).toBe(estimatePages(contentFor(bundleOf(true))));
    // Полосы блока те же, что у книги с титулом, без первых двух; добивка до печатного объёма (pad) считается заново.
    const content = (r: typeof on) => r.pages.filter((p) => p.kind !== "pad").map((p) => p.kind);
    expect(content(off)).toEqual(content(on).slice(2));
    expect(on.pages.slice(0, 2).map((p) => p.kind)).toEqual(["front", "front"]);
    for (const [key, n] of Object.entries(on.chapterPages)) expect(off.chapterPages[key]).toBe(n - 2);
    // Добивка — прежняя: не меньше минимума и кратно четырём (formats.printablePageCount).
    expect(off.pageCount).toBe(printablePageCount(off.contentPages));
    expect(on.pageCount).toBe(printablePageCount(on.contentPages));
  }, 120_000);

  it("у книги с главами слева без титула начальные полосы по-прежнему слева: чётность не сдвинулась", async () => {
    const left = (titlePage: boolean) => ({ ...bundleOf(titlePage), book: { ...bundleOf(titlePage).book, paginationRev: 2 } });
    const off = await renderInterior(left(false), "preview");
    for (const n of Object.values(off.chapterPages)) expect(n % 2).toBe(0);
    expect(off.contentPages).toBe(estimatePages(contentFor(left(false))));
    expect((await renderInterior(left(true), "preview")).contentPages - off.contentPages).toBe(2);
  }, 120_000);

  it.skipIf(!hasTool("pdftotext"))("PDF: на первой полосе нет названия, а с титулом — есть", async () => {
    const firstPage = async (titlePage: boolean) => {
      const res = await renderInterior(bundleOf(titlePage), "preview");
      const file = path.join(mkdtempSync(path.join(tmpdir(), "title-page-")), "block.pdf");
      writeFileSync(file, res.pdf);
      return textRows(file)[0].map((r) => r.text).join("\n");
    };
    expect(await firstPage(true)).toContain("Уникальное");
    expect(await firstPage(false)).not.toContain("Уникальное");
  }, 120_000);
});

describe("титульный лист: разворот «Титул»", () => {
  const sample: SpreadSample = { language: "ru", title: TITLE, subtitle: "", author: "Автор", year: 2026, dedication: "", dedicationPlaceholder: "", chapter: { number: 1, title: "Глава" }, entries: [], toc: [], showToc: true };
  const spread = (titlePage?: boolean) =>
    renderToStaticMarkup(<InteriorSpread design={getInteriorDesign("classic")} format={getFormat("a5")} sample={{ ...sample, titlePage }} kind="front" />);

  it("выключенный титул на развороте бледный, включённый и без поля — как раньше", () => {
    expect(spread()).toBe(spread(true));
    expect(spread(false)).not.toBe(spread(true));
    expect(spread(false)).toContain("opacity:0.4");
  });
});

describe("титульный лист: сохранение настройки", () => {
  it("новая книга печатает титул; настройка из редактора сохраняется вместе с книгой", async () => {
    expect(startBook().snapshot().titlePage).toBe(true);
    const books = new MemBooks();
    const service = new BooksService(books, noQuestions, themes, { bookHasOrders: async () => false }, new MemFiles(), ids, new FakeUow(), { now: () => testNow }, noChapters);
    await service.start("u1", { theme: "love", language: "ru", authorName: "Алия", authorGender: "f", recipientName: "Марат", recipientGender: "m" });
    await service.updateSettings("b1", owner, { titlePage: false }, undefined as never);
    expect(books.rows.get("b1")!.snapshot().titlePage).toBe(false);
    await service.updateSettings("b1", owner, { titlePage: true }, undefined as never);
    expect(books.rows.get("b1")!.snapshot().titlePage).toBe(true);
  });

  it("у заказанной книги не меняется", () => {
    const book = BookAggregate.restore("b1", { ...startBook().snapshot(), status: "ordered" });
    expect(() => book.applySettings({ titlePage: false })).toThrow();
    expect(book.snapshot().titlePage).toBe(true);
  });
});
