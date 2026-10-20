import "server-only";
import { and, desc, eq, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { books, orders, photos, users } from "@/shared/infrastructure/db/schema";
import { booksId } from "@/shared/infrastructure/db/refs";
import { progressCols, readySql } from "@/shared/infrastructure/db/bookProgress";
import { executor } from "@/shared/infrastructure/database";
import type { Viewer } from "./conditions";

type BookFilter = "all" | "writing" | "stalled" | "ready" | "ordered";

/**
 * Книги клиентов для CRM: пишут, забросили (дольше staleDays), почти готовы, заказаны; поиск и тема.
 * «Почти готовы» — progressOf (как хаб, воронка и автописьма): у книг с банком — ответы, у своей книги — слова.
 */
export function bookList(f: BookFilter, opts: { q?: string; theme?: string; staleDays: number; now: number; viewer: Viewer }) {
  const { answered, total, words } = progressCols(booksId);
  const staleDate = new Date(opts.now - opts.staleDays * 86_400_000);
  const w: SQL[] = [];
  if (f === "writing") w.push(eq(books.status, "draft"), sql`${books.updatedAt} >= ${staleDate}`);
  if (f === "stalled") w.push(eq(books.status, "draft"), lt(books.updatedAt, staleDate));
  if (f === "ready") w.push(eq(books.status, "draft"), readySql({ theme: books.theme, answered, total, words }));
  if (f === "ordered") w.push(eq(books.status, "ordered"));
  if (opts.theme) w.push(eq(books.theme, opts.theme));
  // Роль «только свои» — книги только своих клиентов (без неразобранных).
  if (!opts.viewer.seesAll) w.push(eq(users.managerId, opts.viewer.userId));
  if (opts.q?.trim()) {
    const s = `%${opts.q.trim()}%`;
    w.push(or(ilike(books.title, s), ilike(books.authorName, s), ilike(books.recipientName, s), ilike(users.email, s))!);
  }
  return executor()
    .select({
      book: books,
      owner: { id: users.id, email: users.email, name: users.name, remindedAt: users.remindedAt },
      answered,
      total,
      words,
      photos: sql<number>`(select count(*)::int from ${photos} p where p.book_id = ${booksId})`,
      // Есть заказ — любой, кроме отменённого, в том числе ещё не оплаченный.
      hasOrder: sql<boolean>`exists (select 1 from ${orders} o where o.book_id = ${booksId} and o.status <> 'cancelled')`,
    })
    .from(books)
    .innerJoin(users, eq(books.userId, users.id))
    .where(w.length ? and(...w) : undefined)
    .orderBy(desc(books.updatedAt))
    .limit(200);
}
