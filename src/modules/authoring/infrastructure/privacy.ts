import "server-only";
import { eq, getTableColumns, sql } from "drizzle-orm";
import { answerFiles, bookChapters, bookLetters, bookQuestions, books, designAiRequests, photos } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { deletePrefix } from "@/shared/infrastructure/storage";

/** Файлы книги в хранилище: фото, свои видео и аудио, картинки обложки, кэш предпросмотра и полос. */
const bookFilePrefixes = (bookId: string) => [`photos/${bookId}`, `answer-media/${bookId}`, `cover-images/${bookId}`, `cache/preview/${bookId}`, `cache/pages/${bookId}`];

/**
 * Колонки книги, которые остаются у пустой книги заказа: связь с владельцем и заказом, вид книги и служебные ревизии
 * вёрстки. Всё остальное (название, имена, посвящение, обложка, оборот, настройки) возвращается к значениям по
 * умолчанию — так новая колонка с личными данными стирается сама, без правки этого списка.
 */
const KEEP = new Set<string>(["id", "userId", "theme", "status", "format", "layoutRev", "paginationRev", "createdAt", "updatedAt"]);

const resetBookColumns = () => {
  const set: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(getTableColumns(books))) {
    if (KEEP.has(key)) continue;
    if (col.hasDefault) set[key] = sql`DEFAULT`;
    else if (!col.notNull) set[key] = null;
  }
  return set;
};

/**
 * Персональные данные клиента в контексте «Книга» (удаление аккаунта). Книгу без заказов удаляем целиком, книгу
 * заказа — опустошаем: строка нужна заказу (orders.book_id RESTRICT), но в ней не остаётся ни текста, ни фото.
 */
export const authoringPrivacy = {
  async booksOf(userId: string): Promise<string[]> {
    const rows = await executor().select({ id: books.id }).from(books).where(eq(books.userId, userId));
    return rows.map((r) => r.id);
  },

  /** Книга без заказов: строка и всё, что к ней привязано (вопросы, фото, письма — каскадом), и файлы. */
  async deleteBook(bookId: string) {
    await executor().delete(books).where(eq(books.id, bookId));
    for (const p of bookFilePrefixes(bookId)) await deletePrefix(p);
  },

  /** Книга заказа: ответы, главы, фото, письма близких и свои файлы удаляются, поля книги — к значениям по умолчанию. */
  async emptyBook(bookId: string) {
    const db = executor();
    await db.delete(answerFiles).where(eq(answerFiles.bookId, bookId));
    await db.delete(photos).where(eq(photos.bookId, bookId));
    await db.delete(bookLetters).where(eq(bookLetters.bookId, bookId));
    await db.delete(bookQuestions).where(eq(bookQuestions.bookId, bookId));
    await db.delete(bookChapters).where(eq(bookChapters.bookId, bookId));
    await db.update(books).set(resetBookColumns()).where(eq(books.id, bookId));
    for (const p of bookFilePrefixes(bookId)) await deletePrefix(p);
  },

  /**
   * Запросы к ИИ-дизайнеру (тексты запросов). Покупки пакетов остаются в учёте. Свои видео и аудио к ответам уходят
   * вместе с книгой — у книги заказа в работе они нужны до доставки (QR в напечатанной книге).
   */
  async forgetUser(userId: string) {
    await executor().delete(designAiRequests).where(eq(designAiRequests.userId, userId));
  },
};
