import "server-only";
import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { bookQuestions, books, crmNotes, emailLog, orderEvents, orders, users } from "@/shared/infrastructure/db/schema";
import { booksId } from "@/shared/infrastructure/db/refs";
import { executor } from "@/shared/infrastructure/database";
import type { ClientTimeline, EmailJournal, LifecycleSource, Recipient, RecipientRepository } from "../application";

const recipientCols = { id: users.id, email: users.email, name: users.name, locale: users.locale, remindedAt: users.remindedAt };
const answered = sql<number>`(select count(*)::int from ${bookQuestions} q where q.book_id = ${booksId} and length(trim(q.answer)) > 0)`;
const firstEmpty = sql<number | null>`(select min(q.position) from ${bookQuestions} q where q.book_id = ${booksId} and length(trim(q.answer)) = 0)`;

export class DrizzleLifecycleSource implements LifecycleSource {
  async draftCandidates(createdBefore: Date) {
    const rows = await executor()
      .select({
        recipient: recipientCols,
        bookId: books.id,
        title: books.title,
        occasion: books.occasion,
        occasionDate: books.occasionDate,
        updatedAt: books.updatedAt,
        answered,
        firstEmpty,
        hasOrder: sql<boolean>`exists(select 1 from ${orders} o where o.book_id = ${booksId} and o.status <> 'cancelled')`,
      })
      .from(books)
      .innerJoin(users, eq(users.id, books.userId))
      .where(and(eq(books.status, "draft"), eq(users.emailOptOut, false), eq(users.role, "user"), lte(books.createdAt, createdBefore)))
      .limit(500);
    return rows.map(({ recipient, ...b }) => ({ recipient, book: { ...b, remindedAt: recipient.remindedAt } }));
  }

  async unpaidOrders(createdBefore: Date) {
    const rows = await executor()
      .select({ recipient: recipientCols, orderId: orders.id, number: orders.number, amount: orders.amount, contactEmail: orders.contactEmail })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .where(and(eq(orders.status, "pending_payment"), isNull(orders.paymentClaimedAt), lte(orders.createdAt, createdBefore), eq(users.emailOptOut, false)))
      .limit(100);
    return rows;
  }

  async deliveredOrders(deliveredBefore: Date) {
    return executor()
      .select({ recipient: recipientCols, orderId: orders.id, number: orders.number, amount: orders.amount, contactEmail: orders.contactEmail })
      .from(orderEvents)
      .innerJoin(orders, eq(orders.id, orderEvents.orderId))
      .innerJoin(users, eq(users.id, orders.userId))
      .where(and(eq(orderEvents.status, "delivered"), eq(orders.status, "delivered"), lte(orderEvents.createdAt, deliveredBefore), eq(users.emailOptOut, false)))
      .limit(100);
  }

  async latestDraft(userId: string) {
    const [book] = await executor()
      .select({ bookId: books.id, title: books.title, answered, total: sql<number>`(select count(*)::int from ${bookQuestions} q where q.book_id = ${booksId})`, firstEmpty })
      .from(books)
      .where(and(eq(books.userId, userId), eq(books.status, "draft")))
      .orderBy(desc(books.updatedAt))
      .limit(1);
    return book ?? null;
  }
}

export class DrizzleEmailJournal implements EmailJournal {
  async claim(userId: string, key: string) {
    const rows = await executor().insert(emailLog).values({ userId, key }).onConflictDoNothing().returning({ id: emailLog.id });
    return rows.length > 0;
  }
}

export class DrizzleRecipients implements RecipientRepository {
  async find(userId: string): Promise<Recipient | null> {
    const [r] = await executor().select(recipientCols).from(users).where(eq(users.id, userId)).limit(1);
    return r ?? null;
  }
  async markReminded(userId: string, at: Date) {
    await executor().update(users).set({ remindedAt: at }).where(eq(users.id, userId));
  }
  async optOut(userId: string) {
    await executor().update(users).set({ emailOptOut: true }).where(eq(users.id, userId));
  }
}

/** Лента клиента в CRM (заметка вида «письмо»). */
export const crmTimeline: ClientTimeline = {
  async emailSent(clientId, authorId, note) {
    await executor().insert(crmNotes).values({ clientId, authorId, kind: "email", text: note });
  },
};
