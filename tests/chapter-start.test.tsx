import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { estimatePages } from "@/lib/book/estimate";
import { contentFingerprint, contentFor, renderInterior, type BookBundle } from "@/modules/production/infrastructure/pdf/render";
import type { Book, BookQuestion } from "@/shared/infrastructure/db/schema";
import { AuthoringError, Book as BookAggregate } from "@/modules/authoring/domain";
import { BooksService } from "@/modules/authoring/application/services";
import { FakeUow, ids, MemBooks, MemFiles, noChapters, noQuestions, now as testNow, owner, startBook, themes } from "./doubles/authoring";
import { hasTool, textRows } from "./pdf-inspect";

// 14.11.2026: владелец попросил скрыть страницу, которая идёт в начале главы, а потом — «глава без названия, чисто лист».
// «Страницы» → «Элементы» → «Начало главы» (books.chapter_start): «Отдельная страница» (page, как у всех книг),
// «Название над текстом» (inline) — глава с новой страницы, номер и название над текстом; «Без названия» (none) — чистый
// лист. Без начальной полосы пустых полос перед главами нет, альбом свою полосу хранит.

const now = new Date();
const book: Book = {
  id: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  theme: "love",
  status: "draft",
  title: "Ты — моё всё",
  subtitle: "",
  authorName: "Алия",
  authorGender: "f",
  recordedBy: "",
  recipientName: "Марғұлан",
  recipientGender: "m",
  hideRecipientOnCover: false,
  namesOnCover: "",
  coverTemplate: "midnight",
  coverPhotoId: null,
  coverPhotoExtra: [],
  backText: "",
  backLayout: "quote",
  backPhotoId: null,
  backPhotoExtra: [],
  photoFrames: {},
  dedication: "Моему самому близкому человеку",
  interior: "classic",
  interiorStyle: {},
  coverDesign: null,
  coverBack: null,
  format: "a5",
  photoPlacement: "chapters",
  showToc: true,
  tocMode: "chapters",
  tocLines: {},
  layoutRev: 2,
  paginationRev: 2,
  inviteToken: null,
  inviteText: "",
  endText: null,
  chapterStart: "page",
  occasion: null,
  occasionDate: null,
  language: "ru",
  createdAt: now,
  updatedAt: now,
};

const questions: BookQuestion[] = Array.from({ length: 12 }, (_, i) => ({
  id: `q${i}`,
  bookId: book.id,
  position: i,
  chapter: ["intro", "meet", "date", "travel"][i % 4],
  questionKey: null,
  prompt: "Вопрос",
  title: `Заголовок ${i + 1}`,
  hint: null,
  displayText: null,
  hideHeading: false,
  pageBreak: false,
  answer: "Мы встретились в самый обычный вторник, когда в Алматы шёл первый снег. ".repeat(8 + 9 * (i % 3)),
  media: [],
  createdAt: now,
  updatedAt: now,
}));

const bundleOf = (patch: Partial<Book>): BookBundle => ({ book: { ...book, ...patch }, questions, chapters: [], photos: [] });

describe("начало главы без отдельной страницы", () => {
  it("отдельная страница (как у всех книг) — содержимое и отпечаток сборки прежние", () => {
    const on = bundleOf({});
    expect(contentFor(on).chapterStart).toBeUndefined();
    expect(JSON.stringify(contentFor(on))).not.toContain("chapterStart");
    expect(contentFor(on)).toEqual(contentFor({ ...on, book: { ...on.book, chapterStart: undefined as never } }));
    expect(contentFor(bundleOf({ chapterStart: "inline" })).chapterStart).toBe("inline");
    expect(contentFor(bundleOf({ chapterStart: "none" })).chapterStart).toBe("none");
    expect(contentFingerprint(bundleOf({ chapterStart: "inline" }))).not.toBe(contentFingerprint(on));
    expect(contentFingerprint(bundleOf({ chapterStart: "none" }))).not.toBe(contentFingerprint(bundleOf({ chapterStart: "inline" })));
  });

  it.each([
    ["inline", 2],
    ["inline", 1],
    ["none", 2],
  ] as const)("%s, полосы глав %s: начальных и пустых полос нет, глава начинается с полосы своего текста", async (chapterStart, paginationRev) => {
    const res = await renderInterior(bundleOf({ chapterStart, paginationRev }), "preview");
    expect(res.pages.filter((p) => p.kind === "opener" || p.kind === "blank")).toEqual([]);
    const keys = Object.keys(res.chapterPages);
    expect(keys).toEqual(["intro", "meet", "date", "travel"]);
    keys.forEach((key, i) => {
      const n = res.chapterPages[key];
      expect(res.pages[n - 1]).toMatchObject({ kind: "text", chapterKey: key });
      // Перед ней — сразу полоса прошлой главы (у первой — оглавление).
      expect(res.pages[n - 2]).toMatchObject(i ? { chapterKey: keys[i - 1] } : { kind: "toc" });
    });
  });

  it.each(["inline", "none"] as const)("%s: полос меньше, чем с начальными, и оценка объёма идёт за PDF", async (chapterStart) => {
    const off = bundleOf({ chapterStart });
    const res = await renderInterior(off, "preview");
    const on = await renderInterior(bundleOf({}), "preview");
    expect(res.contentPages).toBeLessThanOrEqual(on.contentPages - 4);
    expect(Math.abs(estimatePages(contentFor(off)) - res.contentPages)).toBeLessThanOrEqual(2);
  });

  const rowsOf = async (chapterStart: "inline" | "none") => {
    const bundle = bundleOf({ chapterStart });
    const res = await renderInterior(bundle, "preview");
    const dir = mkdtempSync(path.join(tmpdir(), "chapter-start-"));
    const file = path.join(dir, "book.pdf");
    writeFileSync(file, res.pdf);
    const pages = textRows(file);
    return contentFor(bundle).chapters.map((ch) => ({ ch, rows: pages[res.chapterPages[ch.key] - 1].map((r) => r.text.replace(/\s+/g, " ")) }));
  };

  it.skipIf(!hasTool("pdftotext"))("inline: номер и название главы печатаются вверху первой полосы её текста", async () => {
    for (const { ch, rows } of await rowsOf("inline")) {
      const at = rows.findIndex((r) => r.includes(ch.title));
      expect({ key: ch.key, found: at >= 0 }).toEqual({ key: ch.key, found: true });
      // Над названием — только колонтитул и «Глава N»; первый заголовок истории ниже.
      expect(at).toBeLessThan(4);
      expect(rows.slice(0, at).join(" ").toLowerCase()).toContain(`глава ${ch.number}`);
      expect(rows.findIndex((r) => r.includes(ch.items[0].heading!))).toBeGreaterThan(at);
    }
  });

  it.skipIf(!hasTool("pdftotext"))("none: чистый лист — ни «Глава N», ни названия, сразу первая история", async () => {
    for (const { ch, rows } of await rowsOf("none")) {
      expect(rows.some((r) => r.toLowerCase().includes(`глава ${ch.number}`))).toBe(false);
      // Название главы может стоять только в колонтитуле (первая строка), не над текстом.
      expect(rows.slice(1).some((r) => r === ch.title)).toBe(false);
      expect(rows.findIndex((r) => r.includes(ch.items[0].heading!))).toBeLessThanOrEqual(1);
    }
  });
});

describe("выбор «Начало главы»", () => {
  it("новая книга — отдельная страница; выбор из редактора сохраняется, неизвестное значение не принимается", async () => {
    expect(startBook().snapshot().chapterStart).toBe("page");
    const books = new MemBooks();
    const service = new BooksService(books, noQuestions, themes, { bookHasOrders: async () => false }, new MemFiles(), ids, new FakeUow(), { now: () => testNow }, noChapters);
    await service.start("u1", { theme: "love", language: "ru", authorName: "Алия", authorGender: "f", recipientName: "Марат", recipientGender: "m" });
    await service.updateSettings("b1", owner, { chapterStart: "none" }, undefined as never);
    expect(books.rows.get("b1")!.snapshot().chapterStart).toBe("none");
    await service.updateSettings("b1", owner, { chapterStart: "sideways" as never }, undefined as never);
    expect(books.rows.get("b1")!.snapshot().chapterStart).toBe("none");
  });

  it("у заказанной книги не меняется", () => {
    const ordered = BookAggregate.restore("b1", { ...startBook().snapshot(), status: "ordered" });
    try {
      ordered.applySettings({ chapterStart: "inline" });
      expect.unreachable();
    } catch (e) {
      expect(AuthoringError.is(e) && e.code).toBe("bookLocked");
    }
  });
});
