import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { DrizzleUnitOfWork, InProcessEventBus, OutboxDispatcher } from "@/shared/infrastructure";
import { answeredSql, halfSql, readySql, textStepSql, totalSql, wordsSql } from "@/shared/infrastructure/db/bookProgress";
import { DrizzleBookRepository, DrizzleChapterRepository, DrizzlePhotoRepository, DrizzleQuestionRepository } from "@/modules/authoring/infrastructure/persistence";
import { DrizzleAuthoringQueries } from "@/modules/authoring/infrastructure/queries";
import { contentThemes } from "@/modules/authoring/infrastructure/adapters";
import { BookOutlineService, BooksService, QuestionsService } from "@/modules/authoring/application/services";
import { AuthoringError, MAX_QUESTIONS, type BookViewer } from "@/modules/authoring/domain";
import { bookKind, MAX_CHAPTERS, progressOf } from "@/lib/content/kinds";
import { countWords, toPhotoItem } from "@/lib/book/layout";
import { buildBookContent } from "@/lib/book/book-content";
import { editorModel } from "@/lib/book/editor-data";
import { groupByChapter } from "@/lib/book/editor-model";
import { sqlBookProgress } from "@/modules/sales/infrastructure/adapters";
import { bookList } from "@/modules/reporting/infrastructure/Books";
import { dashboard } from "@/modules/reporting/infrastructure/Dashboard";
import { DrizzleLifecycleSource } from "@/modules/notifications/infrastructure/persistence";

/**
 * Своя книга на настоящем PostgreSQL: перенумерация после вставки, переноса и удаления (§1.6), блокировка строки книги
 * при параллельных операциях оглавления, удаление главы с фото, порядок глав в печати = порядок в редакторе,
 * SQL-прогресс (bookProgress.ts) = progressOf. Запуск: INTEGRATION=1 npx vitest run tests/book-modes.integration.test.ts
 * (база из DATABASE_URL с применёнными миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `bm${Date.now()}`;
const silent = { info() {}, warn() {}, error() {} };

run("своя книга и прогресс (PostgreSQL)", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const uow = new DrizzleUnitOfWork(new OutboxDispatcher(new InProcessEventBus(silent), silent));
  const books = new DrizzleBookRepository();
  const questions = new DrizzleQuestionRepository();
  const chapters = new DrizzleChapterRepository();
  const photos = new DrizzlePhotoRepository();
  const files = { get: async () => Buffer.alloc(0), put: async () => {}, delete: async () => {}, deletePrefix: async () => {} };
  const ids = { uuid: () => crypto.randomUUID(), inviteToken: () => crypto.randomUUID(), revision: () => "r" };
  const service = new BooksService(books, questions, contentThemes, { bookHasOrders: async () => false }, files, ids, uow, { now: () => new Date() }, chapters);
  const outline = new BookOutlineService(books, questions, chapters, photos, ids, uow);
  const sections = new QuestionsService(books, questions, uow, photos, chapters);
  const queries = new DrizzleAuthoringQueries();
  let viewer: BookViewer;

  const newBook = async (theme: string, extra: Record<string, string> = {}) =>
    service.start(viewer.userId, { theme, language: "ru", authorName: "Алия", authorGender: "f", recipientName: "", recipientGender: "m", ...extra });

  /** Инвариант §1.6 прямо в базе: позиции глав и разделов 0..N-1, разделы каждой главы подряд в порядке глав. */
  async function expectInvariant(bookId: string) {
    const ch = await q<{ key: string; position: number }>(sql`select key, position from book_chapters where book_id = ${bookId} order by position`);
    const qs = await q<{ chapter: string; position: number }>(sql`select chapter, position from book_questions where book_id = ${bookId} order by position`);
    expect(ch.map((c) => c.position)).toEqual(ch.map((_, i) => i));
    expect(qs.map((s) => s.position)).toEqual(qs.map((_, i) => i));
    const seen = qs.map((s) => s.chapter).filter((k, i, all) => all.indexOf(k) === i);
    const order = ch.map((c) => c.key);
    expect(seen.filter((k) => order.includes(k))).toEqual(order.filter((k) => seen.includes(k)));
    // Разделы пропавших глав — после всех разделов существующих глав.
    const firstLost = qs.findIndex((s) => !order.includes(s.chapter));
    if (firstLost >= 0) expect(qs.slice(firstLost).every((s) => !order.includes(s.chapter))).toBe(true);
  }

  beforeAll(async () => {
    const [u] = await q<{ id: string }>(sql`insert into users (email, password_hash, name) values (${tag + "@t.kz"}, 'x', 'Автор') returning id`);
    viewer = { userId: u.id, isStaff: false, staffEdits: false };
  });
  afterAll(async () => {
    await q(sql`delete from users where email = ${tag + "@t.kz"}`);
    await pool.end();
  });

  it("новая своя книга: первая глава «Начало» и пустой раздел; операции оглавления держат позиции подряд", async () => {
    const book = await newBook("blank");
    const start = await queries.chapters(book.id);
    expect(start.map((c) => [c.title, c.position])).toEqual([["Начало", 0]]);
    expect((await queries.questions(book.id)).map((r) => [r.chapter, r.questionKey, r.title, r.prompt])).toEqual([[start[0].key, "custom", "", ""]]);

    const a = start[0].key;
    const { key: b } = await outline.addChapter(book.id, viewer, { title: "Юность" });
    const { key: c } = await outline.addChapter(book.id, viewer, { title: "Середина", afterKey: a });
    await expectInvariant(book.id);
    const s2 = (await outline.addSection(book.id, viewer, { chapterKey: a, title: "Второй", prompt: "" })).id;
    const s1 = (await queries.questions(book.id)).find((r) => r.chapter === a && r.id !== s2)!.id;
    await outline.addSection(book.id, viewer, { chapterKey: a, afterId: s1, title: "Между", prompt: "" });
    await expectInvariant(book.id);

    await outline.reorderChapters(book.id, viewer, [b, a, c]);
    await expectInvariant(book.id);
    const order = (await outline.outline(book.id, viewer)).sections;
    await outline.reorderSections(
      book.id,
      viewer,
      order.map((s) => ({ id: s.id, chapter: s.id === s2 ? c : s.chapter })),
    );
    await expectInvariant(book.id);
    expect((await queries.questions(book.id)).find((r) => r.id === s2)?.chapter).toBe(c);

    await sections.deleteCustom(book.id, viewer, s1);
    await expectInvariant(book.id);
    await outline.deleteChapter(book.id, viewer, a);
    await expectInvariant(book.id);
    expect((await queries.chapters(book.id)).map((ch) => ch.title)).toEqual(["Юность", "Середина"]);
  });

  it("параллельные операции (две вкладки): позиции без дублей, набор проверяется под блокировкой, лимит глав не превышен", async () => {
    const book = await newBook("blank");
    const [first] = await queries.chapters(book.id);
    const before = await outline.outline(book.id, viewer);
    const stale = before.sections.map((s) => ({ id: s.id, chapter: s.chapter }));
    const results = await Promise.allSettled([
      ...Array.from({ length: 5 }, (_, i) => outline.addSection(book.id, viewer, { chapterKey: first.key, title: `Раздел ${i}`, prompt: "" })),
      outline.reorderSections(book.id, viewer, stale),
      outline.reorderSections(book.id, viewer, stale),
    ]);
    expect(results.slice(0, 5).every((r) => r.status === "fulfilled")).toBe(true);
    // Перестановка со старым набором — либо до вставок (набор совпал), либо отказ outlineOutdated, а не порча позиций.
    for (const r of results.slice(5)) if (r.status === "rejected") expect(AuthoringError.is(r.reason) && r.reason.code).toBe("outlineOutdated");
    expect(await questions.count(book.id)).toBe(before.sections.length + 5);
    await expectInvariant(book.id);

    // Лимит глав: 49 глав и три параллельные «+ Глава» — проходит ровно одна.
    for (let i = (await queries.chapters(book.id)).length; i < MAX_CHAPTERS - 1; i++) await outline.addChapter(book.id, viewer, { title: `Глава ${i}` });
    const race = await Promise.allSettled([1, 2, 3].map((n) => outline.addChapter(book.id, viewer, { title: `Гонка ${n}` })));
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(race.filter((r) => r.status === "rejected").map((r) => AuthoringError.is((r as PromiseRejectedResult).reason) && (r as PromiseRejectedResult).reason.code)).toEqual(["chaptersLimit", "chaptersLimit"]);
    expect(await queries.chapters(book.id)).toHaveLength(MAX_CHAPTERS);
    await expectInvariant(book.id);
    expect(await questions.count(book.id)).toBeLessThanOrEqual(MAX_QUESTIONS);
  });

  it("удаление главы с фото: фото остаётся в книге без связи с разделом и без оформления «в тексте», книга собирается", async () => {
    const book = await newBook("blank");
    const [ch] = await queries.chapters(book.id);
    const [sec] = await queries.questions(book.id);
    await sections.edit(book.id, viewer, sec.id, { answer: "Текст раздела." });
    const inline = { width: 60, align: "left", anchor: 0, aspect: "1:1", focusX: 0.5, focusY: 0.5, frame: "line" };
    const [photo] = await q<{ id: string }>(sql`
      insert into photos (book_id, position, storage_key, thumb_key, width, height, question_id, inline)
      values (${book.id}, 0, 'photos/x.jpg', 'photos/x_thumb.jpg', 1200, 800, ${sec.id}, ${JSON.stringify(inline)}::jsonb) returning id`);
    await outline.addChapter(book.id, viewer, { title: "Вторая" });
    await outline.deleteChapter(book.id, viewer, ch.key);
    expect(await q(sql`select question_id, inline from photos where id = ${photo.id}`)).toEqual([{ question_id: null, inline: null }]);
    const bundle = (await queries.bundle(book.id))!;
    const content = buildBookContent(bundle.book, bundle.questions, bundle.photos.map(toPhotoItem), bundle.chapters, 2026, bundle.letters);
    // Глав с текстом не осталось — фото уходит в общий раздел фото в конце книги.
    expect(content.chapters).toEqual([]);
    expect(content.galleryPhotos.map((p) => [p.id, p.questionId, p.inline])).toEqual([[photo.id, null, null]]);
    expect(content.galleryTitle).toBe("Фотографии");
  });

  it("порядок глав в печати = порядок в редакторе = оглавление автора; раздел потерянной главы — в конце, «Без названия»", async () => {
    const book = await newBook("blank");
    const [a] = await queries.chapters(book.id);
    const { key: b } = await outline.addChapter(book.id, viewer, { title: "Вторая 🌿" });
    const { key: c } = await outline.addChapter(book.id, viewer, { title: "" });
    await outline.addChapter(book.id, viewer, { title: "Пустая" });
    for (const key of [a.key, b, c]) {
      const id = (await queries.questions(book.id)).find((r) => r.chapter === key)!.id;
      await sections.edit(book.id, viewer, id, { answer: `Текст главы ${key}.`, title: "Мы [Аня|Анна]" });
    }
    await outline.reorderChapters(book.id, viewer, [c, (await queries.chapters(book.id)).at(-1)!.key, a.key, b]);
    // Сбой или ручная правка: раздел ссылается на главу, которой нет.
    const lost = (await outline.addSection(book.id, viewer, { chapterKey: a.key, title: "Потерянный", prompt: "" })).id;
    await sections.edit(book.id, viewer, lost, { answer: "Остался без главы." });
    await q(sql`update book_questions set chapter = 'lost-chapter' where id = ${lost}`);
    await questions.renumber(book.id, "outline");
    await expectInvariant(book.id);

    const bundle = (await queries.bundle(book.id))!;
    const content = buildBookContent(bundle.book, bundle.questions, [], bundle.chapters, 2026, []);
    expect(content.chapters.map((ch) => [ch.key, ch.title])).toEqual([
      [c, "Без названия"],
      [a.key, "Начало"],
      [b, "Вторая"],
      ["lost-chapter", "Без названия"],
    ]);
    expect(content.chapters[0].items[0].heading).toBe("Мы [Аня|Анна]");
    const model = editorModel(bundle.book, bundle.questions, bundle.chapters, []);
    const editorOrder = groupByChapter(model.questions, model.chapters)
      .filter((g) => g.items.some(({ q: x }) => x.answer.trim()))
      .map((g) => g.key);
    expect(editorOrder).toEqual(content.chapters.map((ch) => ch.key));
  });

  it("SQL-прогресс (фильтры CRM, дашборд, воронка, письма) = progressOf и countWords: подарок, автобиография, своя книга", async () => {
    const tricky = ["  раз два\nтри  ", "\n\n", " ", "слово\t\tслово", "emoji 😀 тест", "a b　c", ""];
    const gift = await newBook("love", { recipientName: "Марат" });
    const giftRows = await queries.questions(gift.id);
    for (const [i, r] of giftRows.slice(0, 40).entries()) await sections.edit(gift.id, viewer, r.id, { answer: tricky[i % tricky.length] || `ответ ${i}` });
    const auto = await newBook("autobiography");
    const autoRows = await queries.questions(auto.id);
    for (const r of autoRows.slice(0, 3)) await sections.edit(auto.id, viewer, r.id, { answer: tricky[0] });
    const blank = await newBook("blank");
    const [bs] = await queries.questions(blank.id);
    await sections.edit(blank.id, viewer, bs.id, { answer: `${"слово ".repeat(1499)} последнее` });
    const empty = await newBook("blank");

    for (const book of [gift, auto, blank, empty]) {
      const rows = await queries.questions(book.id);
      const js = { answered: rows.filter((r) => r.answer.trim()).length, total: rows.length, words: rows.reduce((s, r) => s + countWords(r.answer), 0) };
      const p = progressOf(bookKind(book.theme), js);
      const theme = sql`b.theme`;
      const cols = { answered: answeredSql(book.id), total: totalSql(book.id), words: wordsSql(book.id) };
      const [row] = await q<{ answered: number; total: number; words: number; ready: boolean; half: boolean; text_step: boolean }>(sql`
        select ${cols.answered} as answered, ${cols.total} as total, ${cols.words} as words,
          ${readySql({ theme, ...cols })} as ready, ${halfSql({ theme, ...cols })} as half, ${textStepSql({ theme, ...cols })} as text_step
        from books b where b.id = ${book.id}`);
      expect([book.theme, row]).toEqual([book.theme, { ...js, ready: p.ready, half: p.half, text_step: p.textStepDone }]);
    }
    // Пороги своей книги — по словам: 1500 слов — половина, но ещё не «почти готова».
    expect(progressOf("blank", { answered: 1, total: 1, words: 1500 })).toMatchObject({ half: true, ready: false, textStepDone: true });

    // Те же фрагменты в запросах CRM, воронки и автописем: запросы выполняются и считают по виду книги.
    expect(await sqlBookProgress.progress(blank.id)).toEqual({ theme: "blank", answered: 1, total: 1, words: 1500 });
    const ready = await bookList("ready", { q: tag, staleDays: 7, now: Date.now() });
    expect(ready.map((r) => r.book.id)).toEqual([gift.id]);
    // 40 ответов, из них 12 — одни пробелы и переводы строк: 28 с текстом — «почти готова» (порог 25).
    expect(ready[0]).toMatchObject({ answered: 28, total: giftRows.length });
    const mine = (await queries.userBooks(viewer.userId)).find((r) => r.book.id === blank.id);
    expect(mine).toMatchObject({ answered: 1, total: 1, words: 1500 });
    const drafts = (await new DrizzleLifecycleSource().draftCandidates(new Date(Date.now() + 60_000))).filter((d) => d.recipient.id === viewer.userId);
    expect(drafts.find((d) => d.book.bookId === blank.id)?.book).toMatchObject({ theme: "blank", answered: 1, words: 1500 });
    await dashboard(7, viewer.userId);
  });
});
