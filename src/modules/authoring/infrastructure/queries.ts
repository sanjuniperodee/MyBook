import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { bookLetters, bookQuestions, books, photos } from "@/shared/infrastructure/db/schema";
import { booksId } from "@/shared/infrastructure/db/refs";
import { rootDb } from "@/shared/infrastructure/database";
import { computeStats, type BookViewer } from "../domain";

export type BookRow = typeof books.$inferSelect;
export type QuestionRow = typeof bookQuestions.$inferSelect;
export type PhotoRow = typeof photos.$inferSelect;
export type LetterRow = typeof bookLetters.$inferSelect;
export interface BookBundle {
  book: BookRow;
  questions: QuestionRow[];
  photos: PhotoRow[];
  letters: LetterRow[];
}

/** Read-модели книг для страниц редактора, кабинета, PDF и CRM. */
export class DrizzleAuthoringQueries {
  async book(bookId: string): Promise<BookRow | null> {
    if (!/^[0-9a-f-]{36}$/i.test(bookId)) return null;
    return (await rootDb.query.books.findFirst({ where: eq(books.id, bookId) })) ?? null;
  }

  /** Книга, видимая пользователю: своя или любая для сотрудника. */
  async visibleBook(bookId: string, viewer: BookViewer): Promise<BookRow | null> {
    const b = await this.book(bookId);
    return b && (viewer.isStaff || b.userId === viewer.userId) ? b : null;
  }

  bookByInviteToken(token: string) {
    return rootDb.query.books.findFirst({ where: eq(books.inviteToken, token) });
  }

  questions(bookId: string) {
    return rootDb.select().from(bookQuestions).where(eq(bookQuestions.bookId, bookId)).orderBy(asc(bookQuestions.position));
  }

  photos(bookId: string) {
    return rootDb.select().from(photos).where(eq(photos.bookId, bookId)).orderBy(asc(photos.position));
  }

  letters(bookId: string) {
    return rootDb.select().from(bookLetters).where(eq(bookLetters.bookId, bookId)).orderBy(asc(bookLetters.createdAt));
  }

  approvedLetters(bookId: string) {
    return rootDb.select().from(bookLetters).where(and(eq(bookLetters.bookId, bookId), eq(bookLetters.status, "approved"))).orderBy(asc(bookLetters.createdAt));
  }

  async stats(book: BookRow) {
    const [qs, ps, ls] = await Promise.all([this.questions(book.id), this.photos(book.id), this.approvedLetters(book.id)]);
    return computeStats(book, qs, ps, ls);
  }

  /** Всё для рендера PDF и экспорта текста. */
  async bundle(bookId: string): Promise<BookBundle | null> {
    const book = await this.book(bookId);
    if (!book) return null;
    const [questions, ps, letters] = await Promise.all([this.questions(bookId), this.photos(bookId), this.approvedLetters(bookId)]);
    return { book, questions, photos: ps, letters };
  }

  userBooks(userId: string) {
    return rootDb
      .select({
        book: books,
        answered: sql<number>`(select count(*)::int from ${bookQuestions} q where q.book_id = ${booksId} and length(trim(q.answer)) > 0)`,
        total: sql<number>`(select count(*)::int from ${bookQuestions} q where q.book_id = ${booksId})`,
        photos: sql<number>`(select count(*)::int from ${photos} p where p.book_id = ${booksId})`,
      })
      .from(books)
      .where(eq(books.userId, userId))
      .orderBy(desc(books.updatedAt));
  }

  /** Фото и владелец книги — для отдачи файла с проверкой доступа. */
  async photoFor(photoId: string, viewer: BookViewer) {
    if (!/^[0-9a-f-]{36}$/i.test(photoId)) return null;
    const [row] = await rootDb.select({ photo: photos, ownerId: books.userId }).from(photos).innerJoin(books, eq(photos.bookId, books.id)).where(eq(photos.id, photoId));
    return row && (viewer.isStaff || row.ownerId === viewer.userId) ? row.photo : null;
  }
}
