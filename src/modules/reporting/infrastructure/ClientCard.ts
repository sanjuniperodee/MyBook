import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { bookLetters, bookQuestions, books, crmDeals, crmNotes, crmStages, crmTasks, orders, photos, users } from "@/lib/db/schema";
import { booksId } from "@/lib/db/refs";
import { executor } from "@/shared/infrastructure/database";

export async function clientById(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [u] = await executor().select().from(users).where(eq(users.id, id)).limit(1);
  return u ?? null;
}

/** Карточка клиента: книги с прогрессом, заказы, задачи, лента, сделки. */
export async function clientCard(id: string, sections: { deals: boolean }) {
  const db = executor();
  const [bookRows, orderRows, taskRows, noteRows, dealRows] = await Promise.all([
    db
      .select({
        book: books,
        answered: sql<number>`(select count(*)::int from ${bookQuestions} q where q.book_id = ${booksId} and length(trim(q.answer)) > 0)`,
        total: sql<number>`(select count(*)::int from ${bookQuestions} q where q.book_id = ${booksId})`,
        photos: sql<number>`(select count(*)::int from ${photos} p where p.book_id = ${booksId})`,
        letters: sql<number>`(select count(*)::int from ${bookLetters} l where l.book_id = ${booksId})`,
      })
      .from(books)
      .where(eq(books.userId, id))
      .orderBy(desc(books.updatedAt)),
    db.select().from(orders).where(eq(orders.userId, id)).orderBy(desc(orders.createdAt)),
    db.select().from(crmTasks).where(eq(crmTasks.clientId, id)).orderBy(sql`${crmTasks.doneAt} nulls first`, asc(crmTasks.dueAt)),
    db.select().from(crmNotes).where(eq(crmNotes.clientId, id)).orderBy(desc(crmNotes.createdAt)).limit(100),
    sections.deals
      ? db
          .select({ deal: crmDeals, stage: crmStages })
          .from(crmDeals)
          .innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId))
          .where(eq(crmDeals.clientId, id))
          .orderBy(desc(crmDeals.createdAt))
          .limit(20)
      : Promise.resolve([]),
  ]);
  return { bookRows, orderRows, taskRows, noteRows, dealRows };
}
