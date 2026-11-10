import { describe, expect, it } from "vitest";
import { estimatePages, openerPage } from "@/lib/book/estimate";
import { emptyFlow, refineBlanks } from "@/lib/book/flow-decisions";
import { contentFingerprint, contentFor, renderInterior, type BookBundle } from "@/modules/production/infrastructure/pdf/render";
import type { Book, BookQuestion } from "@/shared/infrastructure/db/schema";
import { AuthoringError, Book as BookAggregate } from "@/modules/authoring/domain";
import { BooksService } from "@/modules/authoring/application/services";
import { FakeUow, ids, MemBooks, MemFiles, noChapters, noQuestions, now as testNow, owner, startBook, themes } from "./doubles/authoring";

// 02.11.2026: клиентка спросила, почему в 3D-макете глава стоит рядом с содержанием, а не с текстом, как на развороте
// в «Страницах». Начальная полоса главы вставала, куда выпадет по счёту: с посвящением оглавление на 4-й (слева),
// глава 1 на 5-й (справа, напротив оглавления), текст — уже на следующем развороте. Теперь у книг на полосах глав 2
// начальная полоса всегда слева, напротив первой полосы текста, а где по счёту она выпала бы справа — перед ней пустая.

describe("пустые полосы перед начальными полосами (refineBlanks)", () => {
  it("начальная полоса на нечётной странице получает пустую перед собой, и следующие главы считаются со сдвигом", () => {
    const flow = emptyFlow();
    // Глава a — на 5-й (справа), b — на 9-й: после пустой перед a она сама уйдёт на 10-ю, ей пустая не нужна.
    expect(refineBlanks(["a", "b"], { a: 5, b: 9 }, flow)).toBe(true);
    expect([...flow.blankBefore]).toEqual(["a"]);
    // Следующий проход: a на 6-й, b на 10-й — решение то же.
    expect(refineBlanks(["a", "b"], { a: 6, b: 10 }, flow)).toBe(false);
    expect([...flow.blankBefore]).toEqual(["a"]);
  });

  it("решение пересчитывается целиком: пустая полоса, которая стала не нужна, убирается", () => {
    const flow = emptyFlow();
    flow.blankBefore.add("a");
    // a встала на 6-ю с пустой перед собой, но текст выше стал на полосу короче: без пустой a была бы на 4-й.
    expect(refineBlanks(["a", "b"], { a: 5, b: 8 }, flow)).toBe(true);
    // Без пустой a на 4-й (слева), b сдвигается на 7-ю — ей теперь нужна пустая.
    expect([...flow.blankBefore]).toEqual(["b"]);
  });

  it("главы без начальной полосы в проходе (их нет в pages) пропускаются", () => {
    const flow = emptyFlow();
    expect(refineBlanks(["a", "__gallery"], { a: 4 }, flow)).toBe(false);
    expect(flow.blankBefore.size).toBe(0);
  });
});

describe("оценка объёма с начальной полосой слева", () => {
  it("openerPage: у книги с openersLeft нечётная страница уходит под пустую полосу", () => {
    expect(openerPage({ openersLeft: true }, 5)).toBe(6);
    expect(openerPage({ openersLeft: true }, 4)).toBe(4);
    expect(openerPage({}, 5)).toBe(5);
  });
});

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
  occasion: null,
  occasionDate: null,
  language: "ru",
  createdAt: now,
  updatedAt: now,
};

// Главы разной длины: у части текст кончается на правой полосе, у части — на левой.
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

describe("блок с начальной полосой главы слева", () => {
  it.each([
    ["с посвящением", "Моему самому близкому человеку"],
    ["без посвящения", ""],
  ])("%s: каждая глава начинается на чётной (левой) полосе, перед ней — пустая полоса, если нужна", async (_name, dedication) => {
    const res = await renderInterior(bundleOf({ dedication }), "preview");
    const keys = Object.keys(res.chapterPages);
    expect(keys.length).toBe(4);
    for (const key of keys) {
      const n = res.chapterPages[key];
      expect({ key, left: n % 2 === 0, kind: res.pages[n - 1].kind }).toEqual({ key, left: true, kind: "opener" });
      // Напротив — первая полоса текста главы.
      expect(res.pages[n]).toMatchObject({ kind: "text", chapterKey: key });
    }
    // Пустые полосы — только перед начальными полосами: каждая стоит справа и за ней сразу начальная полоса.
    const blanks = res.pages.filter((p) => p.kind === "blank");
    for (const p of blanks) expect({ right: p.n % 2 === 1, next: res.pages[p.n].kind }).toEqual({ right: true, next: "opener" });
    // Первая глава: с посвящением оглавление на 4-й — пустая 5-я, глава на 6-й; без посвящения оглавление на 3-й — глава на 4-й.
    const first = res.chapterPages.intro;
    if (dedication) {
      expect(first).toBe(6);
      expect(res.pages[4].kind).toBe("blank");
    } else expect(first).toBe(4);
  });

  it("прежние книги (полосы глав 1) — без пустых полос, отпечаток сборки не меняется", async () => {
    const old = bundleOf({ paginationRev: 1 });
    expect(contentFor(old).openersLeft).toBeUndefined();
    expect(JSON.stringify(contentFor(old))).not.toContain("openersLeft");
    expect(contentFingerprint(old)).not.toBe(contentFingerprint(bundleOf({})));
    const res = await renderInterior(old, "preview");
    expect(res.pages.some((p) => p.kind === "blank")).toBe(false);
    // С посвящением глава 1 по-прежнему на 5-й — напротив оглавления.
    expect(res.chapterPages.intro).toBe(5);
  });

  it("оценка объёма учитывает пустые полосы: у книги на полосах глав 2 полос не меньше, чем без них", () => {
    const left = estimatePages(contentFor(bundleOf({})));
    const old = estimatePages(contentFor(bundleOf({ paginationRev: 1 })));
    // С посвящением первая глава встала бы на 5-ю — значит, хотя бы одна пустая полоса.
    expect(left).toBeGreaterThan(old);
    expect(left - old).toBeLessThanOrEqual(5);
  });
});

// 02.11.2026: у клиентки (книга на казахском) пять пустых полос перед главами, убрать их сама она не могла. Владелец:
// «добавь просто кнопку которая регулирует это правило» — «Страницы» → «Элементы» → «Глава всегда с левой страницы».
describe("переключатель «Глава всегда с левой страницы»", () => {
  it("новая книга — включено; выключение и включение меняют полосы глав книги", () => {
    const book = startBook();
    expect(book.snapshot().paginationRev).toBe(2);
    book.setOpenersLeft(false);
    expect(book.snapshot().paginationRev).toBe(1);
    book.setOpenersLeft(true);
    expect(book.snapshot().paginationRev).toBe(2);
  });

  it("у заказанной книги не меняется", () => {
    const book = BookAggregate.restore("b1", { ...startBook().snapshot(), status: "ordered", paginationRev: 1 });
    try {
      book.setOpenersLeft(true);
      expect.unreachable();
    } catch (e) {
      expect(AuthoringError.is(e) && e.code).toBe("bookLocked");
    }
  });

  it("настройка из редактора сохраняется вместе с книгой", async () => {
    const books = new MemBooks();
    const service = new BooksService(books, noQuestions, themes, { bookHasOrders: async () => false }, new MemFiles(), ids, new FakeUow(), { now: () => testNow }, noChapters);
    await service.start("u1", { theme: "love", language: "ru", authorName: "Алия", authorGender: "f", recipientName: "Марат", recipientGender: "m" });
    await service.updateSettings("b1", owner, { openersLeft: false }, undefined as never);
    expect(books.rows.get("b1")!.snapshot().paginationRev).toBe(1);
  });

  it("выключено — вёрстка и отпечаток сборки как у прежних книг: без пустых полос, глава 1 напротив оглавления", async () => {
    const off = bundleOf({ paginationRev: 1 });
    expect(contentFor(off)).toEqual(contentFor({ ...off, book: { ...off.book, paginationRev: undefined as never } }));
    const res = await renderInterior(off, "preview");
    expect(res.pages.filter((p) => p.kind === "blank")).toEqual([]);
    expect(res.contentPages).toBeLessThan((await renderInterior(bundleOf({}), "preview")).contentPages);
  });
});
