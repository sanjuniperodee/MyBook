import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { bookQuestions, books, crmCalls, crmConversations, crmDeals, crmNotes, crmTasks, orders, photos, users } from "@/shared/infrastructure/db/schema";
import { booksId } from "@/shared/infrastructure/db/refs";
import { executor } from "@/shared/infrastructure/database";

export async function dealById(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [deal] = await executor().select().from(crmDeals).where(eq(crmDeals.id, id)).limit(1);
  return deal ?? null;
}

/** Карточка сделки: лента, задачи, звонки, переписка, клиент и его книги, заказ. */
export async function dealCard(deal: { id: string; clientId: string | null; orderId: string | null }, sections: { calls: boolean; chats: boolean }) {
  const db = executor();
  const [noteRows, taskRows, callRows, convs, [client], [order], bookRows] = await Promise.all([
    db.select().from(crmNotes).where(eq(crmNotes.dealId, deal.id)).orderBy(desc(crmNotes.createdAt)).limit(100),
    db.select().from(crmTasks).where(eq(crmTasks.dealId, deal.id)).orderBy(sql`${crmTasks.doneAt} nulls first`, asc(crmTasks.dueAt)),
    sections.calls ? db.select().from(crmCalls).where(eq(crmCalls.dealId, deal.id)).orderBy(desc(crmCalls.startedAt)).limit(30) : Promise.resolve([]),
    sections.chats ? db.select().from(crmConversations).where(eq(crmConversations.dealId, deal.id)).orderBy(desc(crmConversations.lastMessageAt)) : Promise.resolve([]),
    deal.clientId ? db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, lastSeenAt: users.lastSeenAt }).from(users).where(eq(users.id, deal.clientId)).limit(1) : Promise.resolve([]),
    deal.orderId ? db.select({ id: orders.id, number: orders.number, status: orders.status, amount: orders.amount }).from(orders).where(eq(orders.id, deal.orderId)).limit(1) : Promise.resolve([]),
    deal.clientId
      ? db
          .select({
            id: books.id,
            title: books.title,
            recipientName: books.recipientName,
            status: books.status,
            updatedAt: books.updatedAt,
            answered: sql<number>`(select count(*)::int from ${bookQuestions} q where q.book_id = ${booksId} and length(trim(q.answer)) > 0)`,
            total: sql<number>`(select count(*)::int from ${bookQuestions} q where q.book_id = ${booksId})`,
            photos: sql<number>`(select count(*)::int from ${photos} p where p.book_id = ${booksId})`,
          })
          .from(books)
          .where(eq(books.userId, deal.clientId))
          .orderBy(desc(books.updatedAt))
          .limit(3)
      : Promise.resolve([]),
  ]);
  return { noteRows, taskRows, callRows, convs, client: client ?? null, order: order ?? null, bookRows };
}

/** Клиент, которого предлагаем привязать к сделке (нашёлся по телефону). */
export async function clientBrief(id: string) {
  const [u] = await executor().select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, id)).limit(1);
  return u ?? null;
}
