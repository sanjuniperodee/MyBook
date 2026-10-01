import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { bookLetters, bookQuestions, books, photos } from "@/lib/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { Book, Letter, Photo, Question, type BookRepository, type LetterRepository, type PhotoRepository, type QuestionRepository, type QuestionTemplate } from "../domain";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

const bookToDomain = (r: typeof books.$inferSelect) => {
  const { id, updatedAt: _u, ...props } = r;
  void _u;
  return Book.restore(id, props);
};

export class DrizzleBookRepository implements BookRepository {
  nextId() {
    return randomUUID();
  }
  async findById(id: string) {
    if (!isUuid(id)) return null;
    const [r] = await executor().select().from(books).where(eq(books.id, id)).limit(1);
    return r ? bookToDomain(r) : null;
  }
  async findByInviteToken(token: string) {
    const [r] = await executor().select().from(books).where(eq(books.inviteToken, token)).limit(1);
    return r ? bookToDomain(r) : null;
  }
  async add(book: Book, questions: readonly QuestionTemplate[]) {
    const { id, ...props } = book.snapshot();
    await executor().insert(books).values({ id, ...props });
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
    return Question.restore(q.id, { bookId: q.bookId, userId: r.userId, position: q.position, chapter: q.chapter, key: q.questionKey, prompt: q.prompt, title: q.title, hint: q.hint, answer: q.answer, displayText: q.displayText, hideHeading: q.hideHeading });
  }
  async count(bookId: string) {
    const [{ n }] = await executor().select({ n: sql<number>`count(*)::int` }).from(bookQuestions).where(eq(bookQuestions.bookId, bookId));
    return n;
  }
  async insertAfter(after: Question, prompt: string) {
    await executor()
      .update(bookQuestions)
      .set({ position: sql`${bookQuestions.position} + 1` })
      .where(and(eq(bookQuestions.bookId, after.bookId), gt(bookQuestions.position, after.position)));
    const [q] = await executor()
      .insert(bookQuestions)
      .values({ bookId: after.bookId, position: after.position + 1, chapter: after.chapter, questionKey: "custom", prompt, title: prompt })
      .returning({ id: bookQuestions.id });
    const bookId = after.bookId;
    await executor().execute(sql`
      update ${bookQuestions} q set position = s.rn
      from (select id, row_number() over (order by position, created_at) - 1 as rn from ${bookQuestions} where book_id = ${bookId}) s
      where q.id = s.id`);
    return q.id;
  }
  async save(q: Question) {
    const s = q.snapshot();
    await executor().update(bookQuestions).set({ answer: s.answer, displayText: s.displayText, hideHeading: s.hideHeading, updatedAt: new Date() }).where(eq(bookQuestions.id, q.id));
  }
  async deleteCustom(bookId: string, questionId: string) {
    if (!isUuid(questionId)) return false;
    const rows = await executor()
      .delete(bookQuestions)
      .where(and(eq(bookQuestions.id, questionId), eq(bookQuestions.bookId, bookId), eq(bookQuestions.questionKey, "custom")))
      .returning({ id: bookQuestions.id });
    return rows.length > 0;
  }
  async replaceTemplates(bookId: string, byKey: ReadonlyMap<string, { prompt: string; title: string; hint: string | null }>) {
    const qs = await executor().select({ id: bookQuestions.id, key: bookQuestions.questionKey }).from(bookQuestions).where(eq(bookQuestions.bookId, bookId));
    for (const q of qs) {
      const t = q.key ? byKey.get(q.key) : undefined;
      if (t) await executor().update(bookQuestions).set(t).where(eq(bookQuestions.id, q.id));
    }
  }
}

const photoToDomain = (r: typeof photos.$inferSelect) =>
  Photo.restore(r.id, { bookId: r.bookId, position: r.position, storageKey: r.storageKey, thumbKey: r.thumbKey, width: r.width, height: r.height, caption: r.caption, layout: r.layout, questionId: r.questionId, inline: r.inline });

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
