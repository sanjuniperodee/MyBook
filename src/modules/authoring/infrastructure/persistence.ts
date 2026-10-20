import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { bookChapters, bookLetters, bookQuestions, books, photos } from "@/shared/infrastructure/db/schema";
import { wordsSql } from "@/shared/infrastructure/db/bookProgress";
import { executor } from "@/shared/infrastructure/database";
import {
  Book,
  CUSTOM_QUESTION,
  Letter,
  Photo,
  Question,
  type BookRepository,
  type ChapterRepository,
  type ChapterSeed,
  type LetterRepository,
  type Outline,
  type PhotoRepository,
  type QuestionRepository,
  type QuestionTemplate,
  type SectionOrder,
} from "../domain";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/** Массив строк PostgreSQL одним параметром: каждый элемент в кавычках, кавычки и «\» экранированы. */
const pgTextArray = (values: readonly string[]) => `{${values.map((v) => `"${v.replace(/["\\]/g, "\\$&")}"`).join(",")}}`;

/**
 * Место нового раздела «в конец главы»: перенумерация (по главам, потом по месту) ставит его последним в своей главе
 * и сразу выравнивает позиции — значение живёт только внутри транзакции.
 */
const END_OF_CHAPTER = 2_000_000_000;

const bookToDomain = (r: typeof books.$inferSelect) => {
  const { id, updatedAt: _u, ...props } = r;
  void _u;
  return Book.restore(id, props);
};

export class DrizzleBookRepository implements BookRepository {
  nextId() {
    return randomUUID();
  }
  async findById(id: string, opts: { lock?: boolean } = {}) {
    if (!isUuid(id)) return null;
    const q = executor().select().from(books).where(eq(books.id, id)).limit(1);
    // «no key update»: правки книги идут по очереди (и с заказом — lockForOrder), но вставки со ссылкой на книгу
    // (фото, письма, заказ) не ждут, пока закончится автосохранение или перестановка глав.
    const [r] = opts.lock ? await q.for("no key update") : await q;
    return r ? bookToDomain(r) : null;
  }
  async findByInviteToken(token: string) {
    const [r] = await executor().select().from(books).where(eq(books.inviteToken, token)).limit(1);
    return r ? bookToDomain(r) : null;
  }
  async add(book: Book, questions: readonly QuestionTemplate[], chapters: readonly ChapterSeed[] = []) {
    const { id, ...props } = book.snapshot();
    await executor().insert(books).values({ id, ...props });
    if (chapters.length) await executor().insert(bookChapters).values(chapters.map((c, position) => ({ bookId: id, key: c.key, position, title: c.title, epigraph: c.epigraph })));
    if (questions.length)
      await executor()
        .insert(bookQuestions)
        .values(questions.map((q, position) => ({ bookId: id, position, chapter: q.chapter, questionKey: q.key, prompt: q.prompt, title: q.title, hint: q.hint })));
  }
  async save(book: Book) {
    const { id, createdAt: _c, userId: _u, ...props } = book.snapshot();
    void _c;
    void _u;
    await executor().update(books).set({ ...props, updatedAt: new Date() }).where(eq(books.id, id));
  }
  async touch(bookId: string) {
    await executor().update(books).set({ updatedAt: new Date() }).where(eq(books.id, bookId));
  }
  async delete(bookId: string) {
    await executor().delete(books).where(eq(books.id, bookId));
  }
  async lockForOrder(bookId: string) {
    const rows = await executor().update(books).set({ status: "ordered" }).where(and(eq(books.id, bookId), eq(books.status, "draft"))).returning({ id: books.id });
    return rows.length > 0;
  }
  async setStatus(bookId: string, status: "draft" | "ordered") {
    await executor().update(books).set({ status }).where(eq(books.id, bookId));
  }
}

export class DrizzleQuestionRepository implements QuestionRepository {
  async findInBook(bookId: string, questionId: string) {
    if (!isUuid(questionId)) return null;
    const [r] = await executor()
      .select({ q: bookQuestions, userId: books.userId })
      .from(bookQuestions)
      .innerJoin(books, eq(books.id, bookQuestions.bookId))
      .where(and(eq(bookQuestions.id, questionId), eq(bookQuestions.bookId, bookId)))
      .limit(1);
    if (!r) return null;
    const q = r.q;
    return Question.restore(q.id, { bookId: q.bookId, userId: r.userId, position: q.position, chapter: q.chapter, key: q.questionKey, prompt: q.prompt, title: q.title, hint: q.hint, answer: q.answer, displayText: q.displayText, hideHeading: q.hideHeading, pageBreak: q.pageBreak, media: q.media });
  }
  async count(bookId: string) {
    const [{ n }] = await executor().select({ n: sql<number>`count(*)::int` }).from(bookQuestions).where(eq(bookQuestions.bookId, bookId));
    return n;
  }
  async insertAfter(after: Question, prompt: string) {
    await this.shiftAfter(after);
    const [q] = await executor()
      .insert(bookQuestions)
      .values({ bookId: after.bookId, position: after.position + 1, chapter: after.chapter, questionKey: CUSTOM_QUESTION, prompt, title: prompt })
      .returning({ id: bookQuestions.id });
    await this.renumber(after.bookId, "bank");
    return q.id;
  }
  async insertSection(bookId: string, chapter: string, after: Question | null, texts: { title: string; prompt: string }) {
    if (after) await this.shiftAfter(after);
    const [q] = await executor()
      .insert(bookQuestions)
      .values({ bookId, position: after ? after.position + 1 : END_OF_CHAPTER, chapter, questionKey: CUSTOM_QUESTION, prompt: texts.prompt, title: texts.title })
      .returning({ id: bookQuestions.id });
    return q.id;
  }
  /** Освободить место сразу после вопроса: следующие сдвигаются на одну позицию. */
  private async shiftAfter(after: Question) {
    await executor()
      .update(bookQuestions)
      .set({ position: sql`${bookQuestions.position} + 1` })
      .where(and(eq(bookQuestions.bookId, after.bookId), gt(bookQuestions.position, after.position)));
  }
  async sections(bookId: string) {
    return executor().select({ id: bookQuestions.id, chapter: bookQuestions.chapter, position: bookQuestions.position }).from(bookQuestions).where(eq(bookQuestions.bookId, bookId)).orderBy(asc(bookQuestions.position));
  }
  async arrange(bookId: string, order: readonly { id: string; chapter: string }[]) {
    if (!order.length) return;
    await executor().execute(sql`
      update ${bookQuestions} q set chapter = s.chapter, position = (s.ord - 1)::int, updated_at = now()
      from unnest(${pgTextArray(order.map((s) => s.id))}::uuid[], ${pgTextArray(order.map((s) => s.chapter))}::text[]) with ordinality as s(id, chapter, ord)
      where q.book_id = ${bookId} and q.id = s.id`);
  }
  /**
   * Позиции 0..N-1 одним запросом. Своя книга — по главам в их порядке, внутри главы — по месту; разделы, чья глава
   * пропала (сбой, ручная правка), — в конце, каждой главой подряд (их соберёт глава «Без названия»).
   */
  async renumber(bookId: string, order: SectionOrder) {
    if (order === "outline")
      await executor().execute(sql`
        update ${bookQuestions} q set position = s.rn
        from (
          select q2.id, (row_number() over (order by c.position nulls last, q2.chapter, q2.position, q2.created_at, q2.id) - 1)::int as rn
          from ${bookQuestions} q2 left join ${bookChapters} c on c.book_id = q2.book_id and c.key = q2.chapter
          where q2.book_id = ${bookId}
        ) s
        where q.id = s.id and q.position <> s.rn`);
    else
      await executor().execute(sql`
        update ${bookQuestions} q set position = s.rn
        from (select id, (row_number() over (order by position, created_at, id) - 1)::int as rn from ${bookQuestions} where book_id = ${bookId}) s
        where q.id = s.id and q.position <> s.rn`);
  }
  async save(q: Question) {
    const s = q.snapshot();
    await executor().update(bookQuestions).set({ answer: s.answer, media: s.media, displayText: s.displayText, hideHeading: s.hideHeading, pageBreak: s.pageBreak ?? false, prompt: s.prompt, title: s.title, updatedAt: new Date() }).where(eq(bookQuestions.id, q.id));
  }
  async deleteCustom(bookId: string, questionId: string) {
    if (!isUuid(questionId)) return false;
    const rows = await executor()
      .delete(bookQuestions)
      .where(and(eq(bookQuestions.id, questionId), eq(bookQuestions.bookId, bookId), eq(bookQuestions.questionKey, CUSTOM_QUESTION)))
      .returning({ id: bookQuestions.id });
    return rows.length > 0;
  }
  async deleteChapter(bookId: string, chapter: string) {
    const rows = await executor()
      .delete(bookQuestions)
      .where(and(eq(bookQuestions.bookId, bookId), eq(bookQuestions.chapter, chapter)))
      .returning({ id: bookQuestions.id, answer: bookQuestions.answer });
    return { ids: rows.map((r) => r.id), hadText: rows.some((r) => !!r.answer.trim()) };
  }
  async idsInChapter(bookId: string, chapter: string) {
    const rows = await executor()
      .select({ id: bookQuestions.id })
      .from(bookQuestions)
      .where(and(eq(bookQuestions.bookId, bookId), eq(bookQuestions.chapter, chapter)));
    return rows.map((r) => r.id);
  }
  async wordsInBook(bookId: string) {
    const { rows } = await executor().execute<{ n: number }>(sql`select ${wordsSql(bookId)} as n`);
    return Number(rows[0]?.n ?? 0);
  }
  async replaceTemplates(bookId: string, byKey: ReadonlyMap<string, { prompt: string; title: string; hint: string | null }>) {
    const qs = await executor().select({ id: bookQuestions.id, key: bookQuestions.questionKey }).from(bookQuestions).where(eq(bookQuestions.bookId, bookId));
    for (const q of qs) {
      const t = q.key ? byKey.get(q.key) : undefined;
      if (t) await executor().update(bookQuestions).set(t).where(eq(bookQuestions.id, q.id));
    }
  }
}

/** Главы своей книги — book_chapters. */
export class DrizzleChapterRepository implements ChapterRepository {
  async list(bookId: string) {
    return executor()
      .select({ key: bookChapters.key, title: bookChapters.title, epigraph: bookChapters.epigraph, position: bookChapters.position })
      .from(bookChapters)
      .where(eq(bookChapters.bookId, bookId))
      .orderBy(asc(bookChapters.position), asc(bookChapters.createdAt));
  }
  async add(bookId: string, c: ChapterSeed & { position: number }) {
    await executor().insert(bookChapters).values({ bookId, key: c.key, position: c.position, title: c.title, epigraph: c.epigraph });
  }
  async update(bookId: string, key: string, patch: { title?: string; epigraph?: string }) {
    const where = and(eq(bookChapters.bookId, bookId), eq(bookChapters.key, key));
    if (patch.title === undefined && patch.epigraph === undefined) return (await executor().select({ id: bookChapters.id }).from(bookChapters).where(where).limit(1)).length > 0;
    const rows = await executor()
      .update(bookChapters)
      .set({ ...patch, updatedAt: new Date() })
      .where(where)
      .returning({ id: bookChapters.id });
    return rows.length > 0;
  }
  async delete(bookId: string, key: string) {
    const rows = await executor()
      .delete(bookChapters)
      .where(and(eq(bookChapters.bookId, bookId), eq(bookChapters.key, key)))
      .returning({ id: bookChapters.id });
    return rows.length > 0;
  }
  async setOrder(bookId: string, keys: readonly string[]) {
    if (!keys.length) return;
    await executor().execute(sql`
      update ${bookChapters} c set position = (s.ord - 1)::int
      from unnest(${pgTextArray(keys)}::text[]) with ordinality as s(key, ord)
      where c.book_id = ${bookId} and c.key = s.key and c.position <> (s.ord - 1)::int`);
  }
  async retitle(bookId: string, from: string, to: string) {
    await executor()
      .update(bookChapters)
      .set({ title: to, updatedAt: new Date() })
      .where(and(eq(bookChapters.bookId, bookId), eq(bookChapters.title, from)));
  }
  async outline(bookId: string): Promise<Outline> {
    const [chapters, sections] = await Promise.all([
      this.list(bookId),
      executor().select({ id: bookQuestions.id, chapter: bookQuestions.chapter, position: bookQuestions.position }).from(bookQuestions).where(eq(bookQuestions.bookId, bookId)).orderBy(asc(bookQuestions.position)),
    ]);
    return { chapters, sections };
  }
}

const photoToDomain = (r: typeof photos.$inferSelect) =>
  Photo.restore(r.id, { bookId: r.bookId, position: r.position, storageKey: r.storageKey, thumbKey: r.thumbKey, width: r.width, height: r.height, caption: r.caption, layout: r.layout, questionId: r.questionId, inline: r.inline, crop: r.crop ?? null, chapter: r.chapter ?? null, opener: r.opener ?? false });

export class DrizzlePhotoRepository implements PhotoRepository {
  async findInBook(bookId: string, photoId: string) {
    if (!isUuid(photoId)) return null;
    const [r] = await executor().select().from(photos).where(and(eq(photos.id, photoId), eq(photos.bookId, bookId))).limit(1);
    return r ? photoToDomain(r) : null;
  }
  async stats(bookId: string) {
    const [r] = await executor()
      .select({ count: sql<number>`count(*)::int`, maxPosition: sql<number>`coalesce(max(${photos.position}), -1)::int` })
      .from(photos)
      .where(eq(photos.bookId, bookId));
    return r;
  }
  async belongToBook(bookId: string, ids: string[]) {
    if (!ids.length) return true;
    const rows = await executor().select({ id: photos.id }).from(photos).where(and(eq(photos.bookId, bookId), inArray(photos.id, ids)));
    return rows.length === ids.length;
  }
  async add(photo: Photo) {
    const { id, ...p } = photo.snapshot();
    await executor().insert(photos).values({ id, ...p });
  }
  async save(photo: Photo) {
    const { id, bookId: _b, ...p } = photo.snapshot();
    void _b;
    await executor().update(photos).set({ ...p, updatedAt: new Date() }).where(eq(photos.id, id));
  }
  async delete(photo: Photo) {
    await executor().delete(photos).where(eq(photos.id, photo.id));
  }
  async reorder(_bookId: string, ids: string[]) {
    for (let i = 0; i < ids.length; i++) await executor().update(photos).set({ position: i }).where(eq(photos.id, ids[i]));
  }
  async clearOpeners(bookId: string, chapter: string, exceptId: string) {
    await executor()
      .update(photos)
      .set({ opener: false, updatedAt: new Date() })
      .where(and(eq(photos.bookId, bookId), eq(photos.chapter, chapter), eq(photos.opener, true), ne(photos.id, exceptId)));
  }
  async detachFromQuestions(bookId: string, questionIds: readonly string[]) {
    if (!questionIds.length) return;
    await executor()
      .update(photos)
      .set({ questionId: null, inline: null, updatedAt: new Date() })
      .where(and(eq(photos.bookId, bookId), inArray(photos.questionId, [...questionIds])));
  }
}

export class DrizzleLetterRepository implements LetterRepository {
  async findInBook(bookId: string, letterId: string) {
    if (!isUuid(letterId)) return null;
    const [r] = await executor().select().from(bookLetters).where(and(eq(bookLetters.id, letterId), eq(bookLetters.bookId, bookId))).limit(1);
    return r ? Letter.restore(r.id, { bookId: r.bookId, authorName: r.authorName, relation: r.relation, text: r.text, status: r.status }) : null;
  }
  async count(bookId: string) {
    const [{ n }] = await executor().select({ n: sql<number>`count(*)::int` }).from(bookLetters).where(eq(bookLetters.bookId, bookId));
    return n;
  }
  async add(letter: Letter) {
    const { id, ...p } = letter.snapshot();
    await executor().insert(bookLetters).values({ id, ...p });
  }
  async save(letter: Letter) {
    const { id, bookId: _b, ...p } = letter.snapshot();
    void _b;
    await executor().update(bookLetters).set({ ...p, updatedAt: new Date() }).where(eq(bookLetters.id, id));
  }
  async delete(bookId: string, letterId: string) {
    if (!isUuid(letterId)) return false;
    const rows = await executor().delete(bookLetters).where(and(eq(bookLetters.id, letterId), eq(bookLetters.bookId, bookId))).returning({ id: bookLetters.id });
    return rows.length > 0;
  }
}
