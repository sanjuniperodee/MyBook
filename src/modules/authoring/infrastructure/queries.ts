import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { bookChapters, bookLetters, bookQuestions, books, photos } from "@/shared/infrastructure/db/schema";
import { booksId } from "@/shared/infrastructure/db/refs";
import { answeredSql, totalSql, wordsSql } from "@/shared/infrastructure/db/bookProgress";
import { rootDb } from "@/shared/infrastructure/database";
import { computeStats, isBookVisibleTo, type BookViewer } from "../domain";

export type BookRow = typeof books.$inferSelect;
export type QuestionRow = typeof bookQuestions.$inferSelect;
export type PhotoRow = typeof photos.$inferSelect;
export type LetterRow = typeof bookLetters.$inferSelect;
export type ChapterRow = typeof bookChapters.$inferSelect;
export interface BookBundle {
  book: BookRow;
  questions: QuestionRow[];
  /** Главы своей книги по порядку (у книг с банком — пусто): названия, эпиграфы и порядок глав в печати. */
  chapters: ChapterRow[];
  photos: PhotoRow[];
  letters: LetterRow[];
}

/** Read-модели книг для страниц редактора, кабинета, PDF и CRM. */
export class DrizzleAuthoringQueries {
  async book(bookId: string): Promise<BookRow | null> {
    if (!/^[0-9a-f-]{36}$/i.test(bookId)) return null;
    return (await rootDb.query.books.findFirst({ where: eq(books.id, bookId) })) ?? null;
  }

  /** Книга, видимая пользователю (isBookVisibleTo): своя или любая для сотрудника. */
  async visibleBook(bookId: string, viewer: BookViewer): Promise<BookRow | null> {
    const b = await this.book(bookId);
    return b && isBookVisibleTo(b.userId, viewer) ? b : null;
  }

  bookByInviteToken(token: string) {
    return rootDb.query.books.findFirst({ where: eq(books.inviteToken, token) });
  }

  questions(bookId: string) {
    return rootDb.select().from(bookQuestions).where(eq(bookQuestions.bookId, bookId)).orderBy(asc(bookQuestions.position));
  }

  /** Главы своей книги по порядку (у книг с банком строк нет). */
  chapters(bookId: string) {
    return rootDb.select().from(bookChapters).where(eq(bookChapters.bookId, bookId)).orderBy(asc(bookChapters.position), asc(bookChapters.createdAt));
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
    const [qs, chapters, ps, ls] = await Promise.all([this.questions(book.id), this.chapters(book.id), this.photos(book.id), this.approvedLetters(book.id)]);
    return computeStats(book, qs, chapters, ps, ls);
  }

  /** Всё для рендера PDF и экспорта текста. */
  async bundle(bookId: string): Promise<BookBundle | null> {
    const book = await this.book(bookId);
    if (!book) return null;
    const [questions, chapters, ps, letters] = await Promise.all([this.questions(bookId), this.chapters(bookId), this.photos(bookId), this.approvedLetters(bookId)]);
    return { book, questions, chapters, photos: ps, letters };
  }

  /** Книги пользователя: ответы (разделы с текстом), всего вопросов (у своей книги — разделов), слова — для progressOf. */
  userBooks(userId: string) {
    return rootDb
      .select({
        book: books,
        answered: answeredSql(booksId),
        total: totalSql(booksId),
        words: wordsSql(booksId),
        photos: sql<number>`(select count(*)::int from ${photos} p where p.book_id = ${booksId})`,
      })
      .from(books)
      .where(eq(books.userId, userId))
      .orderBy(desc(books.updatedAt));
  }

  /** Книга фото — чтобы решить доступ сотрудника «только свои» до отдачи файла. */
  async photoBookId(photoId: string): Promise<string | null> {
    if (!/^[0-9a-f-]{36}$/i.test(photoId)) return null;
    const [row] = await rootDb.select({ bookId: photos.bookId }).from(photos).where(eq(photos.id, photoId));
    return row?.bookId ?? null;
  }

  /** Фото и владелец книги — для отдачи файла с проверкой доступа. */
  async photoFor(photoId: string, viewer: BookViewer) {
    if (!/^[0-9a-f-]{36}$/i.test(photoId)) return null;
    const [row] = await rootDb.select({ photo: photos, ownerId: books.userId }).from(photos).innerJoin(books, eq(photos.bookId, books.id)).where(eq(photos.id, photoId));
    return row && isBookVisibleTo(row.ownerId, viewer) ? row.photo : null;
  }
}
