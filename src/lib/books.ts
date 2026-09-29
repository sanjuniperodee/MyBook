import "server-only";
import { cache } from "react";
import { and, asc, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "./db";
import { bookQuestions, books, photos, type Book, type Gender, type User } from "./db/schema";
import { getTheme } from "./content/themes";
import type { ThemeId } from "./content/types";
import { buildBookContent, estimatePages, toPhotoItem } from "./book/layout";
import { printablePageCount } from "./book/formats";

export interface NewBookInput {
  theme: ThemeId;
  authorName: string;
  authorGender: Gender;
  recipientName: string;
  recipientGender: Gender;
  title?: string;
}

export async function createBook(userId: string, input: NewBookInput): Promise<Book> {
  const theme = getTheme(input.theme);
  return db.transaction(async (tx) => {
    const [book] = await tx
      .insert(books)
      .values({
        userId,
        theme: theme.id,
        authorName: input.authorName,
        authorGender: input.authorGender,
        recipientName: input.recipientName,
        recipientGender: theme.recipientGender ?? input.recipientGender,
        title: input.title?.trim() || theme.titleSuggestions[0],
        coverTemplate: theme.defaultCover,
      })
      .returning();
    let position = 0;
    const rows = theme.chapters.flatMap((ch) =>
      ch.questions.map(([prompt, title, hint], i) => ({
        bookId: book.id,
        position: position++,
        chapter: ch.key,
        questionKey: `${theme.id}.${ch.key}.${i + 1}`,
        prompt,
        title,
        hint: hint ?? null,
      })),
    );
    await tx.insert(bookQuestions).values(rows);
    return book;
  });
}

/** Книга текущего пользователя (или любая — для администратора). Кэшируется в пределах запроса. */
export const getAccessibleBook = cache(async (bookId: string, user: User): Promise<Book> => {
  if (!/^[0-9a-f-]{36}$/i.test(bookId)) notFound();
  const book = await db.query.books.findFirst({ where: eq(books.id, bookId) });
  if (!book || (book.userId !== user.id && user.role !== "admin")) notFound();
  return book;
});

export async function findAccessibleBook(bookId: string, user: User): Promise<Book | null> {
  if (!/^[0-9a-f-]{36}$/i.test(bookId)) return null;
  const book = await db.query.books.findFirst({ where: eq(books.id, bookId) });
  if (!book || (book.userId !== user.id && user.role !== "admin")) return null;
  return book;
}

export async function getBookQuestions(bookId: string) {
  return db.select().from(bookQuestions).where(eq(bookQuestions.bookId, bookId)).orderBy(asc(bookQuestions.position));
}

export async function getBookPhotos(bookId: string) {
  return db.select().from(photos).where(eq(photos.bookId, bookId)).orderBy(asc(photos.position));
}

export interface BookStats {
  answered: number;
  total: number;
  photos: number;
  words: number;
  estimatedPages: number;
  printedPages: number;
}

export async function getBookStats(book: Book): Promise<BookStats> {
  const [qs, ps] = await Promise.all([getBookQuestions(book.id), getBookPhotos(book.id)]);
  const content = buildBookContent(book, qs, ps.map(toPhotoItem));
  const answered = qs.filter((q) => q.answer.trim()).length;
  const words = qs.reduce((s, q) => s + (q.answer.trim() ? q.answer.trim().split(/\s+/).length : 0), 0);
  const estimatedPages = estimatePages(content);
  return {
    answered,
    total: qs.length,
    photos: ps.length,
    words,
    estimatedPages,
    printedPages: printablePageCount(estimatedPages),
  };
}

export async function listUserBooks(userId: string) {
  return db
    .select({
      book: books,
      answered: sql<number>`(select count(*)::int from ${bookQuestions} q where q.book_id = ${books.id} and length(trim(q.answer)) > 0)`,
      total: sql<number>`(select count(*)::int from ${bookQuestions} q where q.book_id = ${books.id})`,
      photos: sql<number>`(select count(*)::int from ${photos} p where p.book_id = ${books.id})`,
    })
    .from(books)
    .where(eq(books.userId, userId))
    .orderBy(sql`${books.updatedAt} desc`);
}

export function isEditable(book: Book) {
  return book.status === "draft";
}

export async function touchBook(bookId: string) {
  await db.update(books).set({ updatedAt: new Date() }).where(eq(books.id, bookId));
}

/** Перенумеровывает позиции вопросов книги по порядку. */
export async function renumberQuestions(bookId: string) {
  await db.execute(sql`
    update ${bookQuestions} q set position = s.rn
    from (select id, row_number() over (order by position, created_at) - 1 as rn from ${bookQuestions} where book_id = ${bookId}) s
    where q.id = s.id`);
}

export async function ownedQuestion(bookId: string, questionId: string) {
  const [q] = await db
    .select()
    .from(bookQuestions)
    .where(and(eq(bookQuestions.id, questionId), eq(bookQuestions.bookId, bookId)))
    .limit(1);
  return q ?? null;
}

/** Первая глава книги, в которой есть вопрос без ответа (для кнопки «продолжить»). */
export function firstUnansweredIndex(qs: { answer: string }[]) {
  const i = qs.findIndex((q) => !q.answer.trim());
  return i === -1 ? 0 : i;
}
