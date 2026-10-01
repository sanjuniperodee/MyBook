import "server-only";
import { and, eq } from "drizzle-orm";
import { books } from "@/lib/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { getBookPhotos, getBookStats } from "@/lib/books";
import { checkReadiness } from "@/lib/readiness";
import type { BookGateway } from "../../application/ports";

/**
 * Антикоррупционный слой к контексту книг: заказу нужны только статус, готовность и блокировка.
 * Запросы идут через executor() — внутри транзакции оформления заказа.
 */
export class AuthoringBookGateway implements BookGateway {
  async checkoutInfo(bookId: string, userId: string, locale: "ru" | "kk") {
    const [book] = await executor().select().from(books).where(and(eq(books.id, bookId), eq(books.userId, userId))).limit(1);
    if (!book) return null;
    const [stats, photos] = await Promise.all([getBookStats(book), getBookPhotos(book.id)]);
    const blocking = checkReadiness(book, stats, photos, locale).find((i) => i.level === "error");
    return { status: book.status, blockingIssue: blocking?.text ?? null, estimatedPages: stats.printedPages };
  }

  async lockForOrder(bookId: string) {
    const rows = await executor()
      .update(books)
      .set({ status: "ordered" })
      .where(and(eq(books.id, bookId), eq(books.status, "draft")))
      .returning({ id: books.id });
    return rows.length > 0;
  }

  async unlock(bookId: string) {
    await executor().update(books).set({ status: "draft" }).where(eq(books.id, bookId));
  }

  async toggleEditing(bookId: string) {
    const [book] = await executor().select({ status: books.status }).from(books).where(eq(books.id, bookId)).limit(1);
    const next = book?.status === "draft" ? "ordered" : "draft";
    await executor().update(books).set({ status: next }).where(eq(books.id, bookId));
    return next;
  }
}
