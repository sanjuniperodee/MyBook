import { describe, expect, it } from "vitest";
import { Book, checkReadiness, MAX_QUESTIONS, Photo, type BookStats } from "@/modules/authoring/domain";
import { BookOutlineService, BooksService, QuestionsService } from "@/modules/authoring/application/services";
import { MAX_CHAPTERS } from "@/lib/content/kinds";
import { coverNames } from "@/lib/book/cover-names";
import { buildBookContent } from "@/lib/book/book-content";
import { editorModel } from "@/lib/book/editor-data";
import { editorEstimate } from "@/lib/book/editor-estimate";
import { groupByChapter, sectionLabel, type EditorBook, type EditorQuestion } from "@/lib/book/editor-model";
import type { Book as BookRow, BookChapter, BookQuestion } from "@/shared/infrastructure/db/schema";
import { autobiographyTheme, blankTheme, FakeUow, ids, MemBooks, MemFiles, MemOutline, MemPhotos, noChapters, noQuestions, now, owner, rejectsWith, theme, themes, viewOnlyStaff } from "./doubles/authoring";

/**
 * Режимы книги (docs/features/book-modes.md): автобиография и своя книга с чистого листа (blank) — старт трёх видов,
 * оглавление своей книги с перенумерацией и проверкой набора, лимиты, запрет в темах с банком, сборка книги со своими
 * главами без склонения текста автора, имена на обложке.
 */

const input = { userId: "u1", language: "ru" as const, authorName: " Алия ", authorGender: "f" as const, recipientName: " Марат ", recipientGender: "f" as const };
let keySeq = 0;
const newKey = () => `k${++keySeq}`;

// ─── старт трёх видов книг ─────────────────────────────────────────────────

describe("Book.start по видам", () => {
  it("подарок: получатель и его род из мастера, глав своей книги нет", () => {
    const { book, questions, chapters } = Book.start("b1", input, theme("ru"), now);
    expect(book.snapshot()).toMatchObject({ theme: "love", recipientName: "Марат", recipientGender: "f", recordedBy: "" });
    expect(questions).toHaveLength(1);
    expect(chapters).toEqual([]);
  });

  it("автобиография: получателя нет (даже если прислали), род не используется, «кто записал» — со слов рассказчика", () => {
    const { book, questions, chapters } = Book.start("b1", { ...input, recordedBy: "  внучка Аружан ", title: "" }, autobiographyTheme("ru"), now);
    expect(book.snapshot()).toMatchObject({ theme: "autobiography", recipientName: "", recipientGender: "m", recordedBy: "внучка Аружан", title: "История моей жизни", coverTemplate: "leather", interior: "vintage" });
    expect(questions.map((q) => q.key)).toEqual(["autobiography.childhood.1"]);
    expect(chapters).toEqual([]);
    expect(book.kind).toBe("autobiography");
  });

  it("своя книга: первая глава (из мастера или «Начало») и один пустой раздел в ней; получатель по желанию, без рода", () => {
    const named = Book.start("b1", { ...input, firstChapterTitle: " Детство ", recordedBy: "кто-то" }, blankTheme("ru"), now, newKey);
    expect(named.chapters).toEqual([{ key: `k${keySeq}`, title: "Детство", epigraph: "" }]);
    expect(named.questions).toEqual([{ chapter: `k${keySeq}`, key: "custom", prompt: "", title: "", hint: null }]);
    expect(named.book.snapshot()).toMatchObject({ theme: "blank", title: "Моя книга", recipientName: "Марат", recipientGender: "m", recordedBy: "" });

    const plain = Book.start("b1", { ...input, recipientName: "" }, blankTheme("kk"), now, newKey);
    expect(plain.chapters[0].title).toBe("Бастау");
    expect(plain.book.snapshot().recipientName).toBe("");
    expect(() => Book.start("b1", input, blankTheme("ru"), now)).toThrow();
  });

  it("событие book_started несёт тему и автора: CRM различает виды книг и называет сделку", () => {
    const { book } = Book.start("b1", input, autobiographyTheme("ru"), now);
    expect(book.pullEvents()[0].payload).toMatchObject({ theme: "autobiography", authorName: "Алия", recipientName: "" });
  });

  it("настройки по виду: «кто записал» — только у автобиографии, получателя у неё нет, рода получателя нет и у своей книги", () => {
    const auto = Book.start("b1", input, autobiographyTheme("ru"), now).book;
    auto.applySettings({ recordedBy: " сын Ерлан ", recipientName: "Детям", recipientGender: "f" });
    expect(auto.snapshot()).toMatchObject({ recordedBy: "сын Ерлан", recipientName: "", recipientGender: "m" });

    const gift = Book.start("b1", input, theme("ru"), now).book;
    gift.applySettings({ recordedBy: "никто", recipientGender: "m" });
    expect(gift.snapshot()).toMatchObject({ recordedBy: "", recipientGender: "m" });

    const blank = Book.start("b1", input, blankTheme("ru"), now, newKey).book;
    blank.applySettings({ recipientName: "Детям", recipientGender: "f" });
    expect(blank.snapshot()).toMatchObject({ recipientName: "Детям", recipientGender: "m" });
  });
});

describe("BooksService.start и смена языка", () => {
  const setup = () => {
    const books = new MemBooks();
    const outline = new MemOutline();
    const uow = new FakeUow();
    const service = new BooksService(books, outline, themes, { bookHasOrders: async () => false }, new MemFiles(), ids, uow, { now: () => now }, outline);
    return { books, outline, uow, service };
  };
  const start = { language: "ru" as const, authorName: "Алия", authorGender: "f" as const, recipientName: "", recipientGender: "m" as const };

  it("незнакомая тема — unknownTheme, а не молчаливая «любимому»", async () => {
    await rejectsWith(setup().service.start("u1", { ...start, theme: "manual" }), "unknownTheme");
  });

  it("своя книга сохраняется с первой главой и пустым разделом в ней", async () => {
    const { service, books } = setup();
    const book = await service.start("u1", { ...start, theme: "blank", firstChapterTitle: "Детство" });
    const added = books.added.get(book.id)!;
    expect(added.chapters.map((c) => c.title)).toEqual(["Детство"]);
    expect(added.questions).toEqual([{ chapter: added.chapters[0].key, key: "custom", prompt: "", title: "", hint: null }]);
  });

  it("смена языка своей книги: глава «Начало» переводится туда и обратно, своё название главы не трогается", async () => {
    const { service, books, outline } = setup();
    const book = Book.start("b1", { ...input }, blankTheme("ru"), now, newKey).book;
    await books.add(book);
    outline.seed("b1", [{ key: "a", title: "Начало", sections: [""] }, { key: "b", title: "Моя юность", sections: [""] }]);
    await service.updateSettings("b1", owner, { language: "kk" }, new MemPhotos());
    expect((await outline.list("b1")).map((c) => c.title)).toEqual(["Бастау", "Моя юность"]);
    expect(book.title).toBe("Менің кітабым");
    await service.updateSettings("b1", owner, { language: "ru" }, new MemPhotos());
    expect((await outline.list("b1")).map((c) => c.title)).toEqual(["Начало", "Моя юность"]);
    expect(books.locks).toBe(2);
  });
});

// ─── оглавление своей книги ────────────────────────────────────────────────

/** Инвариант §1.6: позиции глав 0..M-1, разделов 0..N-1 подряд, разделы каждой главы — подряд в порядке глав. */
async function expectOutlineInvariant(store: MemOutline, bookId = "b1") {
  const { chapters, sections } = await store.outline(bookId);
  expect(chapters.map((c) => c.position)).toEqual(chapters.map((_, i) => i));
  expect(sections.map((s) => s.position)).toEqual(sections.map((_, i) => i));
  const order = chapters.map((c) => c.key);
  const seen = sections.map((s) => s.chapter).filter((k, i, all) => all.indexOf(k) === i);
  expect(seen).toEqual(order.filter((k) => seen.includes(k)));
}

function outlineSetup(themeOf: (lang: "ru" | "kk") => ReturnType<typeof blankTheme> = blankTheme) {
  const books = new MemBooks();
  const book = Book.start("b1", input, themeOf("ru"), now, newKey).book;
  book.pullEvents(); // книга уже создана: из базы она приходит без событий
  void books.add(book);
  const store = new MemOutline();
  const photos = new MemPhotos();
  const uow = new FakeUow();
  const service = new BookOutlineService(books, store, store, photos, ids, uow);
  const questions = new QuestionsService(books, store, uow, photos, store);
  return { books, book, store, photos, uow, service, questions };
}

describe("BookOutlineService: главы своей книги", () => {
  it("в книгах с банком любые операции оглавления — outlineNotAllowed (и без изменений)", async () => {
    for (const t of [theme, autobiographyTheme]) {
      const { service, store } = outlineSetup(t);
      store.seed("b1", [{ key: "intro", sections: [{ key: "love.intro.1" }] }]);
      await rejectsWith(service.addChapter("b1", owner, { title: "Глава" }), "outlineNotAllowed");
      await rejectsWith(service.renameChapter("b1", owner, "intro", { title: "Своё" }), "outlineNotAllowed");
      await rejectsWith(service.reorderChapters("b1", owner, ["intro"]), "outlineNotAllowed");
      await rejectsWith(service.deleteChapter("b1", owner, "intro"), "outlineNotAllowed");
      await rejectsWith(service.addSection("b1", owner, { chapterKey: "intro", title: "", prompt: "" }), "outlineNotAllowed");
      await rejectsWith(service.reorderSections("b1", owner, [{ id: "s1", chapter: "intro" }]), "outlineNotAllowed");
      expect(store.questions).toHaveLength(1);
    }
  });

  it("сотрудник только на просмотр оглавление не меняет — как будто книги нет; каждая операция берёт книгу под блокировку", async () => {
    const { service, store, books } = outlineSetup();
    store.seed("b1", [{ key: "a", sections: [""] }]);
    await rejectsWith(service.addChapter("b1", viewOnlyStaff, { title: "Глава" }), "bookNotFound");
    await service.addChapter("b1", owner, { title: "Глава" });
    expect(books.locks).toBe(2);
  });

  it("новая глава — с пустым разделом, в конец или после указанной; позиции глав и разделов подряд", async () => {
    const { service, store, uow } = outlineSetup();
    store.seed("b1", [
      { key: "a", title: "Первая", sections: ["раз", "два"] },
      { key: "b", title: "Вторая", sections: ["три"] },
    ]);
    const end = await service.addChapter("b1", owner, { title: "  Последняя  " });
    expect(end.outline.chapters.map((c) => c.title)).toEqual(["Первая", "Вторая", "Последняя"]);
    expect(end.outline.sections.at(-1)).toMatchObject({ id: end.sectionId, chapter: end.key });
    const middle = await service.addChapter("b1", owner, { title: "Между", afterKey: "a" });
    expect(middle.outline.chapters.map((c) => c.title)).toEqual(["Первая", "Между", "Вторая", "Последняя"]);
    expect(middle.outline.sections.map((s) => s.chapter)).toEqual(["a", "a", middle.key, "b", end.key]);
    await expectOutlineInvariant(store);
    await rejectsWith(service.addChapter("b1", owner, { title: "x", afterKey: "nope" }), "chapterNotFound");
    // Пустые главы и разделы без текста прогресс не двигают.
    expect(uow.published).toEqual([]);
  });

  it("лимиты: не больше 50 глав; при 600 разделах глава не создаётся вовсе (без «главы без раздела»)", async () => {
    const full = outlineSetup();
    full.store.seed("b1", Array.from({ length: MAX_CHAPTERS }, (_, i) => ({ key: `c${i}`, sections: [""] })));
    const err = await full.service.addChapter("b1", owner, { title: "Лишняя" }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "chaptersLimit", params: [MAX_CHAPTERS] });

    const many = outlineSetup();
    many.store.seed("b1", [{ key: "a", sections: Array.from({ length: MAX_QUESTIONS }, () => "") }]);
    await rejectsWith(many.service.addChapter("b1", owner, { title: "Ещё" }), "questionsLimit");
    await rejectsWith(many.service.addSection("b1", owner, { chapterKey: "a", title: "", prompt: "" }), "questionsLimit");
    expect(many.store.chapterRows).toHaveLength(1);
  });

  it("переименование и эпиграф главы — по ключу; лишнее обрезается по лимитам; чужой ключ — chapterNotFound", async () => {
    const { service, store } = outlineSetup();
    store.seed("b1", [{ key: "a", title: "Было", sections: [""] }]);
    const outline = await service.renameChapter("b1", owner, "a", { title: "Стало", epigraph: " Эпиграф ".repeat(100) });
    expect(outline.chapters[0].title).toBe("Стало");
    expect(outline.chapters[0].epigraph.length).toBeLessThanOrEqual(300);
    await rejectsWith(service.renameChapter("b1", owner, "zz", { title: "x" }), "chapterNotFound");
  });

  it("перестановка глав: полный порядок того же набора; разделы идут за своими главами; другой набор — outlineOutdated", async () => {
    const { service, store } = outlineSetup();
    store.seed("b1", [
      { key: "a", sections: ["1", "2"] },
      { key: "b", sections: ["3"] },
      { key: "c", sections: ["4", "5"] },
    ]);
    const outline = await service.reorderChapters("b1", owner, ["c", "a", "b"]);
    expect(outline.sections.map((s) => s.chapter)).toEqual(["c", "c", "a", "a", "b"]);
    await expectOutlineInvariant(store);
    await rejectsWith(service.reorderChapters("b1", owner, ["c", "a"]), "outlineOutdated");
    await rejectsWith(service.reorderChapters("b1", owner, ["c", "a", "a"]), "outlineOutdated");
    await rejectsWith(service.reorderChapters("b1", owner, ["c", "a", "x"]), "outlineOutdated");
  });

  it("удаление главы: вместе с разделами, фото разделов отвязываются, позиции подряд; был текст — событие прогресса", async () => {
    const { service, store, photos, uow } = outlineSetup();
    store.seed("b1", [
      { key: "a", sections: ["текст"] },
      { key: "b", sections: ["", ""] },
      { key: "c", sections: ["ещё"] },
    ]);
    const photo = Photo.uploaded("p1", { bookId: "b1", position: 0, storageKey: "a", thumbKey: "b", width: 10, height: 10 });
    photo.update({ questionId: "s1", inline: { width: 60, align: "left", anchor: 0, aspect: "1:1", focusX: 0.5, focusY: 0.5, frame: "line" } });
    await photos.add(photo);

    const empty = await service.deleteChapter("b1", owner, "b");
    expect(empty.chapters.map((c) => c.key)).toEqual(["a", "c"]);
    expect(uow.published).toEqual([]);

    const withText = await service.deleteChapter("b1", owner, "a");
    expect(withText.chapters.map((c) => [c.key, c.position])).toEqual([["c", 0]]);
    expect(withText.sections).toEqual([{ id: "s4", chapter: "c", position: 0 }]);
    expect(photo.snapshot()).toMatchObject({ questionId: null, inline: null });
    expect(uow.published.map((e) => e.type)).toEqual(["authoring.book_progressed"]);
    await expectOutlineInvariant(store);
    await rejectsWith(service.deleteChapter("b1", owner, "a"), "chapterNotFound");
  });

  it("последнюю главу можно удалить — книга остаётся без глав (пустое состояние редактора)", async () => {
    const { service, store } = outlineSetup();
    store.seed("b1", [{ key: "a", sections: [""] }]);
    expect(await service.deleteChapter("b1", owner, "a")).toEqual({ chapters: [], sections: [] });
  });
});

describe("BookOutlineService: разделы своей книги", () => {
  it("новый раздел — в конец главы или сразу после указанного; afterId из другой главы — outlineOutdated", async () => {
    const { service, store } = outlineSetup();
    store.seed("b1", [
      { key: "a", sections: ["1", "2"] },
      { key: "b", sections: ["3"] },
    ]);
    const atEnd = await service.addSection("b1", owner, { chapterKey: "a", title: " Заголовок ", prompt: " Что вспомнить? " });
    expect(atEnd.outline.sections.map((s) => s.id)).toEqual(["s1", "s2", atEnd.id, "s3"]);
    expect(store.questions.find((q) => q.id === atEnd.id)).toMatchObject({ key: "custom", title: "Заголовок", prompt: "Что вспомнить?", answer: "" });
    const after = await service.addSection("b1", owner, { chapterKey: "a", afterId: "s1", title: "", prompt: "" });
    expect(after.outline.sections.map((s) => s.id)).toEqual(["s1", after.id, "s2", atEnd.id, "s3"]);
    await expectOutlineInvariant(store);
    await rejectsWith(service.addSection("b1", owner, { chapterKey: "a", afterId: "s3", title: "", prompt: "" }), "outlineOutdated");
    await rejectsWith(service.addSection("b1", owner, { chapterKey: "zz", title: "", prompt: "" }), "chapterNotFound");
    await rejectsWith(service.addSection("b1", owner, { chapterKey: "a", afterId: "nope", title: "", prompt: "" }), "questionNotFound");
  });

  it("перестановка разделов: перенос в другую главу и выше/ниже; разделы глав остаются подряд; другой набор или глава — outlineOutdated", async () => {
    const { service, store } = outlineSetup();
    store.seed("b1", [
      { key: "a", sections: ["1", "2"] },
      { key: "b", sections: ["3"] },
    ]);
    // s3 — в начало главы a; s1 — в главу b. Порядок присылают как угодно: главы всё равно идут подряд.
    const outline = await service.reorderSections("b1", owner, [
      { id: "s1", chapter: "b" },
      { id: "s3", chapter: "a" },
      { id: "s2", chapter: "a" },
    ]);
    expect(outline.sections.map((s) => `${s.chapter}:${s.id}`)).toEqual(["a:s3", "a:s2", "b:s1"]);
    await expectOutlineInvariant(store);
    await rejectsWith(service.reorderSections("b1", owner, [{ id: "s1", chapter: "a" }]), "outlineOutdated");
    await rejectsWith(service.reorderSections("b1", owner, [{ id: "s1", chapter: "a" }, { id: "s2", chapter: "a" }, { id: "s3", chapter: "zz" }]), "outlineOutdated");
    await rejectsWith(service.reorderSections("b1", owner, [{ id: "s1", chapter: "a" }, { id: "s1", chapter: "a" }, { id: "s3", chapter: "a" }]), "outlineOutdated");
  });

  it("раздел удаляется прежним DELETE: фото остаются в книге, позиции подряд, оглавление в ответе; был текст — событие", async () => {
    const { questions, store, photos, uow } = outlineSetup();
    store.seed("b1", [
      { key: "a", sections: ["текст", ""] },
      { key: "b", sections: [""] },
    ]);
    const photo = Photo.uploaded("p1", { bookId: "b1", position: 0, storageKey: "a", thumbKey: "b", width: 10, height: 10 });
    photo.update({ questionId: "s1" });
    await photos.add(photo);
    const outline = await questions.deleteCustom("b1", owner, "s1");
    expect(outline?.sections).toEqual([
      { id: "s2", chapter: "a", position: 0 },
      { id: "s3", chapter: "b", position: 1 },
    ]);
    expect(photo.snapshot().questionId).toBeNull();
    expect(uow.published.map((e) => e.type)).toEqual(["authoring.book_progressed"]);
    await rejectsWith(questions.deleteCustom("b1", owner, "s1"), "questionNotFound");
  });

  it("заголовок и подсказка раздела правятся только у своей книги; переписанный заголовок и скрытие она не использует", async () => {
    const { questions, store } = outlineSetup();
    store.seed("b1", [{ key: "a", sections: [""] }]);
    await questions.edit("b1", owner, "s1", { title: " Мы [Аня|Анна] ", prompt: " Что было? ", displayText: "Чужое", hideHeading: true });
    expect(store.questions[0]).toMatchObject({ title: "Мы [Аня|Анна]", prompt: "Что было?", displayText: null, hideHeading: false });

    const gift = outlineSetup(theme);
    gift.store.seed("b1", [{ key: "meet", sections: [{ key: "custom" }, { key: "love.meet.1" }] }]);
    await rejectsWith(gift.questions.edit("b1", owner, "s1", { prompt: "Новый вопрос" }), "outlineNotAllowed");
    await rejectsWith(gift.questions.edit("b1", owner, "s2", { title: "Своё" }), "outlineNotAllowed");
    await gift.questions.edit("b1", owner, "s1", { displayText: "Свой заголовок" });
    expect(gift.store.questions[0].displayText).toBe("Свой заголовок");
  });

  it("автосохранение берёт строку книги под блокировку первой — как операции оглавления (без взаимной блокировки с перестановкой)", async () => {
    const { questions, store, books } = outlineSetup();
    store.seed("b1", [{ key: "a", sections: [""] }]);
    await questions.edit("b1", owner, "s1", { answer: "Текст" });
    expect(books.locks).toBe(1);
    await rejectsWith(questions.edit("b1", viewOnlyStaff, "s1", { answer: "Чужое" }), "bookNotFound");
    expect(store.questions[0].answer).toBe("Текст");
  });

  it("свой вопрос прежней формой (после вопроса) в своей книге — outlineNotAllowed; в книге с банком — после него и с перенумерацией", async () => {
    const blank = outlineSetup();
    blank.store.seed("b1", [{ key: "a", sections: [""] }]);
    await rejectsWith(blank.questions.addCustom("b1", owner, "s1", "Вопрос?"), "outlineNotAllowed");

    const gift = outlineSetup(theme);
    gift.store.seed("b1", [{ key: "meet", sections: [{ key: "love.meet.1" }, { key: "love.meet.2" }] }]);
    const id = await gift.questions.addCustom("b1", owner, "s1", "Мой вопрос");
    expect(gift.store.of("b1").map((q) => q.id)).toEqual(["s1", id, "s2"]);
    // Удаление своего вопроса в книге с банком: позиции снова подряд, оглавления в ответе нет.
    expect(await gift.questions.deleteCustom("b1", owner, id)).toBeNull();
    expect(gift.store.of("b1").map((q) => q.position)).toEqual([0, 1]);
    await rejectsWith(gift.questions.deleteCustom("b1", owner, "s1"), "onlyOwnQuestions");
  });

  it("своя книга идёт по вехам по словам: событие, когда сумма слов книги пересекла порог, а не на каждое сохранение", async () => {
    const { questions, store, uow } = outlineSetup();
    store.seed("b1", [{ key: "a", sections: ["слово ".repeat(990), "начало"] }]);
    await questions.edit("b1", owner, "s2", { answer: "начало и ещё" });
    expect(uow.published).toEqual([]);
    await questions.edit("b1", owner, "s2", { answer: "слово ".repeat(20) });
    expect(uow.published.map((e) => e.type)).toEqual(["authoring.book_progressed"]);
  });
});

// ─── готовность к заказу ───────────────────────────────────────────────────

describe("checkReadiness по видам", () => {
  const stats = (s: Partial<BookStats>): BookStats => ({ answered: 0, total: 1, photos: 0, words: 0, estimatedPages: 40, printedPages: 40, emptyChapters: 0, ...s });
  const book = (themeId: string, authorName = "Алия") => ({ id: "b", theme: themeId, coverTemplate: "linen", coverPhotoId: null, coverPhotoExtra: [], authorName, format: "a5" });
  const texts = (b: ReturnType<typeof book>, s: BookStats) => checkReadiness(b, s, []).map((i) => i.text);

  it("своя книга: без текста — «нет ни одного раздела», коротко — по словам (порог progressOf), 1000 слов — не коротко", () => {
    expect(texts(book("blank"), stats({}))).toContain("В книге пока нет ни одного раздела с текстом.");
    expect(texts(book("blank"), stats({ answered: 40, words: 600 }))).toContain("Пока написано всего 600 слов — книга получится совсем короткой.");
    expect(texts(book("blank"), stats({ answered: 2, words: 1000 })).some((t) => t.includes("короткой"))).toBe(false);
  });

  it("своя книга: о пустых главах предупреждает со ссылкой на редактор, у остальных книг — молчит", () => {
    const issues = checkReadiness(book("blank"), stats({ answered: 5, words: 1200, emptyChapters: 2 }), []);
    expect(issues.find((i) => i.text.includes("без текста и фото"))).toMatchObject({ level: "warning", href: "/books/b/questions", text: "2 главы без текста и фото в книгу не попадут." });
    expect(texts(book("blank"), stats({ answered: 5, words: 1200, emptyChapters: 1 }))).toContain("Одна глава без текста и фото в книгу не попадёт.");
    expect(texts(book("blank"), stats({ answered: 5, words: 1200 })).some((t) => t.includes("без текста и фото"))).toBe(false);
    expect(texts(book("love"), stats({ answered: 30, emptyChapters: 3 })).some((t) => t.includes("без текста и фото"))).toBe(false);
  });

  it("книга с банком — как прежде по ответам; автобиография без имени — «имя рассказчика»", () => {
    expect(texts(book("love"), stats({ answered: 9 }))).toContain("Заполнено всего 9 ответов — книга получится совсем короткой.");
    expect(texts(book("love"), stats({ answered: 10 })).some((t) => t.includes("короткой"))).toBe(false);
    expect(texts(book("autobiography", ""), stats({ answered: 30 }))).toContain("Не указано имя рассказчика на обложке.");
  });
});

// ─── сборка книги: свои главы, текст автора, подписи по виду ───────────────

const CREATED = new Date("2026-03-08T09:00:00Z");
const bookRow = (p: Partial<BookRow> = {}): BookRow => ({
  id: "b1",
  userId: "u1",
  theme: "blank",
  status: "draft",
  title: "",
  subtitle: "",
  authorName: "Алия",
  authorGender: "f",
  recordedBy: "",
  recipientName: "",
  recipientGender: "m",
  hideRecipientOnCover: false,
  namesOnCover: "",
  coverTemplate: "linen",
  coverPhotoId: null,
  coverPhotoExtra: [],
  backText: "",
  backLayout: "quote",
  backPhotoId: null,
  backPhotoExtra: [],
  photoFrames: {},
  dedication: "",
  interior: "classic",
  format: "a5",
  photoPlacement: "chapters",
  showToc: true,
  tocMode: "chapters",
  tocLines: {},
  inviteToken: null,
  language: "ru",
  occasion: null,
  occasionDate: null,
  createdAt: CREATED,
  updatedAt: CREATED,
  ...p,
});
const chapterRow = (key: string, position: number, title: string, epigraph = ""): BookChapter => ({ id: `ch-${key}`, bookId: "b1", key, position, title, epigraph, createdAt: CREATED, updatedAt: CREATED });
const section = (id: string, chapter: string, position: number, title: string, answer: string, questionKey: string | null = "custom"): BookQuestion => ({
  id,
  bookId: "b1",
  position,
  chapter,
  questionKey,
  prompt: "",
  title,
  hint: null,
  displayText: null,
  hideHeading: false,
  answer,
  media: [],
  createdAt: CREATED,
  updatedAt: CREATED,
});

describe("сборка своей книги", () => {
  // Главы: «b» стоит в оглавлении первой, хотя её раздел позже по позиции; «e» пустая; раздел «x» — потерянной главы.
  const chapters = [chapterRow("b", 0, "Юность 🌸", "Эпиграф [не|склонять]"), chapterRow("a", 1, "Детство {м|ж}"), chapterRow("e", 2, "Пустая"), chapterRow("u", 3, "  ")];
  const questions = [section("q1", "a", 0, "Мы [Аня|Анна]", "Текст про детство."), section("q2", "b", 1, "", "Текст про юность."), section("q3", "u", 2, "Без названия главы", "Текст."), section("q4", "x", 3, "Потерянный", "Остался.")];

  it("главы — в порядке оглавления автора; названия и эпиграфы — как у автора, без эмодзи; пустые главы не печатаются", () => {
    const c = buildBookContent(bookRow(), questions, [], chapters, 2026);
    expect(c.chapters.map((ch) => [ch.number, ch.key, ch.title, ch.epigraph ?? null])).toEqual([
      [1, "b", "Юность", "Эпиграф [не|склонять]"],
      [2, "a", "Детство {м|ж}", null],
      [3, "u", "Без названия", null],
      [4, "x", "Без названия", null],
    ]);
  });

  it("текст автора не склоняется: «[Аня|Анна]» в заголовке раздела печатается как есть; раздел без заголовка — разделителем", () => {
    const c = buildBookContent(bookRow({ authorGender: "m", recipientGender: "f" }), questions, [], chapters, 2026);
    const items = c.chapters.flatMap((ch) => ch.items.map((it) => [it.id, it.heading]));
    expect(items).toEqual([
      ["q2", ""],
      ["q1", "Мы [Аня|Анна]"],
      ["q3", "Без названия главы"],
      ["q4", "Потерянный"],
    ]);
  });

  it("название по умолчанию у своей книги никогда не пустое; подписи — по виду книги", () => {
    const blank = buildBookContent(bookRow(), [], [], [], 2026);
    expect([blank.title, blank.kind, blank.galleryTitle, blank.recordedBy]).toEqual(["Моя книга", "blank", "Фотографии", ""]);
    const kk = buildBookContent(bookRow({ language: "kk" }), [], [], [], 2026);
    expect([kk.title, kk.galleryTitle]).toEqual(["Менің кітабым", "Фотосуреттер"]);
    const auto = buildBookContent(bookRow({ theme: "autobiography", recordedBy: " внучка Аружан 🌷 " }), [], [], [], 2026);
    expect([auto.title, auto.galleryTitle, auto.recordedBy]).toEqual(["История моей жизни", "Из семейного альбома", "внучка Аружан"]);
    // «Кто записал» печатается только у автобиографии.
    expect(buildBookContent(bookRow({ theme: "love", recordedBy: "кто-то" }), [], [], [], 2026).recordedBy).toBe("");
  });

  it("свой вопрос в книге-подарке тоже не склоняется — в печати, в редакторе и в оценке объёма", () => {
    const gift = bookRow({ theme: "love", authorGender: "m", recipientGender: "f" });
    const rows = [section("q1", "intro", 0, "Когда я {понял|поняла}", "Ответ.", "love.intro.1"), { ...section("q2", "intro", 1, "Мы [Аня|Анна]", "Ответ."), prompt: "Мы [Аня|Анна]" }];
    const c = buildBookContent(gift, rows, [], [], 2026);
    expect(c.chapters[0].items.map((it) => it.heading)).toEqual(["Когда я понял", "Мы [Аня|Анна]"]);
    const model = editorModel(gift, rows, [], []);
    expect(model.questions.map((q) => [q.prompt, q.defaultTitle])).toEqual([
      ["", "Когда я понял"],
      ["Мы [Аня|Анна]", "Мы [Аня|Анна]"],
    ]);
    const editorBook: EditorBook = { id: "b1", format: "a5", interior: "classic", dedication: "", showToc: true, photoPlacement: "chapters", title: "", language: "ru", theme: "love", kind: "gift", authorGender: "m", recipientGender: "f" };
    expect(editorEstimate(editorBook, model.questions, [], []).raw).toBeGreaterThan(0);
  });
});

describe("редактор своей книги: главы и подписи", () => {
  const rows = [section("q1", "a", 0, "", "Текст"), section("q2", "x", 1, "Потерянный", "")];
  const chapters = [chapterRow("a", 0, "Первая", "Эпиграф"), chapterRow("e", 1, "")];
  const model = editorModel(bookRow(), rows, chapters, []);

  it("главы — из оглавления автора, вместе с пустыми; эпиграфы — его; разделы без главы — своей группой в конце", () => {
    expect(model.chapters).toEqual([
      { key: "a", title: "Первая", epigraph: "Эпиграф", own: true },
      { key: "e", title: "", epigraph: "", own: true },
    ]);
    expect(model.epigraphs).toEqual({ a: "Эпиграф" });
    expect(groupByChapter(model.questions, model.chapters).map((g) => `${g.key}:${g.items.length}`)).toEqual(["a:1", "e:0", "x:1"]);
  });

  it("подпись раздела никогда не пустая: заголовок, иначе подсказка, иначе «без заголовка»; у книг с банком — вопрос", () => {
    const q = (p: Partial<EditorQuestion>) => ({ hideHeading: false, displayText: null, defaultTitle: "", prompt: "", ...p });
    expect(sectionLabel(q({ defaultTitle: "Заголовок", prompt: "Подсказка" }), "blank", "Без заголовка")).toBe("Заголовок");
    expect(sectionLabel(q({ prompt: "Подсказка" }), "blank", "Без заголовка")).toBe("Подсказка");
    expect(sectionLabel(q({}), "blank", "Без заголовка")).toBe("Без заголовка");
    expect(sectionLabel(q({ defaultTitle: "Как мы познакомились", prompt: "Как вы познакомились?" }), "gift", "—")).toBe("Как вы познакомились?");
  });
});

describe("coverNames", () => {
  const b = (theme: string, recipientName = "Детям и внукам", hideRecipientOnCover = false) => ({ theme, authorName: " Иван Петров ", recipientName, hideRecipientOnCover });
  it("автобиография — только автор (рассказчик); подарок и своя книга — автор и получатель, если он есть и не скрыт", () => {
    expect(coverNames(b("autobiography"))).toBe("Иван Петров");
    expect(coverNames(b("love", "Алия"))).toBe("Иван Петров & Алия");
    expect(coverNames(b("blank"))).toBe("Иван Петров & Детям и внукам");
    expect(coverNames(b("blank", ""))).toBe("Иван Петров");
    expect(coverNames(b("love", "Алия", true))).toBe("Иван Петров");
  });

  it("своя строка автора заменяет имена по умолчанию (порядок, «мен» — что угодно); пустая — как по умолчанию", () => {
    expect(coverNames({ ...b("love", "Алия"), namesOnCover: " Алия & Иван Петров " })).toBe("Алия & Иван Петров");
    expect(coverNames({ ...b("autobiography"), namesOnCover: "Иван Петрович" })).toBe("Иван Петрович");
    expect(coverNames({ ...b("love", "Алия"), namesOnCover: "   " })).toBe("Иван Петров & Алия");
  });
});

// Сервисы с банком вопросов, собранные без оглавления, — как в проде у книг-подарков (noChapters, noQuestions).
describe("книга-подарок без оглавления", () => {
  it("BooksService со смены языка не трогает главы, если у темы нет названия первой главы", async () => {
    const books = new MemBooks();
    const service = new BooksService(books, noQuestions, themes, { bookHasOrders: async () => false }, new MemFiles(), ids, new FakeUow(), { now: () => now }, noChapters);
    const book = await service.start("u1", { theme: "love", language: "ru", authorName: "А", authorGender: "f", recipientName: "М", recipientGender: "m" });
    await service.updateSettings(book.id, owner, { language: "kk" }, new MemPhotos());
    expect(book.language).toBe("kk");
  });
});
